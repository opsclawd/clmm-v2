---
title: "ops: Deploy migration ordering + schema readiness gate"
type: ops
status: draft
date: 2026-05-02
issue: https://github.com/opsclawd/clmm-v2/issues/58
related_pr: https://github.com/opsclawd/clmm-v2/pull/57
---

# Deploy Migration Ordering + Schema Readiness Gate

## Background

PR #57 added the `wallet_challenges` table for the wallet ownership proof flow. The Railway API deploy succeeded and started serving traffic before the production database migration ran. `POST /wallets/:walletId/challenge` returned `relation "wallet_challenges" does not exist`, which the frontend collapsed into `NETWORK_ERROR`, blocking wallet verification.

The repo has the migration script (`pnpm db:migrate` → `drizzle-kit migrate`), but the production deploy does not guarantee migrations run before API traffic starts, and neither the API nor the worker refuses to operate against a database with missing schema.

## Goal

Eliminate the deploy-order race so that schema drift becomes a loud, recoverable deploy failure instead of a silent user-facing wallet-auth failure.

Three independent guarantees, ordered by when they activate during a deploy:

1. **Migrations run before the API serves traffic.** Owned by Railway's `preDeployCommand` on the API service. Single migration owner; the worker does not migrate.
2. **API refuses to serve traffic against missing schema.** `/health` queries the database for the existence of every table defined in the Drizzle schema. Missing tables → `503` with the missing list. Railway healthcheck loops until the migration catches up.
3. **Worker refuses to start against missing schema.** Same readiness check, run at worker bootstrap before any pg-boss listeners attach. Missing tables → fatal log + `process.exit(1)`. Railway restart loop keeps the worker offline until the API's migration catches up.

The single source of truth for "what tables must exist" is `packages/adapters/src/outbound/storage/schema/index.ts`. Both `db.ts` (Drizzle ORM registration) and the new readiness module consume the same export. No second list. Drift is structurally impossible.

## Scope

**In scope:**

1. New `start:api` script in `@clmm/adapters`.
2. Per-service committed Railway config (Path A) or documented dashboard config (Path B fallback) for the CLMM API and worker services.
3. `SchemaReadiness` library: derives required tables from the Drizzle schema; one-round-trip `information_schema.tables` query.
4. `HealthController` schema-aware: `503 { status: 'not_ready', missing: [...] }` on missing schema.
5. Worker `main.ts` startup gate: refuse to start against missing schema; structured fatal log + `process.exit(1)`.
6. Refactor of `db.ts` to consume `schema/index.ts`; re-export `schema` for downstream consumers.
7. New `docs/runbooks/railway-deploy.md`; README link; release-checklist additions.

**Out of scope (carved into separate follow-up issues):**

- **Frontend error mapping.** Splitting `NETWORK_ERROR` into `HTTP_404`, `HTTP_500`, `MALFORMED_RESPONSE`, and true `NETWORK_ERROR`. Real issue, separate client behavior, expanding review surface here adds no value. Tracked as a follow-up issue (link from PR description).
- **Column-level schema drift detection.** This spec gates on table existence only. Migrations that alter columns or indexes without adding tables can still drift silently. If that surfaces as a real bug, address with a separate "migration journal verification" mechanism in a future PR.
- **Drizzle migration journal verification.** Same reasoning. Out of scope; revisit only if column-level drift causes a real incident.
- **`READINESS_REQUIRED_TABLES` env var or any allowlist override.** Explicitly disallowed: it lets us accidentally weaken the gate in production.

## Non-goals (will not change)

- `packages/domain` — unchanged.
- `packages/application` — unchanged.
- `WorkerModule.ts`, `WorkerLifecycle.ts` — unchanged. The worker gate lives in `main.ts` to fire before any module wiring.
- `apps/app/**` — unchanged. Frontend error mapping is a separate issue.
- The existing `dev:api` and `dev:worker` scripts — unchanged. New `start:api` is additive.

---

## Architecture

### Three guarantees

```
Railway deploy (API service)
  ├─ preDeployCommand: pnpm --filter @clmm/adapters db:migrate     ← Guarantee 1
  └─ startCommand:     pnpm --filter @clmm/adapters start:api
                       ├─ Nest boots, listens on :PORT
                       └─ /health checks schema readiness          ← Guarantee 2
                          - 200 ok        → Railway routes traffic
                          - 503 not_ready → Railway holds traffic, retries

Railway deploy (worker service)
  └─ startCommand:     pnpm --filter @clmm/adapters start:worker
                       ├─ Pre-Nest schema readiness gate           ← Guarantee 3
                       │  - ready    → NestFactory.createApplicationContext(WorkerModule)
                       │  - missing  → fatal log, process.exit(1), Railway restarts
                       └─ pg-boss starts only after gate passes
```

### Single source of truth

```
packages/adapters/src/outbound/storage/schema/index.ts
  └─ export * from each schema module  (already exists)

  consumed by:
    ├─ db.ts                         → drizzle({ schema })
    ├─ HealthController.ts           → checkSchemaReadiness(db, schema)
    └─ inbound/jobs/main.ts          → checkSchemaReadiness(gateDb, schema)
```

`db.ts` re-exports `schema` so consumers have a single import path: `import { createDb, schema } from '...storage/db.js'`.

---

## Detailed design

### 1. `start:api` script

`packages/adapters/package.json`:

```json
{
  "scripts": {
    "start:api": "node dist/inbound/http/main.js",
    "start:worker": "node dist/inbound/jobs/main.js"
  }
}
```

**Risk to verify:** `packages/adapters/src/inbound/http/main.ts` uses `if (require.main === module)` (CJS-only). The implementer must verify the production tsconfig emits CJS, or replace the guard with the ESM-safe equivalent. If not verified, `node dist/inbound/http/main.js` will silently load the module without invoking `bootstrap()`, and the API will exit 0 immediately on Railway.

### 2. Railway config

**Decision rule (binding on the implementer):**

Before adding any config file, verify in the Railway dashboard:
- (i) The CLMM project has a single API service and a single worker service (no environment-specific service forks that would conflict with one shared file).
- (ii) Railway is configured to read service-scoped config from this repo (per-service config-file path settable, OR a root `railway.toml` is routed by service name).

If both are true → **Path A**. If either fails → **Path B**, and the PR description must explicitly state which check failed.

#### Path A — committed per-service config

`packages/adapters/railway.api.toml`:

```toml
[deploy]
preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"
startCommand     = "pnpm --filter @clmm/adapters start:api"
healthcheckPath  = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
```

`packages/adapters/railway.worker.toml`:

```toml
[deploy]
# Worker MUST NOT run migrations. The API service is the sole migration owner.
# Worker startup performs a schema readiness check and exits non-zero on missing schema.
startCommand     = "pnpm --filter @clmm/adapters start:worker"
restartPolicyType = "ON_FAILURE"
```

In the Railway dashboard, each service's "Config-as-code path" is set to point at its respective file. The runbook documents which dashboard fields are now owned by these files; operators must not hand-edit them.

#### Path B — dashboard-only fallback

No config file added. `docs/runbooks/railway-deploy.md` instead contains a "Dashboard settings (CLMM API)" and "Dashboard settings (CLMM worker)" section with the exact commands above and explicit values for each Railway field. The PR description states: *"Path A blocked because <reason>. Reverting to Path B until <condition>."*

### 3. Schema readiness library

**New file:** `packages/adapters/src/outbound/storage/SchemaReadiness.ts`

```ts
import { is, getTableName, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from './db.js';

export type SchemaReadinessResult =
  | { ready: true }
  | { ready: false; missing: string[] };

export async function checkSchemaReadiness(
  db: Db,
  schemaNamespace: Record<string, unknown>,
): Promise<SchemaReadinessResult> {
  const expected = Object.values(schemaNamespace)
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => getTableName(t));

  if (expected.length === 0) return { ready: true };

  const rows = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY(${expected})
  `);

  const present = new Set(rows.map((r) => r.table_name));
  const missing = expected.filter((t) => !present.has(t)).sort();

  return missing.length === 0 ? { ready: true } : { ready: false, missing };
}
```

**Properties:**

- One round-trip query.
- `is(value, PgTable)` correctly skips non-table exports (relations, types, helpers) from `export *`.
- Returns the missing list (not just a boolean) — required for "fail loudly" logging and the `503` body.
- No caching. The check runs on every `/health` invocation; sub-millisecond against the existing connection pool. Caching introduces invalidation questions we don't need.
- The `schemaNamespace` parameter is passed in (not hard-imported) so unit tests can construct fixture namespaces.

The exact `db.execute(sql\`...\`)` invocation may need adjustment to match `drizzle-orm/postgres-js`'s actual API surface; the implementer chooses the equivalent that returns row arrays for a parameterized query. The contract above is what matters.

### 4. `db.ts` refactor

`packages/adapters/src/outbound/storage/db.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres = require('postgres');
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
```

Drops the nine individual namespace imports. `schema/index.ts` (already present, already does `export *` from every schema module) is now the single source of truth. The `export { schema }` re-export gives downstream consumers a single import path.

### 5. API integration

`packages/adapters/src/inbound/http/HealthController.ts`:

```ts
import {
  Controller, Get, HttpException, HttpStatus, Inject,
} from '@nestjs/common';
import { checkSchemaReadiness } from '../../outbound/storage/SchemaReadiness.js';
import { schema, type Db } from '../../outbound/storage/db.js';
import { DB_TOKEN } from '../tokens.js';

@Controller()
export class HealthController {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  @Get('health')
  async health() {
    const result = await checkSchemaReadiness(this.db, schema);
    if (result.ready) return { status: 'ok' };
    throw new HttpException(
      { status: 'not_ready', missing: result.missing },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
```

**Contract:**
- `200 { status: 'ok' }` — schema verified.
- `503 { status: 'not_ready', missing: ['wallet_challenges', ...] }` — at least one table missing.

Railway healthcheck retries until 200. `restartPolicyType = ON_FAILURE` means a 503-answering pod stays up; Railway just keeps marking it unhealthy until schema lands. A running process is not torn down for a recoverable schema lag.

`main.ts` (`http/main.ts`) is unchanged. The API process is allowed to start with missing schema so `/health` can answer 503 deterministically. This is the **opposite** policy from the worker (next section). The asymmetry is intentional: the API needs to be reachable to answer `/health`; the worker has no equivalent inbound contract.

**Risk to verify:** `tokens.ts` may not currently expose a `DB_TOKEN`. The implementer must confirm. If absent, add the binding (existing storage adapters already consume a `Db` provider somewhere in the DI graph, so the wiring exists; this is a re-use, not a new provider).

### 6. Worker integration

`packages/adapters/src/inbound/jobs/main.ts`:

```ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './WorkerModule.js';
import { createDb, schema } from '../../outbound/storage/db.js';
import { checkSchemaReadiness } from '../../outbound/storage/SchemaReadiness.js';

export async function bootstrap(): Promise<void> {
  const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    console.error(JSON.stringify({
      level: 'fatal',
      message: 'Worker: DATABASE_URL not set',
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  }

  const gateDb = createDb(dbUrl);
  const readiness = await checkSchemaReadiness(gateDb, schema);
  if (!readiness.ready) {
    console.error(JSON.stringify({
      level: 'fatal',
      message: 'Worker: schema readiness check failed; refusing to start',
      missing: readiness.missing,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(WorkerModule);

  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`Worker received ${signal}, shutting down...`);
      void app.close().finally(() => { process.exit(0); });
    });
  }

  console.log('Worker: schema readiness OK; pg-boss starting');
}

void bootstrap();
```

**Why the gate lives in `main.ts` and not in `WorkerLifecycle.onModuleInit`:**

- `WorkerModule` instantiates pg-boss at module-evaluation time (`WorkerModule.ts:15`), and `AdaptersModule` likely creates its own DB pool on import. A gate inside `OnModuleInit` would already have those wired up.
- A pre-Nest gate is cleaner: a *throwaway* `Db` from the same `DATABASE_URL`, the readiness check, and `process.exit(1)` on failure. The full worker stack never initializes on a bad deploy.
- Throwaway DB connection: closed implicitly when the process exits on failure; on success it stays open until process exit, which is fine — Postgres handles idle connections cheaply.

**Failure mode:** structured JSON log (matching the existing format in `WorkerLifecycle.ts:49-56`) + `process.exit(1)`. Railway's `restartPolicyType = ON_FAILURE` restarts; the restart hits the same gate; the loop continues until the API's `preDeployCommand` runs migrations and the schema appears.

`bootstrap` is `export`ed (matching `http/main.ts:7`) so `main.test.ts` can drive it without spawning a child process.

`WorkerModule.ts` and `WorkerLifecycle.ts` are unchanged.

---

## Documentation

### 7. New: `docs/runbooks/railway-deploy.md`

Sections:

- **Service topology.** Two Railway services: `clmm-api`, `clmm-worker`. Both deploy from this repo. API owns migrations.
- **Config-as-code (Path A) or dashboard-only (Path B).** States which path was taken in this PR; links the committed `.toml` files when Path A. When Path B, embeds the field-by-field dashboard settings.
- **Locked dashboard fields (Path A only).**
  - API: `preDeployCommand`, `startCommand`, `healthcheckPath`, `healthcheckTimeout`, `restartPolicyType`.
  - Worker: `startCommand`, `restartPolicyType`.
- **Deploy ordering contract.** The five-step sequence: build → migrate (preDeploy on API) → API healthcheck → worker startup gate → both healthy. Includes a small ASCII timeline.
- **Schema readiness behavior.**
  - API `/health` returns `503 { status: 'not_ready', missing: [...] }` on missing tables. Railway healthcheck loops; no traffic routed to the pod.
  - Worker exits non-zero. Railway restarts. Loop continues until migration lands.
  - Both probes derive their list from `packages/adapters/src/outbound/storage/schema/index.ts`. Adding a schema file without a corresponding migration *will* fail deploys — this is the intended behavior.
- **Manual post-deploy verification.**
  - `curl -i $BFF_BASE_URL/health` → `200 {"status":"ok"}`.
  - `curl -i -X POST $BFF_BASE_URL/wallets/<valid-wallet-address>/challenge` → `200` with the challenge payload.
- **Rollback.** Drizzle does not auto-down. To revert: write a new forward migration that undoes the change, commit, redeploy. The new deploy's `preDeployCommand` runs it.
- **Anti-patterns.** Do **not** prepend `pnpm db:migrate &&` to runtime start commands (replica races, restart-loop schema mutation, healthcheck loops on long migrations).

### 8. README.md

Extend the existing Railway-secrets section near line 65 with a "Deploy" subsection:
- Two-line summary of the migration ownership rule.
- Link to `docs/runbooks/railway-deploy.md` as the source of truth.

No duplication. README points; runbook owns.

### 9. `docs/architecture/release-checklist.md`

Append a new section "Deploy / Schema Readiness":

```
- [ ] API service Railway config has preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"
- [ ] API service Railway config has startCommand = "pnpm --filter @clmm/adapters start:api" (not dev:api)
- [ ] Worker service Railway config has no preDeployCommand
- [ ] GET /health returns 503 when any schema table is missing in the target DB
- [ ] Worker exits non-zero when schema is missing
- [ ] wallet_challenges table exists in production DB after deploy
```

### 10. Out of scope (docs)

- No edits to `docs/setup.md` (local-dev / worktree setup, not deploy).
- No edits to `docs/plans/2026-04-19-002-...deploy-runbook-plan.md` (regime-engine-specific).
- No new `docs/decisions/` ADR (rationale lives in this design + the runbook).

---

## Tests

| File | Change | Coverage |
|---|---|---|
| `packages/adapters/src/outbound/storage/SchemaReadiness.test.ts` | New | Integration: `ready: true` against migrated test DB; `ready: false` with correct `missing` after dropping a table in a transaction; filters non-table exports given a fixture namespace; empty namespace returns `ready: true` |
| `packages/adapters/src/outbound/storage/db.test.ts` | Modify | Verify the refactored `createDb` still wires every table from `schema/index.ts` (e.g., assert `Object.keys(db._.fullSchema)` contains every expected table name) |
| `packages/adapters/src/inbound/http/HealthController.test.ts` | Modify | `200 { status: 'ok' }` when readiness returns ready; `503 { status: 'not_ready', missing: [...] }` when readiness returns not-ready; readiness DB error bubbles up as a 503 |
| `packages/adapters/src/inbound/jobs/main.test.ts` | Modify | Gate passes → `NestFactory.createApplicationContext` invoked; gate fails → `process.exit(1)` invoked with the structured fatal log; missing `DATABASE_URL` → fatal log + exit |

Integration tests use the same Postgres test instance the existing storage adapter tests use. No mocks of `pg` or Drizzle.

---

## Acceptance criteria

- [ ] `@clmm/adapters` has `start:api` script: `node dist/inbound/http/main.js`.
- [ ] CommonJS-vs-ESM compatibility of `dist/inbound/http/main.js` confirmed; `if (require.main === module)` guard fires under the production build (or replaced with ESM-safe equivalent).
- [ ] Path A (committed config) shipped, OR Path B fallback shipped with explicit reason in the PR description.
- [ ] If Path A: `packages/adapters/railway.api.toml` and `packages/adapters/railway.worker.toml` exist; API has `preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"`; worker has no `preDeployCommand`.
- [ ] `db.ts` consumes `schema/index.ts`; `schema/index.ts` is the single source of truth for the required-table list.
- [ ] `SchemaReadiness.ts` exports `checkSchemaReadiness(db, schemaNamespace)`; uses Drizzle's `is(value, PgTable)` + `getTableName`; one round-trip query.
- [ ] `GET /health` returns `503 { status: 'not_ready', missing: [...] }` on missing schema; `200 { status: 'ok' }` otherwise.
- [ ] Worker `main.ts` runs the gate before `NestFactory.createApplicationContext`; structured fatal log + `process.exit(1)` on missing schema or unset `DATABASE_URL`.
- [ ] No `READINESS_REQUIRED_TABLES` env var or hardcoded allowlist exists in production code paths.
- [ ] `docs/runbooks/railway-deploy.md` exists and documents the deploy ordering contract, locked dashboard fields, and rollback path.
- [ ] README.md links to the new runbook.
- [ ] `docs/architecture/release-checklist.md` has the new "Deploy / Schema Readiness" section.
- [ ] Manual post-deploy: `curl -i $BFF_BASE_URL/health` returns `200`; `POST /wallets/<addr>/challenge` returns `200`.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` all green.
- [ ] Frontend `NETWORK_ERROR` error mapping is **not** in this PR; tracked as a separate follow-up issue (linked from PR description).

---

## File-level summary

**New:**
- `packages/adapters/src/outbound/storage/SchemaReadiness.ts`
- `packages/adapters/src/outbound/storage/SchemaReadiness.test.ts`
- `packages/adapters/railway.api.toml` *(Path A only)*
- `packages/adapters/railway.worker.toml` *(Path A only)*
- `docs/runbooks/railway-deploy.md`

**Modified:**
- `packages/adapters/package.json` — add `start:api`
- `packages/adapters/src/outbound/storage/db.ts` — consume `schema/index.ts`, re-export `schema`
- `packages/adapters/src/outbound/storage/db.test.ts` — verify refactor
- `packages/adapters/src/inbound/http/HealthController.ts` — schema-aware
- `packages/adapters/src/inbound/http/HealthController.test.ts` — extended
- `packages/adapters/src/inbound/jobs/main.ts` — gate before Nest bootstrap; export `bootstrap`
- `packages/adapters/src/inbound/jobs/main.test.ts` — gate test
- `README.md` — link to runbook
- `docs/architecture/release-checklist.md` — new "Deploy / Schema Readiness" section

**Total: 9–11 files** (Path A) or **7–9 files** (Path B fallback).

---

## Risks called out for the implementer

- **CJS/ESM in `http/main.ts`.** The current `if (require.main === module)` guard is CJS-only. `node dist/inbound/http/main.js` must invoke `bootstrap()`. Verify or fix.
- **`DB_TOKEN` provider for `HealthController`.** Confirm the token exists in `tokens.ts` and that the binding is wired in `AppModule`. Reuse, don't re-create.
- **Path A verification.** Inspect the actual Railway project before committing config files. If verification cannot be done, take Path B and call it out in the PR description.

---

## Follow-up issues (separate, do not include in this PR)

- **Frontend error mapping.** Split `NETWORK_ERROR` into `HTTP_404`, `HTTP_500`, `MALFORMED_RESPONSE`, true `NETWORK_ERROR`. Original issue calls this out as "follow-up client hardening." File as a new issue and link from this PR's description.
