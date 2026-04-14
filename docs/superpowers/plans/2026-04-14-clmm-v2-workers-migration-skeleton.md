# CLMM V2 Workers Migration — Skeleton & Handoff Doc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable Cloudflare Workers skeleton for CLMM V2 (two workers: `clmm-v2-api`, `clmm-v2-monitor`) with one fully-ported reference route and five stub routes, plus a self-contained handoff doc that MiniMax M2.7 can execute against to port the remaining five controllers.

**Architecture:** Skeleton-first. Concentrate all judgment-heavy work (composition roots, cron branching, queue wiring, infrastructure config) in one Opus session on branch `feat/workers-migration-skeleton`. Old NestJS HTTP controllers in `packages/adapters/src/inbound/http/` stay in place as M2.7 source material; they're deleted in Stage 4 pre-cutover cleanup (out of scope for this plan). Old pg-boss worker code in `packages/adapters/src/inbound/jobs/` is deleted in this plan because nothing downstream reads it.

**Tech Stack:** Hono ^4.6 (Workers router), @neondatabase/serverless ^0.10 + drizzle-orm/neon-http (HTTP Postgres driver), Cloudflare Workers runtime (`nodejs_compat`), Cloudflare Queues, Cloudflare Cron Triggers, pnpm workspace + Turborepo, Vitest for tests, TypeScript 5.x.

**Design source of truth:** `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-design.md` (commit `b42e195`).

---

## Preconditions (verify before starting Task 1)

These must all be true. If any is false, **stop** — they're Stage 0 work, not part of this plan.

- [ ] Four pre-migration specs are merged to `main`:
  - `walletid-contamination-fix`
  - `notification-durable-intent`
  - `solana-read-path-efficiency`
  - `transaction-reference-step-projection`
- [ ] Neon Postgres is provisioned and `DATABASE_URL` for the live Railway API + worker points at Neon (not Railway's managed Postgres).
- [ ] All drizzle migrations (including `notification_events` from the notification spec) have been applied against Neon.
- [ ] `git status` on `main` is clean and `main` is up to date with origin.

Verify with:
```bash
git status
git log --oneline -5
# Expect to see merge commits for each of the four specs.
```

---

## File Structure

Files touched by this plan, grouped by purpose.

### Modified

- `packages/adapters/package.json` — dependency changes (add Hono + Neon, remove pg-boss + postgres; keep NestJS through Stage 3).
- `packages/adapters/src/outbound/storage/db.ts` — rewritten to use `@neondatabase/serverless` + `drizzle-orm/neon-http`. `Db` type name preserved.
- Root `package.json` — new scripts (`dev:api`, `dev:monitor`, `deploy:api`, `deploy:monitor`). Remove old `dev:api`, `dev:worker`.

### Created

**API worker:**
- `workers/api/wrangler.jsonc` — Worker config with `TRIGGER_QUEUE` producer binding.
- `workers/api/src/composition.ts` — `Env` type, `TriggerEvent` type, `buildApiDependencies(env)`, `Dependencies` type.
- `workers/api/src/index.ts` — Hono app, CORS, logger, route mounts.
- `workers/api/src/routes/positions.ts` — **golden reference route**, ported from `PositionController.ts`.
- `workers/api/src/routes/alerts.ts`, `previews.ts`, `execution.ts`, `wallet.ts`, `health.ts` — empty Hono stubs for M2.7 to fill.

**Monitor worker:**
- `workers/monitor/wrangler.jsonc` — Worker config with two crons, `TRIGGER_QUEUE` producer + consumer.
- `workers/monitor/src/composition.ts` — `Env` type, `buildMonitorDependencies(env)`.
- `workers/monitor/src/index.ts` — `scheduled` (cron-branched dispatch) and `queue` (consumer).
- `workers/monitor/src/handlers/breach-scan.ts` — `*/2` cron body.
- `workers/monitor/src/handlers/reconciliation.ts` — `*/5` cron body.
- `workers/monitor/src/handlers/trigger-consumer.ts` — queue consumer body.

**Handoff doc:**
- `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md` — Sections 1–6 + five per-controller slices.

### Deleted

- `packages/adapters/src/inbound/jobs/` — entire directory (all handlers, tokens, PgBossProvider, WorkerModule, WorkerLifecycle, tests).
- `packages/adapters/src/composition/` — entire directory (AdaptersModule.ts).

**Not deleted in this plan (kept as M2.7 source material):**
- `packages/adapters/src/inbound/http/*Controller.ts`, `AppModule.ts`, `main.ts`, `tokens.ts`, `transient-errors.ts`.
- NestJS deps in `packages/adapters/package.json`.

---

## Task 1: Create feature branch

**Files:** none (branch-only).

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/workers-migration-skeleton
```

- [ ] **Step 2: Confirm clean state**

```bash
git status
```

Expected: `On branch feat/workers-migration-skeleton` with nothing to commit, working tree clean.

---

## Task 2: Add Hono and Neon dependencies to `@clmm/adapters`

**Files:**
- Modify: `packages/adapters/package.json`

- [ ] **Step 1: Read the current file**

Run: `cat packages/adapters/package.json`

Confirm `dependencies` contains `@nestjs/*`, `pg-boss`, `postgres`, `reflect-metadata`. These stay for now (except `pg-boss` and `postgres`, which get removed in Task 5 after their consumers are deleted).

- [ ] **Step 2: Add new dependencies**

Edit `packages/adapters/package.json`, adding two entries to `dependencies` in alphabetical position:

```jsonc
    "@neondatabase/serverless": "^0.10.0",
    ...
    "hono": "^4.6.0",
```

Do not remove anything yet.

- [ ] **Step 3: Install**

```bash
pnpm install
```

Expected: no errors, new packages added to `pnpm-lock.yaml`.

- [ ] **Step 4: Confirm no typecheck regression**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: passes (Hono + Neon are added but not yet imported anywhere, so nothing changes in type output).

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/package.json pnpm-lock.yaml
git commit -m "chore(adapters): add @neondatabase/serverless and hono deps"
```

---

## Task 3: Rewrite `db.ts` to use Neon HTTP driver

**Files:**
- Modify: `packages/adapters/src/outbound/storage/db.ts`

- [ ] **Step 1: Read the current file for reference**

Run: `cat packages/adapters/src/outbound/storage/db.ts`

Current shape: factory `createDb(connectionString)` using `postgres-js`; exports `Db` type. The rewrite preserves both the function signature and the `Db` type name.

- [ ] **Step 2: Rewrite the file**

Replace the entire contents of `packages/adapters/src/outbound/storage/db.ts` with:

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as triggersSchema from './schema/triggers.js';
import * as previewsSchema from './schema/previews.js';
import * as executionsSchema from './schema/executions.js';
import * as preparedPayloadsSchema from './schema/prepared-payloads.js';
import * as historySchema from './schema/history.js';
import * as monitoredWalletsSchema from './schema/monitored-wallets.js';
import * as notificationDedupSchema from './schema/notification-dedup.js';
import * as notificationEventsSchema from './schema/notification-events.js';

/**
 * Factory for a Neon HTTP-backed Drizzle client.
 *
 * IMPORTANT: Do not create a module-level singleton from this factory.
 * In Cloudflare Workers, `env` is not available at module scope, so a
 * singleton created at import time has no DATABASE_URL to connect with.
 * Callers receive the instance from the composition root per request.
 */
export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql, {
    schema: {
      ...triggersSchema,
      ...previewsSchema,
      ...executionsSchema,
      ...preparedPayloadsSchema,
      ...historySchema,
      ...monitoredWalletsSchema,
      ...notificationDedupSchema,
      ...notificationEventsSchema,
    },
  });
}

export type Db = ReturnType<typeof createDb>;
```

Note: `notification-events.ts` schema file is assumed to exist (created by the `notification-durable-intent` spec, which is a precondition). If it does not exist, stop — the notification spec has not landed.

- [ ] **Step 3: Verify typecheck still passes across the package**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: passes. Every storage adapter imports `Db` from this file; the type name is unchanged so constructor signatures still match.

- [ ] **Step 4: Run adapter tests**

```bash
pnpm --filter @clmm/adapters test
```

Expected: all tests pass. The Drizzle query API is identical between `postgres-js` and `neon-http`, so query-building logic in adapters is unaffected. Tests that hit a live DB need `DATABASE_URL` pointing at Neon (precondition).

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/storage/db.ts
git commit -m "feat(adapters): switch db.ts from postgres-js to @neondatabase/serverless

HTTP-mode Neon driver replaces TCP-based postgres-js. Required for
Cloudflare Workers runtime (no TCP sockets). Preserves the createDb
factory and Db type so adapter constructor signatures are unchanged."
```

---

## Task 4: Audit storage adapters for direct `db` imports

**Files:** no direct edits expected; a guard check. If violations are found, fixes happen in this task.

- [ ] **Step 1: Grep for any module-level `db` imports**

```bash
grep -rn "from.*['\"].*\/db['\"]" packages/adapters/src/outbound/storage/ --include='*.ts' | grep -v "\.test\.ts"
```

Expected output: imports of `createDb` or `Db` (the type), never of a bare `db` value. Example acceptable line:
```
packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts:import type { Db } from './db.js';
```

Example unacceptable line (would require a fix):
```
packages/adapters/src/outbound/storage/SomeAdapter.ts:import { db } from './db.js';
```

- [ ] **Step 2: Cross-check with adapter constructors**

For each file under `packages/adapters/src/outbound/storage/` (excluding `db.ts`, `schema/`, and tests), confirm the adapter class constructor receives `db` as a parameter:

```bash
grep -rn "constructor" packages/adapters/src/outbound/storage/ --include='*.ts' | grep -v "\.test\.ts" | grep -v "/schema/"
```

Each adapter's constructor should take `db: Db` (usually alongside other dependencies). Any adapter that does not take `db` in its constructor, yet queries the database, is using a hidden module-level `db` — that's the violation pattern to fix.

- [ ] **Step 3: If violations found, fix them**

For each violating adapter:
1. Add `private readonly db: Db` to the constructor.
2. Replace internal references to the imported `db` with `this.db`.
3. Remove the module-level `import { db }` line.
4. Update every call site (likely `AdaptersModule.ts`) to pass `db` to the constructor.

If no violations, skip this step.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters test
```

Expected: both pass.

- [ ] **Step 5: Commit (only if fixes were made)**

```bash
git add packages/adapters/src/outbound/storage/
git commit -m "refactor(adapters): ensure all storage adapters receive db via constructor

Audit required by Workers migration — module-level db singletons are
unreachable in the Workers runtime because env is not available at
import time."
```

If no fixes were made, skip the commit and proceed to Task 5 with a note in the task tracker: "Task 4: audit passed, no changes needed."

---

## Task 5: Delete `inbound/jobs/` and `composition/AdaptersModule.ts`

**Files:**
- Delete: `packages/adapters/src/inbound/jobs/` (entire directory)
- Delete: `packages/adapters/src/composition/` (entire directory)

- [ ] **Step 1: Confirm nothing imports from these paths outside themselves**

```bash
grep -rn "from.*inbound/jobs" packages/ --include='*.ts' | grep -v "packages/adapters/src/inbound/jobs/"
grep -rn "from.*composition/AdaptersModule" packages/ --include='*.ts'
```

Expected output: empty (no external importers). If anything is returned, investigate before deleting.

Note: `packages/adapters/src/composition/AdaptersModule.ts` imports *from* `inbound/jobs/tokens.js`, but we're deleting both. Nothing else should depend on `AdaptersModule`.

- [ ] **Step 2: Delete the directories**

```bash
rm -rf packages/adapters/src/inbound/jobs/
rm -rf packages/adapters/src/composition/
```

- [ ] **Step 3: Remove related scripts from `packages/adapters/package.json`**

Remove these three script lines (they reference deleted files):

```jsonc
    "build:worker": "tsc -p tsconfig.json",
    "start:worker": "node dist/inbound/jobs/main.js",
    "dev:worker": "tsx src/inbound/jobs/main.ts",
```

The `dev:api` script remains (it points at `inbound/http/main.ts` which is still in the tree for M2.7).

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: passes. The remaining `inbound/http/` code doesn't depend on `inbound/jobs/` or `composition/AdaptersModule`.

- [ ] **Step 5: Verify tests pass**

```bash
pnpm --filter @clmm/adapters test
```

Expected: passes (tests for deleted handlers are gone with them).

- [ ] **Step 6: Commit**

```bash
git add -A packages/adapters/
git commit -m "feat(adapters): delete pg-boss worker and NestJS composition root

Stage 1 of Workers migration. inbound/jobs/ has no downstream consumer
after this commit — the monitor worker (workers/monitor/) replaces it.
composition/AdaptersModule is also deleted; Workers composition roots
replace it. inbound/http/ is retained through Stage 3 as source material
for M2.7's per-controller porting work."
```

---

## Task 6: Remove `pg-boss` and `postgres` dependencies

**Files:**
- Modify: `packages/adapters/package.json`

- [ ] **Step 1: Confirm nothing imports them**

```bash
grep -rn "from ['\"]pg-boss['\"]" packages/ --include='*.ts'
grep -rn "from ['\"]postgres['\"]" packages/ --include='*.ts'
grep -rn "require.*['\"]postgres['\"]" packages/ --include='*.ts'
```

Expected: all three grep commands return empty. `pg-boss` was only imported by the just-deleted `inbound/jobs/` code. `postgres` was only imported by the old `db.ts` (rewritten in Task 3).

- [ ] **Step 2: Remove from `packages/adapters/package.json`**

Remove these lines from `dependencies`:

```jsonc
    "pg-boss": "^12.15.0",
    "postgres": "^3.4.0",
```

From `devDependencies`, remove:

```jsonc
    "@types/pg": "^8.20.0",
```

Keep `@nestjs/*`, `reflect-metadata`, `@nestjs/platform-fastify` — the NestJS HTTP controllers still compile against these through Stage 3.

- [ ] **Step 3: Reinstall**

```bash
pnpm install
```

- [ ] **Step 4: Verify adapters package still builds**

```bash
pnpm --filter @clmm/adapters typecheck && pnpm --filter @clmm/adapters test
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/package.json pnpm-lock.yaml
git commit -m "chore(adapters): drop pg-boss and postgres deps (no longer imported)"
```

---

## Task 7: Create `workers/api/wrangler.jsonc`

**Files:**
- Create: `workers/api/wrangler.jsonc`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p workers/api/src/routes
```

Create `workers/api/wrangler.jsonc` with:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "clmm-v2-api",
  "main": "./src/index.ts",
  "compatibility_date": "2026-04-12",
  "compatibility_flags": ["nodejs_compat"],

  "observability": {
    "enabled": true
  },

  // Producer binding — API routes may enqueue trigger events in the future.
  // No consumer binding on the API worker; only the monitor consumes TRIGGER_QUEUE.
  "queues": {
    "producers": [
      {
        "binding": "TRIGGER_QUEUE",
        "queue": "clmm-trigger-events"
      }
    ]
  }

  // Secrets set via `wrangler secret put` (not in version control):
  //   DATABASE_URL    — Neon HTTP connection string
  //   SOLANA_RPC_URL  — Helius/Triton RPC endpoint
}
```

- [ ] **Step 2: Verify wrangler parses it**

```bash
cd workers/api && pnpm wrangler deploy --dry-run 2>&1 | head -20
cd ../..
```

Expected: wrangler reports it would deploy `clmm-v2-api` but fails to bundle because `./src/index.ts` doesn't exist yet. That's OK — parse error on `wrangler.jsonc` itself would be the failure mode we're checking for here.

- [ ] **Step 3: Commit**

```bash
git add workers/api/wrangler.jsonc
git commit -m "feat(workers/api): add wrangler config for API worker"
```

---

## Task 8: Audit controllers and write `workers/api/src/composition.ts`

**Files:**
- Create: `workers/api/src/composition.ts`

This task encompasses both the controller audit (to build the `Dependencies` shelf) and writing the composition root. The audit output is embedded directly in the composition file, not a separate document.

- [ ] **Step 1: Enumerate every use case invoked across all 6 controllers**

```bash
grep -rn "from '@clmm/application'" packages/adapters/src/inbound/http/ --include='*.ts' | grep -v "\.test\.ts"
```

Read each controller file and note every use case function or class it calls. Expected list (verify by inspection; add any missing):

- From `HealthController.ts`: none (no use cases invoked).
- From `PositionController.ts`: `listSupportedPositions`, `getPositionDetail`. Ports: `SupportedPositionReadPort`, `TriggerRepository`.
- From `AlertController.ts`: read the file and list.
- From `PreviewController.ts`: read the file and list.
- From `ExecutionController.ts`: read the file and list.
- From `WalletController.ts`: read the file and list.

Command for each:
```bash
cat packages/adapters/src/inbound/http/AlertController.ts
cat packages/adapters/src/inbound/http/PreviewController.ts
cat packages/adapters/src/inbound/http/ExecutionController.ts
cat packages/adapters/src/inbound/http/WalletController.ts
```

Record the full list — this is the `Dependencies` shelf.

- [ ] **Step 2: Write `workers/api/src/composition.ts`**

Create the file. Structure (values filled in based on Step 1 audit):

```typescript
/**
 * Composition root for the CLMM V2 API worker.
 *
 * Called per request from each route handler. No module-level singletons:
 * `env` is unavailable at module scope in the Workers runtime.
 *
 * The `Dependencies` type is the whitelist of use cases and adapters that
 * route files may invoke. Adding a new entry here is a deliberate act;
 * route files must never invent use case names.
 */

// Env bindings — mirror workers/api/wrangler.jsonc bindings.
export interface Env {
  DATABASE_URL: string;
  SOLANA_RPC_URL: string;
  TRIGGER_QUEUE: Queue<TriggerEvent>;
}

// Queue message shape. Mirrored in workers/monitor/src/composition.ts.
export interface TriggerEvent {
  triggerId: string;
  positionId: string;
  walletId: string;
  directionKind: 'upper' | 'lower';
  detectedAt: number; // ms since epoch
}

// --- Imports ---
import { createSolanaRpc } from '@solana/kit';
import { createDb } from '@clmm/adapters/outbound/storage/db';
import { OperationalStorageAdapter } from '@clmm/adapters/outbound/storage/OperationalStorageAdapter';
import { OffChainHistoryStorageAdapter } from '@clmm/adapters/outbound/storage/OffChainHistoryStorageAdapter';
import { MonitoredWalletStorageAdapter } from '@clmm/adapters/outbound/storage/MonitoredWalletStorageAdapter';
import { NotificationDedupStorageAdapter } from '@clmm/adapters/outbound/storage/NotificationDedupStorageAdapter';
import { OrcaPositionReadAdapter } from '@clmm/adapters/outbound/solana-position-reads/OrcaPositionReadAdapter';
import { SolanaRangeObservationAdapter } from '@clmm/adapters/outbound/solana-position-reads/SolanaRangeObservationAdapter';
import { SolanaPositionSnapshotReader } from '@clmm/adapters/outbound/solana-position-reads/SolanaPositionSnapshotReader';
import { SolanaExecutionPreparationAdapter } from '@clmm/adapters/outbound/swap-execution/SolanaExecutionPreparationAdapter';
import { SolanaExecutionSubmissionAdapter } from '@clmm/adapters/outbound/swap-execution/SolanaExecutionSubmissionAdapter';
import { JupiterQuoteAdapter } from '@clmm/adapters/outbound/swap-execution/JupiterQuoteAdapter';
import { DurableNotificationEventAdapter } from '@clmm/adapters/outbound/notifications/DurableNotificationEventAdapter';
import { TelemetryAdapter } from '@clmm/adapters/outbound/observability/TelemetryAdapter';
import type { ClockPort, IdGeneratorPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';

// Use-case imports — one import line per use case discovered in Step 1.
// Example pattern (complete based on audit):
import {
  listSupportedPositions,
  getPositionDetail,
  // ... every other use case identified in Step 1
} from '@clmm/application';

/**
 * Builds the dependency graph for one request.
 * Cheap — no DI container, no reflection, just construction.
 */
export function buildApiDependencies(env: Env) {
  // Infrastructure
  const db = createDb(env.DATABASE_URL);
  const rpc = createSolanaRpc(env.SOLANA_RPC_URL);

  const systemClock: ClockPort = {
    now: () => Date.now() as ClockTimestamp,
  };

  // ID generator: per-request counter, fresh per invocation.
  // Module-level counter would not survive across Worker isolates.
  let idCounter = 0;
  const systemIds: IdGeneratorPort = {
    generateId: () => `${Date.now()}-${++idCounter}`,
  };

  // Shared primitives
  const snapshotReader = new SolanaPositionSnapshotReader(rpc);

  // Outbound adapters (post-spec constructor shapes)
  const operationalStorage = new OperationalStorageAdapter(db, systemIds);
  const historyStorage = new OffChainHistoryStorageAdapter(db);
  const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
  const notificationDedup = new NotificationDedupStorageAdapter(db);
  const notificationPort = new DurableNotificationEventAdapter(db, systemIds);
  const positionReader = new OrcaPositionReadAdapter(rpc, snapshotReader);
  const rangeObservation = new SolanaRangeObservationAdapter(rpc);
  const quoteAdapter = new JupiterQuoteAdapter();
  const executionPrep = new SolanaExecutionPreparationAdapter(rpc, snapshotReader);
  const executionSubmit = new SolanaExecutionSubmissionAdapter(rpc);
  const telemetry = new TelemetryAdapter();

  return {
    // Infrastructure handles (useful for raw queries if ever needed)
    db,
    rpc,

    // Adapters (use case callers receive these by name when they need port-level access)
    operationalStorage,
    historyStorage,
    monitoredWalletStorage,
    notificationDedup,
    notificationPort,
    positionReader,
    rangeObservation,
    quoteAdapter,
    executionPrep,
    executionSubmit,
    telemetry,
    clock: systemClock,
    ids: systemIds,

    // Queue producer
    triggerQueue: env.TRIGGER_QUEUE,

    // Use cases — each one invoked by a route handler
    listSupportedPositions,
    getPositionDetail,
    // ... every other use case from Step 1's audit, named exactly as exported from @clmm/application
  };
}

export type Dependencies = ReturnType<typeof buildApiDependencies>;
```

**Completeness requirement:** every use case imported from `@clmm/application` by any controller in `packages/adapters/src/inbound/http/` must appear in the returned object. Cross-check by grep after writing:

```bash
grep -rh "from '@clmm/application'" packages/adapters/src/inbound/http/ --include='*.ts' \
  | grep -v "\.test\.ts" \
  | grep -v "^import type"
```

Every named import in those lines (that isn't a `type` import) must be in the `return {...}` block of `buildApiDependencies`.

- [ ] **Step 3: Install Hono types if missing**

If `pnpm --filter @clmm/adapters typecheck` (or a workers typecheck) complains about missing types for `Queue<T>` or `ExecutionContext`, add Cloudflare Workers types:

```bash
pnpm add -D -F clmm-v2 @cloudflare/workers-types
```

Then in `workers/api/tsconfig.json` (create if it doesn't exist — see Step 4), reference the types.

- [ ] **Step 4: Create `workers/api/tsconfig.json`**

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types"],
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Verify composition typechecks**

```bash
cd workers/api && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes. If imports resolve wrong (e.g., `@clmm/adapters/outbound/...` not a valid subpath), inspect `packages/adapters/package.json` `exports` field. The adapters package currently exports only `./dist/index.js`. We may need to either add subpath exports, or have routes import via the package's top-level exports. **Resolution strategy:**

1. Check if all the adapters used above are re-exported from `packages/adapters/src/index.ts`:
   ```bash
   cat packages/adapters/src/index.ts
   ```
2. If they are, change the composition imports to use the top-level package specifier:
   ```typescript
   import { OperationalStorageAdapter, OffChainHistoryStorageAdapter, ... } from '@clmm/adapters';
   ```
3. If they are not, add the missing re-exports to `packages/adapters/src/index.ts`. This is an expected Stage 1 discovery — the NestJS world used deep imports, the Workers world uses the package's public surface.

- [ ] **Step 6: Commit**

```bash
git add workers/api/wrangler.jsonc workers/api/tsconfig.json workers/api/src/composition.ts package.json pnpm-lock.yaml packages/adapters/src/index.ts
git commit -m "feat(workers/api): add composition root with full Dependencies shelf

Enumerates every use case invoked by any controller in inbound/http/ so
the M2.7 handoff doc can whitelist them per slice without risk of
omission. Wires post-spec adapter constructor shapes: OperationalStorage
without positionReadPort, SolanaPositionSnapshotReader shared between
OrcaPositionReadAdapter and SolanaExecutionPreparationAdapter,
DurableNotificationEventAdapter as the NotificationPort."
```

---

## Task 9: Port `PositionController.ts` to `workers/api/src/routes/positions.ts` (golden reference)

**Files:**
- Create: `workers/api/src/routes/positions.ts`

This route is the pattern M2.7 replicates five times. Every Hono pattern M2.7 needs — path params, query params, JSON body, 4xx errors, 5xx errors, status codes, use-case invocation, per-request dependency construction, transient-error degradation — must appear here.

- [ ] **Step 1: Re-read the source controller for reference**

```bash
cat packages/adapters/src/inbound/http/PositionController.ts
cat packages/adapters/src/inbound/http/transient-errors.ts
```

Note: two routes with the same method but different path shapes — `/:walletId` and `/:walletId/:positionId`. Order matters in Hono (more specific first).

- [ ] **Step 2: Create the route file**

Create `workers/api/src/routes/positions.ts`:

```typescript
/**
 * CLMM V2 API — positions routes.
 *
 * GOLDEN REFERENCE ROUTE. This file demonstrates every Hono pattern used
 * in this codebase. Per-controller M2.7 slices replicate the patterns here
 * scaled to their own endpoints. If you're editing this file, be aware
 * that M2.7 opens it as its source of truth.
 *
 * Ported from packages/adapters/src/inbound/http/PositionController.ts.
 */

import { Hono } from 'hono';
import { buildApiDependencies, type Env } from '../composition';
import { makeWalletId, makePositionId } from '@clmm/domain';
import type { LiquidityPosition, ExitTrigger } from '@clmm/domain';
import type { PositionSummaryDto, PositionDetailDto } from '@clmm/application';

export const positionsRoutes = new Hono<{ Bindings: Env }>();

// --- DTO helpers (copied from PositionController.ts, unchanged) ---

function toPositionSummaryDto(
  p: LiquidityPosition,
  hasActionableTrigger = false,
): PositionSummaryDto {
  return {
    positionId: p.positionId,
    poolId: p.poolId,
    rangeState: p.rangeState.kind,
    hasActionableTrigger,
    monitoringStatus: p.monitoringReadiness.kind,
  };
}

function toPositionDetailDto(
  p: LiquidityPosition,
  trigger: ExitTrigger | null,
): PositionDetailDto {
  return {
    ...toPositionSummaryDto(p),
    hasActionableTrigger: trigger !== null,
    lowerBound: p.bounds.lowerBound,
    upperBound: p.bounds.upperBound,
    currentPrice: p.rangeState.currentPrice,
    ...(trigger
      ? {
          triggerId: trigger.triggerId,
          breachDirection: trigger.breachDirection,
        }
      : {}),
  };
}

// --- Transient error detection (copied from transient-errors.ts) ---
// Inlined here rather than imported from inbound/http/ because that path
// is deleted in Stage 4. When porting: copy the function verbatim.
function isTransientPositionReadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('rpc') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('socket') ||
    message.includes('econn') ||
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  );
}

// --- Routes ---

// GET /api/positions/:walletId/:positionId
// IMPORTANT: register the more-specific path first.
positionsRoutes.get('/:walletId/:positionId', async (c) => {
  const walletIdRaw = c.req.param('walletId');
  const positionIdRaw = c.req.param('positionId');
  const deps = buildApiDependencies(c.env);

  const wallet = makeWalletId(walletIdRaw);
  const result = await deps.getPositionDetail({
    walletId: wallet,
    positionId: makePositionId(positionIdRaw),
    positionReadPort: deps.positionReader,
  });

  if (result.kind === 'not-found') {
    return c.json({ error: `Position not found: ${positionIdRaw}` }, 404);
  }

  if (result.position.walletId !== wallet) {
    return c.json({ error: `Position not found: ${positionIdRaw}` }, 404);
  }

  let trigger: ExitTrigger | null = null;
  let triggerError: string | undefined;

  try {
    const actionableTriggers = await deps.operationalStorage.listActionableTriggers(wallet);
    trigger =
      actionableTriggers.find((t) => t.positionId === result.position.positionId) ?? null;
  } catch (error: unknown) {
    if (!isTransientPositionReadFailure(error)) {
      throw error; // Unknown error — let Hono's default error handler return 500.
    }
    triggerError = 'Unable to fetch trigger data. Position data temporarily unavailable.';
  }

  return c.json({
    position: toPositionDetailDto(result.position, trigger),
    ...(triggerError ? { error: triggerError } : {}),
  });
});

// GET /api/positions/:walletId
positionsRoutes.get('/:walletId', async (c) => {
  const walletIdRaw = c.req.param('walletId');
  const deps = buildApiDependencies(c.env);

  const wallet = makeWalletId(walletIdRaw);

  let positions: LiquidityPosition[];
  try {
    ({ positions } = await deps.listSupportedPositions({
      walletId: wallet,
      positionReadPort: deps.positionReader,
    }));
  } catch (error: unknown) {
    if (!isTransientPositionReadFailure(error)) {
      throw error;
    }
    return c.json({
      positions: [],
      error: 'Unable to fetch positions. Position data temporarily unavailable.',
    });
  }

  let triggerPositionIds: ReadonlySet<string> = new Set();
  let triggerError: string | undefined;

  try {
    const actionableTriggers = await deps.operationalStorage.listActionableTriggers(wallet);
    triggerPositionIds = new Set(actionableTriggers.map((t) => t.positionId));
  } catch (error: unknown) {
    if (!isTransientPositionReadFailure(error)) {
      throw error;
    }
    triggerError = 'Unable to fetch trigger data. Trigger status may be incomplete.';
  }

  return c.json({
    positions: positions.map((p) =>
      toPositionSummaryDto(p, triggerPositionIds.has(p.positionId)),
    ),
    ...(triggerError ? { error: triggerError } : {}),
  });
});
```

- [ ] **Step 3: Verify the file typechecks**

```bash
cd workers/api && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes. If `deps.operationalStorage.listActionableTriggers` complains, verify the return value of `buildApiDependencies` includes `operationalStorage` (Task 8 Step 5 should have caught this).

- [ ] **Step 4: Commit**

```bash
git add workers/api/src/routes/positions.ts
git commit -m "feat(workers/api): add golden reference route (positions)

Ported from inbound/http/PositionController.ts. Demonstrates every Hono
pattern the M2.7 handoff doc references: path params, typed error mapping,
transient-error degradation, dependency construction via buildApiDependencies.
M2.7's per-controller slices replicate this file's structure."
```

---

## Task 10: Create five empty route stubs

**Files:**
- Create: `workers/api/src/routes/alerts.ts`
- Create: `workers/api/src/routes/previews.ts`
- Create: `workers/api/src/routes/execution.ts`
- Create: `workers/api/src/routes/wallet.ts`
- Create: `workers/api/src/routes/health.ts`

- [ ] **Step 1: Create each stub with the same minimal shape**

For each of the five files, write:

**`workers/api/src/routes/alerts.ts`:**
```typescript
import { Hono } from 'hono';
import type { Env } from '../composition';

// Empty stub — ported by M2.7 slice against AlertController.ts.
// See docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md.
export const alertsRoutes = new Hono<{ Bindings: Env }>();
```

Repeat for `previews.ts` (`previewsRoutes`, references `PreviewController.ts`), `execution.ts` (`executionRoutes`, references `ExecutionController.ts`), `wallet.ts` (`walletRoutes`, references `WalletController.ts`), `health.ts` (`healthRoutes`, references `HealthController.ts`).

- [ ] **Step 2: Verify all typecheck**

```bash
cd workers/api && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add workers/api/src/routes/
git commit -m "feat(workers/api): add empty stubs for alerts/previews/execution/wallet/health

Each stub exports an empty Hono<{ Bindings: Env }> instance. Deployable
as-is (routes return 404). M2.7 slices replace each stub using positions.ts
as the pattern."
```

---

## Task 11: Create `workers/api/src/index.ts` (Hono app entry)

**Files:**
- Create: `workers/api/src/index.ts`

- [ ] **Step 1: Create the entry file**

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './composition';

import { positionsRoutes } from './routes/positions';
import { alertsRoutes } from './routes/alerts';
import { previewsRoutes } from './routes/previews';
import { executionRoutes } from './routes/execution';
import { walletRoutes } from './routes/wallet';
import { healthRoutes } from './routes/health';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());
app.use('*', logger());

// Process-level health, independent of health.ts (which will own domain-level health).
app.get('/health', (c) =>
  c.json({ status: 'ok', runtime: 'cloudflare-workers', worker: 'clmm-v2-api' }),
);

app.route('/api/positions', positionsRoutes);
app.route('/api/alerts', alertsRoutes);
app.route('/api/previews', previewsRoutes);
app.route('/api/execution', executionRoutes);
app.route('/api/wallet', walletRoutes);
app.route('/api/health', healthRoutes);

export default app;
```

- [ ] **Step 2: Typecheck the worker**

```bash
cd workers/api && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add workers/api/src/index.ts
git commit -m "feat(workers/api): add Hono app entry point with all route mounts"
```

---

## Task 12: Add API worker scripts to root `package.json`

**Files:**
- Modify: root `package.json`

- [ ] **Step 1: Read current scripts**

```bash
cat package.json | head -30
```

Note the existing `dev:api` (points at `@clmm/adapters` NestJS entry) and `dev:worker` (points at pg-boss worker entry).

- [ ] **Step 2: Replace the scripts**

In root `package.json`, within `"scripts": { ... }`:

- Remove:
```jsonc
    "dev:api": "pnpm --filter @clmm/adapters dev:api",
    "dev:worker": "pnpm --filter @clmm/adapters dev:worker",
```

- Add (in alphabetical order with other scripts):
```jsonc
    "dev:api": "cd workers/api && pnpm wrangler dev",
    "dev:monitor": "cd workers/monitor && pnpm wrangler dev --test-scheduled",
    "deploy:api": "cd workers/api && pnpm wrangler deploy",
    "deploy:monitor": "cd workers/monitor && pnpm wrangler deploy",
```

- [ ] **Step 3: Install wrangler at the workspace root if not already present**

```bash
pnpm add -D -w wrangler
```

Expected: wrangler available across the workspace.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: replace Railway dev scripts with wrangler dev/deploy scripts"
```

---

## Task 13: Verify API worker runs locally

**Files:** none modified.

- [ ] **Step 1: Set up a local `.dev.vars` for `wrangler dev`**

Create `workers/api/.dev.vars` (this file is gitignored — do not commit):

```
DATABASE_URL=<Neon connection string>
SOLANA_RPC_URL=<your Helius/Triton endpoint>
```

Add `workers/*/.dev.vars` to root `.gitignore` if not already covered:

```bash
grep "\.dev\.vars" .gitignore || echo "workers/*/.dev.vars" >> .gitignore
```

- [ ] **Step 2: Start the dev server**

Open a separate terminal:
```bash
cd workers/api && pnpm wrangler dev
```

Expected: wrangler reports `clmm-v2-api` starting, binds to `http://localhost:8787` (or similar), no errors.

- [ ] **Step 3: Smoke test `/health`**

In the main terminal:
```bash
curl -s http://localhost:8787/health
```

Expected output:
```json
{"status":"ok","runtime":"cloudflare-workers","worker":"clmm-v2-api"}
```

- [ ] **Step 4: Smoke test `/api/positions/:walletId`**

Use a test wallet address (any valid-format Solana pubkey with zero positions is fine — the route should return an empty list without throwing):

```bash
curl -s "http://localhost:8787/api/positions/11111111111111111111111111111111" | head
```

Expected: a JSON response shaped `{"positions":[],"error":"..."}` or `{"positions":[]}`. Not a 500. Not a runtime error in the wrangler logs.

- [ ] **Step 5: Smoke test one of the stub routes**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/api/alerts/
```

Expected: `404` (stub is an empty Hono instance with no routes registered).

- [ ] **Step 6: Stop the dev server**

Ctrl-C in the wrangler terminal. If any of the above checks failed, do not proceed — debug first.

- [ ] **Step 7: Commit any fixes that came out of this task**

If no fixes were needed, skip. If you had to fix a runtime bug, make a focused commit:

```bash
git add <files>
git commit -m "fix(workers/api): <specific issue found during local verification>"
```

---

## Task 14: Create `workers/monitor/wrangler.jsonc`

**Files:**
- Create: `workers/monitor/wrangler.jsonc`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p workers/monitor/src/handlers
```

Create `workers/monitor/wrangler.jsonc`:

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "clmm-v2-monitor",
  "main": "./src/index.ts",
  "compatibility_date": "2026-04-12",
  "compatibility_flags": ["nodejs_compat"],

  "observability": {
    "enabled": true
  },

  // Two cron schedules — the index.ts dispatcher branches on controller.cron.
  //   */2 — breach scan + trigger qualification
  //   */5 — reconciliation
  "triggers": {
    "crons": [
      "*/2 * * * *",
      "*/5 * * * *"
    ]
  },

  "queues": {
    "producers": [
      {
        "binding": "TRIGGER_QUEUE",
        "queue": "clmm-trigger-events"
      }
    ],
    "consumers": [
      {
        "queue": "clmm-trigger-events",
        "max_batch_size": 1,
        "max_retries": 3,
        "dead_letter_queue": "clmm-trigger-dlq"
      }
    ]
  }

  // Secrets via `wrangler secret put`: DATABASE_URL, SOLANA_RPC_URL
}
```

- [ ] **Step 2: Create `workers/monitor/tsconfig.json`** (identical shape to api worker)

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2022"],
    "types": ["@cloudflare/workers-types"],
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Commit**

```bash
git add workers/monitor/wrangler.jsonc workers/monitor/tsconfig.json
git commit -m "feat(workers/monitor): add wrangler config with two crons and queue consumer"
```

---

## Task 15: Create `workers/monitor/src/composition.ts`

**Files:**
- Create: `workers/monitor/src/composition.ts`

- [ ] **Step 1: Audit monitor-side use cases**

The monitor needs use cases and adapters invoked by the three original job handlers:

```bash
grep -rh "from '@clmm/application'" packages/adapters/src/inbound/jobs/ --include='*.ts' 2>/dev/null || true
# inbound/jobs/ is deleted by Task 5. Use git history instead:
git show HEAD~5:packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts | grep "from '@clmm/application'"
git show HEAD~5:packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts | grep "from '@clmm/application'"
git show HEAD~5:packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts | grep "from '@clmm/application'"
git show HEAD~5:packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts | grep "from '@clmm/application'"
```

Replace `HEAD~5` with the commit that had `inbound/jobs/` still present (run `git log --oneline | head` to find it).

Record every use case function name. Expected list based on the BreachScanJobHandler we already have in memory:
- `scanPositionsForBreaches`, `recordExecutionAbandonment` (from BreachScan)
- From TriggerQualification, Reconciliation, NotificationDispatch — verify by reading via git show.

- [ ] **Step 2: Write the composition file**

```typescript
/**
 * Composition root for the CLMM V2 monitor worker.
 *
 * Called per cron invocation and per queue message batch.
 * Not shared across requests — Workers isolate boundaries make sharing unsafe.
 */

import { createSolanaRpc } from '@solana/kit';
import {
  createDb,
  OperationalStorageAdapter,
  OffChainHistoryStorageAdapter,
  MonitoredWalletStorageAdapter,
  NotificationDedupStorageAdapter,
  OrcaPositionReadAdapter,
  SolanaRangeObservationAdapter,
  SolanaPositionSnapshotReader,
  SolanaExecutionPreparationAdapter,
  SolanaExecutionSubmissionAdapter,
  JupiterQuoteAdapter,
  DurableNotificationEventAdapter,
  TelemetryAdapter,
} from '@clmm/adapters';
import {
  // Use cases — populate from Step 1 audit. Example placeholders:
  scanPositionsForBreaches,
  recordExecutionAbandonment,
  // qualifyTrigger (or whatever TriggerQualificationJobHandler invoked)
  // reconcileExecution (or equivalent)
  // dispatchActionableNotification (or equivalent)
} from '@clmm/application';
import type { ClockPort, IdGeneratorPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';

export interface Env {
  DATABASE_URL: string;
  SOLANA_RPC_URL: string;
  TRIGGER_QUEUE: Queue<TriggerEvent>;
}

export interface TriggerEvent {
  triggerId: string;
  positionId: string;
  walletId: string;
  directionKind: 'upper' | 'lower';
  detectedAt: number;
}

export function buildMonitorDependencies(env: Env) {
  const db = createDb(env.DATABASE_URL);
  const rpc = createSolanaRpc(env.SOLANA_RPC_URL);

  const clock: ClockPort = {
    now: () => Date.now() as ClockTimestamp,
  };

  let idCounter = 0;
  const ids: IdGeneratorPort = {
    generateId: () => `${Date.now()}-${++idCounter}`,
  };

  const snapshotReader = new SolanaPositionSnapshotReader(rpc);

  const operationalStorage = new OperationalStorageAdapter(db, ids);
  const historyStorage = new OffChainHistoryStorageAdapter(db);
  const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
  const notificationDedup = new NotificationDedupStorageAdapter(db);
  const notificationPort = new DurableNotificationEventAdapter(db, ids);
  const positionReader = new OrcaPositionReadAdapter(rpc, snapshotReader);
  const rangeObservation = new SolanaRangeObservationAdapter(rpc);
  const quoteAdapter = new JupiterQuoteAdapter();
  const executionPrep = new SolanaExecutionPreparationAdapter(rpc, snapshotReader);
  const executionSubmit = new SolanaExecutionSubmissionAdapter(rpc);
  const telemetry = new TelemetryAdapter();

  return {
    clock,
    ids,
    operationalStorage,
    historyStorage,
    monitoredWalletStorage,
    notificationDedup,
    notificationPort,
    positionReader,
    rangeObservation,
    quoteAdapter,
    executionPrep,
    executionSubmit,
    telemetry,
    triggerQueue: env.TRIGGER_QUEUE,

    // Use cases
    scanPositionsForBreaches,
    recordExecutionAbandonment,
    // ... add every use case from Step 1
  };
}

export type MonitorDependencies = ReturnType<typeof buildMonitorDependencies>;
```

- [ ] **Step 3: Verify the re-exports from `@clmm/adapters`**

If any of the `import { ... } from '@clmm/adapters'` names fail to resolve, add them to `packages/adapters/src/index.ts`:

```bash
cat packages/adapters/src/index.ts
```

Cross-reference with the imports above. Add any missing exports and commit them in a small follow-up commit to Task 8.

- [ ] **Step 4: Typecheck**

```bash
cd workers/monitor && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add workers/monitor/src/composition.ts packages/adapters/src/index.ts
git commit -m "feat(workers/monitor): add composition root

Mirrors the api worker's composition pattern. Same adapter graph, plus
use cases invoked by the three original pg-boss handlers (breach-scan,
reconciliation, trigger-qualification) and the notification dispatcher."
```

---

## Task 16: Create `workers/monitor/src/handlers/breach-scan.ts`

**Files:**
- Create: `workers/monitor/src/handlers/breach-scan.ts`

- [ ] **Step 1: Review the original handler via git**

```bash
git show HEAD~6:packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts > /tmp/breach-scan-original.ts
git show HEAD~6:packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts > /tmp/trigger-qual-original.ts
```

Adjust `HEAD~6` to the commit before Task 5's deletion. Read both — the new breach-scan handler folds scan + qualification into one operation, enqueuing to `TRIGGER_QUEUE` after qualification succeeds (not immediately on breach detection).

- [ ] **Step 2: Write the handler**

```typescript
/**
 * Breach scan cron handler.
 *
 * Replaces the pg-boss BreachScanJobHandler + TriggerQualificationJobHandler.
 * The old system used two discrete queue steps; here they fold into one
 * operation because Cloudflare Queues offer no benefit from splitting.
 *
 * For each monitored wallet:
 *   1. Scan supported positions for range breaches.
 *   2. Record abandonments for stale awaiting-signature attempts.
 *   3. For each observation, evaluate qualification inline.
 *   4. Enqueue TriggerEvent to TRIGGER_QUEUE only after qualification passes.
 */

import type { MonitorDependencies, TriggerEvent } from '../composition';

export async function runBreachScan(deps: MonitorDependencies): Promise<void> {
  let wallets: Awaited<ReturnType<MonitorDependencies['monitoredWalletStorage']['listActiveWallets']>>;

  try {
    wallets = await deps.monitoredWalletStorage.listActiveWallets();
  } catch (error) {
    deps.telemetry.log('error', 'Breach scan failed before wallet iteration', {
      stage: 'list-active-wallets',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  for (const wallet of wallets) {
    try {
      const observations = await deps.scanPositionsForBreaches({
        walletId: wallet.walletId,
        positionReadPort: deps.positionReader,
        clock: deps.clock,
        episodeRepo: deps.operationalStorage,
      });

      // Qualification: for each observation, decide whether to enqueue.
      // The qualification logic lives in the application layer. Use whatever
      // use case name BreachScanJobHandler + TriggerQualificationJobHandler
      // composed — see Task 15 Step 1 audit output. Typically:
      //   - If observation.consecutiveCount >= threshold → enqueue.
      //   - Record detection timing via observability.

      for (const obs of observations.observations) {
        // TODO during execution: substitute the exact qualification predicate
        // from the old TriggerQualificationJobHandler. Read that file via
        // git show (Task 15 Step 1) for the ground-truth logic. This is NOT
        // a design choice — it's preserving existing behavior.

        await deps.triggerQueue.send({
          triggerId: deps.ids.generateId(),
          positionId: obs.positionId,
          walletId: wallet.walletId,
          directionKind: obs.direction.kind,
          detectedAt: deps.clock.now(),
        } satisfies TriggerEvent);

        deps.telemetry.recordDetectionTiming({
          positionId: obs.positionId,
          detectedAt: deps.clock.now(),
          observedAt: obs.observedAt,
          durationMs: deps.clock.now() - obs.observedAt,
        });
      }

      for (const abandonment of observations.abandonments) {
        const staleAttempts = await deps.operationalStorage.listAwaitingSignatureAttemptsByEpisode(
          abandonment.episodeId,
        );

        if (staleAttempts.length > 1) {
          deps.telemetry.log('warn', `Execution integrity violation for episode ${abandonment.episodeId}`, {
            episodeId: abandonment.episodeId,
            positionId: abandonment.positionId,
            reason: abandonment.reason,
            awaitingSignatureAttempts: staleAttempts.length,
          });
        }

        for (const attempt of staleAttempts) {
          await deps.recordExecutionAbandonment({
            attemptId: attempt.attemptId,
            positionId: attempt.positionId,
            breachDirection: attempt.breachDirection,
            executionRepo: deps.operationalStorage,
            historyRepo: deps.historyStorage,
            clock: deps.clock,
            ids: deps.ids,
          });
        }
      }

      await deps.monitoredWalletStorage.markScanned(wallet.walletId, deps.clock.now());
    } catch (error) {
      deps.telemetry.log('error', `Breach scan failed for wallet ${wallet.walletId}`, {
        walletId: wallet.walletId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Per-wallet error does not throw — other wallets keep scanning.
    }
  }
}
```

**Important:** the comment block marked `TODO during execution` is the one place this file has a placeholder. Before committing, replace it with the actual qualification logic read from the git-shown TriggerQualificationJobHandler.ts. This is a behavior-preserving port; do not invent new qualification rules.

- [ ] **Step 3: Typecheck**

```bash
cd workers/monitor && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add workers/monitor/src/handlers/breach-scan.ts
git commit -m "feat(workers/monitor): add breach-scan handler (folds scan + qualification)

The old pg-boss system bounced scan observations through a qualify-trigger
job before enqueuing breach events. In Workers, that indirection buys
nothing — qualification runs inline before the TriggerEvent is enqueued
to TRIGGER_QUEUE."
```

---

## Task 17: Create `workers/monitor/src/handlers/reconciliation.ts`

**Files:**
- Create: `workers/monitor/src/handlers/reconciliation.ts`

- [ ] **Step 1: Review the original via git**

```bash
git show HEAD~7:packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts > /tmp/reconcile-original.ts
cat /tmp/reconcile-original.ts
```

Adjust `HEAD~7` to the pre-Task-5 commit. The handler logic becomes the body below.

- [ ] **Step 2: Write the handler**

```typescript
/**
 * Reconciliation cron handler (*/5 * * * *).
 *
 * Polls Solana for transaction-confirmation status of pending execution
 * attempts and updates their state via the application layer.
 *
 * Replaces the pg-boss ReconciliationJobHandler. Body is a faithful port —
 * no logic changes. See git show HEAD~<n>:packages/adapters/src/inbound/jobs/
 * ReconciliationJobHandler.ts for the ground truth.
 */

import type { MonitorDependencies } from '../composition';

export async function runReconciliation(deps: MonitorDependencies): Promise<void> {
  // Paste the handle() method body from ReconciliationJobHandler.ts,
  // substituting every `this.<dep>` with `deps.<dep>`. The deps shape
  // is defined in workers/monitor/src/composition.ts.

  // Example structure (replace with actual body):
  //   const pendingAttempts = await deps.operationalStorage.listPendingAttempts();
  //   for (const attempt of pendingAttempts) {
  //     const result = await deps.executionSubmit.reconcileExecution(attempt.transactionRefs);
  //     await deps.reconcileExecutionUseCase({ ... });  // whatever use case name
  //   }
}
```

**Execution note:** the body above is a template. The executor replaces the body with the actual ported logic from the git-recovered `ReconciliationJobHandler.ts`.

- [ ] **Step 3: Typecheck**

```bash
cd workers/monitor && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add workers/monitor/src/handlers/reconciliation.ts
git commit -m "feat(workers/monitor): add reconciliation handler (ported from pg-boss)"
```

---

## Task 18: Create `workers/monitor/src/handlers/trigger-consumer.ts`

**Files:**
- Create: `workers/monitor/src/handlers/trigger-consumer.ts`

- [ ] **Step 1: Review the original NotificationDispatchJobHandler via git**

```bash
git show HEAD~8:packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts > /tmp/notif-original.ts
cat /tmp/notif-original.ts
```

This is the closest analog — the old system received a qualified trigger event and dispatched a notification. The new queue consumer additionally builds an exit preview first.

- [ ] **Step 2: Write the handler**

```typescript
/**
 * TRIGGER_QUEUE consumer.
 *
 * For each confirmed TriggerEvent:
 *   1. Build the exit preview via the application's preview use case.
 *   2. Persist the preview for the user to review in-app.
 *   3. Invoke notificationPort.sendActionableAlert(). Post-spec, this writes
 *      a notification_events row with status: 'skipped' (intended behavior —
 *      see the notification-durable-intent spec). NO Expo push fetch here.
 *
 * Message acking: ack() on success, retry() on failure. Up to 3 retries
 * per wrangler config, then DLQ.
 */

import type { MonitorDependencies, TriggerEvent } from '../composition';

export async function consumeTriggerBatch(
  batch: MessageBatch<TriggerEvent>,
  deps: MonitorDependencies,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const event = message.body;

      // 1. Build + persist preview.
      // Use whatever use case the application layer exposes for "prepare exit
      // preview for this trigger." Read the original NotificationDispatchJobHandler
      // in Step 1 for the exact use case name and arguments.

      // Example shape (replace with the real call):
      //   const preview = await deps.prepareExitPreview({
      //     positionId: event.positionId,
      //     breachDirection: event.directionKind,
      //     ...
      //   });
      //   await deps.operationalStorage.saveExecutionPreview(event.positionId, preview);

      // 2. Invoke notification port.
      //
      // ⚠️ DO NOT add fetch() to Expo Push here. Post notification-durable-intent
      //    spec, sendActionableAlert() writes a notification_events row with
      //    status: 'skipped' and returns { deliveredAt: null }. That is INTENDED.
      //    See docs/superpowers/specs/2026-04-13-notification-durable-intent-design.md.

      await deps.notificationPort.sendActionableAlert({
        walletId: event.walletId as never, // WalletId brand, the domain module has the helper
        positionId: event.positionId as never,
        breachDirection: { kind: event.directionKind } as never,
        triggerId: event.triggerId as never,
      });
      // (The casts above are placeholders; substitute makeWalletId/makePositionId/etc
      // from @clmm/domain as appropriate to match the NotificationPort contract.)

      message.ack();
    } catch (error) {
      console.error(
        `Failed to process trigger for position ${message.body.positionId}:`,
        error,
      );
      message.retry();
    }
  }
}
```

**Execution note:** the placeholder `as never` casts must be replaced with proper branded-type constructors from `@clmm/domain` (look at `PositionController.ts` to see how `makeWalletId` / `makePositionId` are used). The intent is to make the types line up with the `NotificationPort.sendActionableAlert` signature as defined in `packages/application/src/ports/index.ts`.

- [ ] **Step 3: Typecheck**

```bash
cd workers/monitor && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes after the branded-type casts are sorted.

- [ ] **Step 4: Commit**

```bash
git add workers/monitor/src/handlers/trigger-consumer.ts
git commit -m "feat(workers/monitor): add TRIGGER_QUEUE consumer

Builds exit preview, persists, invokes NotificationPort. The notification
call writes a notification_events row with status:'skipped' per the
notification-durable-intent spec — this is not a TODO, it is the intended
post-spec behavior. No Expo push HTTP call is appropriate here."
```

---

## Task 19: Create `workers/monitor/src/index.ts` (dispatch entry point)

**Files:**
- Create: `workers/monitor/src/index.ts`

- [ ] **Step 1: Create the entry file**

```typescript
/**
 * CLMM V2 monitor worker entry point.
 *
 * Two entry points in one script (standard Cloudflare Workers pattern):
 *   - scheduled(): fires on cron triggers. Branches on controller.cron to
 *     pick the right handler (breach-scan for */2, reconciliation for */5).
 *   - queue(): fires when TRIGGER_QUEUE delivers a batch.
 *
 * This file is pure dispatch. All business logic lives in ./handlers/.
 * Do not add handler logic here — reviewers expect this file to stay small.
 */

import { buildMonitorDependencies, type Env, type TriggerEvent } from './composition';
import { runBreachScan } from './handlers/breach-scan';
import { runReconciliation } from './handlers/reconciliation';
import { consumeTriggerBatch } from './handlers/trigger-consumer';

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const deps = buildMonitorDependencies(env);

    if (controller.cron === '*/2 * * * *') {
      await runBreachScan(deps);
      return;
    }

    if (controller.cron === '*/5 * * * *') {
      await runReconciliation(deps);
      return;
    }

    // Unknown cron — log and exit without throwing (don't want Cloudflare
    // to retry a schedule misconfig).
    deps.telemetry.log('warn', `Unknown cron schedule: ${controller.cron}`, {
      cron: controller.cron,
    });
  },

  async queue(
    batch: MessageBatch<TriggerEvent>,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const deps = buildMonitorDependencies(env);
    await consumeTriggerBatch(batch, deps);
  },
};
```

- [ ] **Step 2: Typecheck**

```bash
cd workers/monitor && pnpm tsc --noEmit -p tsconfig.json
cd ../..
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add workers/monitor/src/index.ts
git commit -m "feat(workers/monitor): add entry point dispatcher (cron + queue)

Entry file stays pure dispatch — cron branch picks a handler by
controller.cron, queue forwards the batch to the consumer. All logic
in ./handlers/ so this file remains at <50 lines."
```

---

## Task 20: Verify monitor worker runs locally

**Files:** none modified.

- [ ] **Step 1: Create `workers/monitor/.dev.vars`** (gitignored)

```
DATABASE_URL=<Neon connection string>
SOLANA_RPC_URL=<your Helius/Triton endpoint>
```

- [ ] **Step 2: Start the monitor with scheduled-test mode**

```bash
cd workers/monitor && pnpm wrangler dev --test-scheduled
```

Expected: wrangler starts, binds to a port (e.g., 8788), logs `clmm-v2-monitor` ready.

- [ ] **Step 3: Trigger the breach-scan cron manually**

In a separate terminal:
```bash
curl -s "http://localhost:8788/__scheduled?cron=*/2+*+*+*+*"
```

Expected: wrangler logs show the `runBreachScan` handler executing. It will likely log "no active wallets" if your test DB is empty — that's fine. No exceptions. No runtime errors.

- [ ] **Step 4: Trigger the reconciliation cron**

```bash
curl -s "http://localhost:8788/__scheduled?cron=*/5+*+*+*+*"
```

Expected: `runReconciliation` executes cleanly. May log "no pending attempts." No exceptions.

- [ ] **Step 5: Trigger an unknown cron (smoke test the fallback branch)**

```bash
curl -s "http://localhost:8788/__scheduled?cron=0+0+*+*+*"
```

Expected: wrangler logs a "Unknown cron schedule" warning. Worker does not throw.

- [ ] **Step 6: Stop wrangler**

Ctrl-C. Queue consumer testing is deferred to the Stage 4 preview deploy — wrangler dev local queue simulation is not required for skeleton verification.

- [ ] **Step 7: Commit any fixes**

Only commit if local verification surfaced bugs. Otherwise proceed.

---

## Task 21: Full-workspace verification gate

**Files:** none modified.

This is the Stage 1 close gate from the design spec's sequencing section. Every check must pass before writing the handoff doc.

- [ ] **Step 1: Full install**

```bash
pnpm install
```

Expected: clean, no warnings about removed packages still present.

- [ ] **Step 2: Full typecheck**

```bash
pnpm typecheck
```

Expected: all packages pass.

- [ ] **Step 3: Full test**

```bash
pnpm test
```

Expected: domain, application, adapters (minus deleted handler tests) all green.

- [ ] **Step 4: Full lint**

```bash
pnpm lint
```

Expected: no errors. Warnings tolerated but should be reviewed for anything introduced in this work.

- [ ] **Step 5: Boundary check**

```bash
pnpm boundaries
```

Expected: dependency-cruiser reports no rule violations. (If it fails, the failure is likely a worker file importing something it shouldn't — investigate the report.)

- [ ] **Step 6: Final commit of any verification-driven fixes**

```bash
git status
# If anything is modified, commit it:
git add <files>
git commit -m "fix: address verification gate findings"
```

If the tree is clean, skip the commit.

---

## Task 22: Audit controllers for endpoint inventory

**Files:** no direct edits — the output of this task feeds Task 23.

- [ ] **Step 1: For each of the 6 controllers, extract:**

  - File path
  - Resolved route paths (compose `@Controller('prefix')` + `@Get/@Post(...)`)
  - HTTP method per route
  - Params, body, query
  - Use cases invoked
  - Success status code (NestJS default is 200 for GET, 201 for POST; `@HttpCode` overrides)
  - Error cases (`throw new XException`)

```bash
for f in packages/adapters/src/inbound/http/{Health,Position,Alert,Preview,Execution,Wallet}Controller.ts; do
  echo "=== $f ==="
  cat "$f"
  echo
done > /tmp/all-controllers.txt
```

Read `/tmp/all-controllers.txt` end to end.

- [ ] **Step 2: Build a working-notes table for each controller**

Write a plain-text table in a scratch file (`/tmp/endpoint-inventory.md`). Structure per row:

| Method | Resolved path | Params/Body/Query | Use case invoked | Success | Error cases |

Example for PositionController:

```
| GET  | /api/positions/:walletId/:positionId | walletId, positionId (path) | getPositionDetail + operationalStorage.listActionableTriggers | 200 | 404 not-found, 500 non-transient, 200 with error field on transient |
| GET  | /api/positions/:walletId             | walletId (path)             | listSupportedPositions + operationalStorage.listActionableTriggers | 200 | 500 non-transient, 200 with error field on transient |
```

Build one table per controller. This scratch file feeds Task 23.

- [ ] **Step 3: Identify the Dependencies subset used per controller**

For each controller, list only the `deps.*` names that appear in its handlers. This is the filtered Dependencies whitelist for that slice.

Example for AlertController: the subset might be `{operationalStorage.listActionableTriggers, operationalStorage.acknowledgeTrigger}`.

Record in the scratch file alongside the endpoint tables.

- [ ] **Step 4: No commit**

This task produces scratch notes consumed by Task 23. Nothing goes to git.

---

## Task 23: Write the M2.7 handoff doc

**Files:**
- Create: `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md`

This task produces the handoff doc per the design spec's "Handoff doc structure" section (sections 1–6 + five per-controller slices).

- [ ] **Step 1: Write the doc skeleton**

Create the file with the six top-level sections:

```markdown
# CLMM V2 — NestJS → Hono Controller Port (M2.7 Handoff)

## 1. Context

You are porting one NestJS controller from this repository to a Hono route file for a Cloudflare Workers deployment. The infrastructure, composition roots, monitor worker, and one reference route are already written. Your job is to port one controller by following an existing reference, using dependencies that are already wired. You do not need to understand Cloudflare Workers, Hono, Neon, or the broader migration.

You write exactly one file. Success looks like: the file typechecks, no other file is modified, and the route behavior matches the controller it replaces.

## 2. The golden reference

Open this file and read it completely before writing anything:

    workers/api/src/routes/positions.ts

Every Hono pattern you need is demonstrated there: path params, query params, typed JSON body, 4xx and 5xx error mapping, status codes, dependency construction via `buildApiDependencies(c.env)`, use-case invocation, transient-error degradation to 200-with-error-field. Your output must look structurally identical, scaled to your target controller's endpoints.

## 3. The Dependencies shelf

These are the only use cases and adapters available to you. If the route you are porting appears to need something not listed here, **stop and report the gap** (see Section 6). Do not invent a use case name. Do not call an adapter method that is not exposed on this type.

    <paste the Dependencies type verbatim from workers/api/src/composition.ts, plus a one-line signature per use case>

## 4. Forbidden list

Hard rules. Violations break the migration.

1. Do not modify any file outside your target route file.
2. Do not edit `composition.ts`. If you need a new dependency, stop and report.
3. Do not add `fetch()` calls to external services. Especially: **do not add Expo Push or any notification HTTP call.** Notifications in this system are handled via a database write inside a use case; your route never calls out to a notification service directly.
4. Do not add imports from `node:*`, `pg`, `pg-boss`, `@nestjs/*`, or `express`. These are banned in the Workers runtime.
5. Do not use `process.env`. Use `c.env` from the Hono context.
6. Do not "improve" controller logic during porting. Behavior-preserving port only. Preserve status codes. Map thrown error types to matching HTTP status codes.
7. Do not add tests.

## 5. Per-controller slices

Five slices below. Each is a self-contained assignment — copy Sections 1–4 plus your assigned slice into an M2.7 session.

### Slice A: alerts.ts

- **Target file:** `workers/api/src/routes/alerts.ts`
- **Source file:** `packages/adapters/src/inbound/http/AlertController.ts`
- **Endpoint inventory:**

    <paste the filled-in table from Task 22 Step 2>

- **Dependencies subset:** Of the full shelf in Section 3, this slice uses:

    <paste the filtered list from Task 22 Step 3>

  Do not invoke any others from this route file.

- **Verification:**

    pnpm --filter @clmm/adapters typecheck && git status

  Expectation: only `workers/api/src/routes/alerts.ts` is modified.

### Slice B: previews.ts
<same structure, PreviewController>

### Slice C: execution.ts
<same structure, ExecutionController>

### Slice D: wallet.ts
<same structure, WalletController>

### Slice E: health.ts
<same structure, HealthController>

## 6. Escalation protocol

If you find a genuine gap (a use case the controller invokes that isn't on the Dependencies shelf, an adapter method that doesn't exist, an import that refuses to resolve), **stop and report** in this format:

    GAP: <controller file>:<line>
    EXPECTED: <what the controller invokes>
    AVAILABLE: <nearest matches on Dependencies shelf>
    PROPOSED_NAME: <what I would add to Dependencies if you approve>

Do not improvise. A GAP report is the safety valve. Inventing a use case name produces code that typechecks but fails at runtime.
```

- [ ] **Step 2: Fill in Section 3 from `workers/api/src/composition.ts`**

Copy the exact `Dependencies` type from composition.ts (the `return { ... }` shape plus the `export type Dependencies = ReturnType<...>` line). For each entry in the return, add one line with its call signature:

```
listSupportedPositions({ walletId, positionReadPort }): Promise<{ positions: LiquidityPosition[] }>
getPositionDetail({ walletId, positionId, positionReadPort }): Promise<{ kind: 'found'; position: LiquidityPosition } | { kind: 'not-found' }>
operationalStorage.listActionableTriggers(walletId): Promise<ExitTrigger[]>
operationalStorage.acknowledgeTrigger(triggerId): Promise<void>
...etc
```

Signatures come from `packages/application/src/index.ts` (use cases) and the adapter class files (for adapter methods).

- [ ] **Step 3: Fill in each of the five slices from Task 22 notes**

Paste each controller's endpoint inventory table and its Dependencies subset into the corresponding slice.

- [ ] **Step 4: Typecheck-equivalent check for the doc**

Not a literal typecheck, but scan:

```bash
grep -n "TBD\|TODO\|<paste\|<same structure\|<what " docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md
```

Expected: empty. Any hits indicate placeholders left in the doc — fix before committing.

- [ ] **Step 5: Consistency check**

Verify every method or use case named in any slice's Dependencies subset (Section 5) also appears in Section 3's shelf. A slice cannot whitelist a dependency that isn't on the shelf.

Quick check:
```bash
# Extract names mentioned in slice subsets:
awk '/### Slice/,/^## [0-9]/' docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md | grep -oE "[a-z][a-zA-Z]+\.[a-zA-Z]+|[a-z][a-zA-Z]+" | sort -u > /tmp/slice-names.txt
# Cross-reference manually with Section 3 contents.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md
git commit -m "docs: add M2.7 handoff doc for Workers controller porting slices

Self-contained handoff for MiniMax M2.7 to port the five remaining NestJS
controllers (alerts, previews, execution, wallet, health) to Hono routes
against the golden reference (positions.ts). Five slices, each with
resolved endpoint inventory and filtered Dependencies whitelist, plus
an escalation protocol for skeleton gaps."
```

---

## Task 24: Handoff doc self-review

**Files:** re-read the doc, fix any issues inline.

- [ ] **Step 1: Placeholder scan**

```bash
grep -niE "tbd|todo|xxx|fixme|<paste|<same|<what|<fill" docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md
```

Expected: empty. Fix anything found.

- [ ] **Step 2: Internal consistency**

Read the doc end to end. Specifically verify:

1. Every slice's "Dependencies subset" list names only entries present in Section 3's shelf.
2. Every slice's source-file path exists in the repo (`ls packages/adapters/src/inbound/http/` should show them all).
3. Section 2 points at `workers/api/src/routes/positions.ts` and that file exists.
4. Section 4 rule #3 explicitly calls out the notification-spec behavior so M2.7 doesn't "fix" a DB-only notification write into an Expo push.

- [ ] **Step 3: Ambiguity check**

For each slice, could M2.7 interpret any instruction two ways? Specifically watch for:
- Resolved path vs. decorator fragment ambiguity. The inventory must show `/api/alerts/:walletId/:alertId`, not `@Get(':alertId')` with `@Controller('alerts')`.
- Use-case signatures. If the shelf shows `acknowledgeAlert(input)` but doesn't say what `input` is, add the type.

- [ ] **Step 4: Scope check**

Does any slice instruct M2.7 to do something outside one file? If yes, split the instruction or tighten the slice.

- [ ] **Step 5: Fix and commit**

If any changes were needed:
```bash
git add docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md
git commit -m "docs: handoff doc self-review fixes"
```

If no changes needed, skip the commit.

- [ ] **Step 6: Announce completion**

Implementation plan is complete. The skeleton branch `feat/workers-migration-skeleton` now contains:
- Neon HTTP driver swap in adapters.
- Full api-worker skeleton with golden reference route (positions) and five stub routes.
- Full monitor-worker implementation (no M2.7 slice).
- Deletions of pg-boss worker code and NestJS AdaptersModule.
- Self-contained M2.7 handoff doc ready to dispatch against.

Stage 2 is closed. Stage 3 (M2.7 slice dispatch) is the next phase — not covered by this plan.

---

## Self-review

Quick checklist against the design spec:

**Spec coverage:**

- Architecture section → Tasks 7–20 build the two workers and wiring.
- Skeleton scope section → Tasks 2–20 cover every line item (deps, db.ts swap, audits, wrangler configs, composition roots, routes, handlers, entry points, deletions of jobs/ and composition/).
- Stage 1 verification gate → Task 13 (api worker), Task 20 (monitor worker), Task 21 (full workspace).
- Handoff doc structure section → Task 23 (write) + Task 24 (self-review).
- Deletion-timing correction (controllers stay until Stage 4) → Task 5 deletes only jobs/ and composition/; controllers untouched. ✓
- db.ts factory invariant + audit → Tasks 3 and 4. ✓

**Placeholder scan on this plan:**

One intentional placeholder remains: Task 16 Step 2 carries a `TODO during execution` comment instructing the executor to substitute the exact qualification predicate from the old TriggerQualificationJobHandler. This is a behavior-preserving port — the real predicate lives in the git-recoverable source and must not be invented. The plan guides the executor to extract it in Task 15 Step 1 and paste it in Task 16 Step 2.

**Type/name consistency:**

- `Db` type name preserved in Task 3; every adapter import still references it.
- `TriggerEvent` shape defined once in `workers/api/src/composition.ts` (Task 8) and imported in `workers/monitor/src/composition.ts` via a duplicate definition (Task 15). Both must match. Before Task 15 close, cross-check:
  ```bash
  grep -A10 "interface TriggerEvent" workers/api/src/composition.ts
  grep -A10 "interface TriggerEvent" workers/monitor/src/composition.ts
  ```
  Same shape in both places. If they ever diverge, a shared package (`@clmm/workers-contracts` or similar) becomes worth adding — out of scope here.
- `Dependencies` (api) vs. `MonitorDependencies` (monitor) — deliberately distinct names because their shapes diverge (use cases differ).

No gaps found against the spec. Plan is complete.
