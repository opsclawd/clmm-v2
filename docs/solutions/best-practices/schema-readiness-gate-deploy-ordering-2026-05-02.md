---
title: "Schema Readiness Gate for Deploy-Order Safety"
date: 2026-05-02
issue: 58
problem_type: best_practice
category: best-practices
related_docs:
  - database-issues/notification-events-migration-and-deliveredat-fix-2026-04-14
  - integration-issues/pg-boss-tolerant-startup-bff-2026-04-23
tags: [deploy, drizzle, railway, schema-readiness, migration-ordering, nestjs, defense-in-depth]
---

## Context

PR #57 added `wallet_challenges` table to the Drizzle schema. Railway deployed API and worker containers concurrently — no mechanism ensured migrations ran before traffic arrived. `POST /wallets/:walletId/challenge` hit a missing relation, returning `relation "wallet_challenges" does not exist`, which the frontend collapsed into a generic `NETWORK_ERROR`. Root cause: deploy-order race with zero runtime visibility into schema readiness.

## Guidance

The solution is three independent guarantees, each working alone:

1. **Migration-before-traffic:** API service owns migrations via Railway `preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"`. Worker MUST NOT run migrations.

2. **API healthcheck gate:** `GET /health` calls `checkSchemaReadiness(db, schema)` which derives expected tables via Drizzle's `is(value, PgTable)` + `getTableName`, queries `information_schema.tables` in one round-trip, and returns `503 { status: 'not_ready', missing: [...] }` when any table is absent. Railway healthcheck retries until 200.

3. **Worker pre-boot gate:** `main.ts` runs the same `checkSchemaReadiness` before `NestFactory.createApplicationContext`. Missing schema → structured fatal JSON log + `process.exit(1)`. Railway restart-loops until API migrates.

Key design decisions:

- **Single source of truth:** `import * as schema from './schema/index.js'` in `db.ts`. Both healthcheck and worker gate consume the same schema object. Expected-table list is derived at runtime, never maintained by hand.
- **No caching, no env-var override, no hardcoded allowlist.** The check is cheap (one query). Caching introduces stale-state risk. Env-var overrides create hidden production divergence. Allowlists reintroduce the exact drift this pattern prevents.
- **Worker gate runs BEFORE NestFactory.** Prevents any NestJS module (pg-boss, listeners) from touching a half-migrated DB.
- **DB DI token** (`@Inject(DB)`) keeps HealthController testable — inject mock `Db` rather than importing a singleton.

## Why This Matters

Without this pattern, schema drift is a silent user-facing error. Adding a Drizzle schema file without a matching migration causes undefined behavior at runtime with no deploy-time signal. This pattern makes drift a **loud deploy failure** — either a 503 healthcheck loop or a worker crash loop, both with the exact missing table names in logs.

Three anti-patterns are explicitly rejected:

- `db:migrate && node dist/...` as start command → replica race, every restart = migration attempt
- Worker running migrate "as backup" → defeats single-owner rule
- Hardcoded `REQUIRED_TABLES` allowlist → reintroduces human-forgetfulness drift

## When to Apply

- Any multi-service system where services share a database and deploy independently
- Any time a new Drizzle schema file is added — the gate will fail deploys until a migration is generated and run
- Any new worker/service added to the Railway project — it MUST implement the pre-boot gate
- Complements (does not replace) `pg-boss-tolerant-startup` — that handles transient runtime connection failures; this handles deploy-order schema absence

## Examples

**SchemaReadiness.ts** (`packages/adapters/src/outbound/storage/SchemaReadiness.ts`):

```ts
const expected = Object.values(schemaNamespace)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableName(table));

if (expected.length === 0) return { ready: true };

// IMPORTANT: Use sql.join() to produce IN ($1, $2, $3) with individual params.
// Do NOT use IN (${expected}) or ANY(${expected}) — Drizzle's sql template
// wraps JS arrays as row constructors ($1, $2, $3) producing IN (($1, $2, ...))
// which PostgreSQL rejects as "operator does not exist: sql_identifier = record".
const tableParams = expected.map((name) => sql`${name}`);
const rows = await db.execute<{ table_name: string }>(sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = current_schema()
    AND table_name IN (${sql.join(tableParams, sql`, `)})
`);
const present = new Set(rows.map((row) => row.table_name));
const missing = expected.filter((t) => !present.has(t)).sort();
```

**Worker gate** (`packages/adapters/src/inbound/jobs/main.ts`):

```ts
export async function bootstrap(): Promise<void> {
  const gateDb = createDb(dbUrl);
  const readiness = await checkSchemaReadiness(gateDb, schema);
  if (!readiness.ready) {
    console.error(JSON.stringify({ level: 'fatal', message: '...', missing: readiness.missing }));
    process.exit(1);
    return; // required for tests where exit is mocked
  }
  const app = await NestFactory.createApplicationContext(WorkerModule);
}
```

**HealthController** (`packages/adapters/src/inbound/http/HealthController.ts`):

```ts
@Get('health')
async health(): Promise<{ status: 'ok' }> {
  const result = await checkSchemaReadiness(this.db, schema);
  if (result.ready) return { status: 'ok' };
  throw new HttpException({ status: 'not_ready', missing: result.missing }, HttpStatus.SERVICE_UNAVAILABLE);
}
```

**Railway config** (`packages/adapters/railway.api.toml`):

```toml
[deploy]
preDeployCommand   = "pnpm --filter @clmm/adapters db:migrate"
startCommand       = "pnpm --filter @clmm/adapters start:api"
healthcheckPath    = "/health"
healthcheckTimeout = 30
restartPolicyType  = "ON_FAILURE"
```
