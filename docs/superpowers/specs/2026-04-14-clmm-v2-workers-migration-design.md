# Design: CLMM V2 — Cloudflare Workers Migration (M2.7 Handoff Strategy)

**Date:** 2026-04-14
**Status:** Draft

---

## Problem

CLMM V2 runs today as a NestJS API plus a pg-boss worker on Railway, with `postgres` (TCP) as the Drizzle driver. The migration target is Cloudflare Workers (Hono) plus Neon serverless Postgres (HTTP driver) plus Cloudflare Queues, with the PWA deployed as static assets.

The target architecture is sound for this project's scale (≤100 req/day, single-user LP monitor, all hosting on free tiers). A reference implementation exists at `docs/CLMM-V2-MIGRATION-REFERENCE.md` that describes Worker-runtime constraints, the Hono-per-request DI pattern, Neon HTTP usage, and per-controller porting rules. It is architecturally correct.

Three problems block naive execution:

1. **The reference doc is stale relative to four pre-migration specs** that land before this work: `walletid-contamination-fix`, `notification-durable-intent`, `solana-read-path-efficiency`, `transaction-reference-step-projection`. These specs change adapter constructors, introduce new shared primitives, change a port signature, and replace the entire notification path with a DB-only write. A migration executed against the reference doc as-written would wire pre-spec shapes.

2. **The reference doc's job-handler mapping is underspecified.** It describes one cron + one queue consumer. The current system has four pg-boss handlers (BreachScan, TriggerQualification, Reconciliation, NotificationDispatch) that don't map cleanly onto that shape.

3. **The implementation budget is one Opus session plus cheaper models.** This migration is intended for execution by MiniMax M2.7 in separate sessions, not for Opus to execute end-to-end. M2.7 is strong at pattern replication with concrete examples but weak at reconciling disagreeing source documents or inferring implicit adapter shapes. Handing it the stale reference doc plus four specs and asking it to execute produces code that compiles but wires the wrong adapters.

## Goals

- Establish an execution plan where M2.7 can migrate NestJS controllers to Hono routes reliably, without architectural judgment or multi-document reconciliation.
- Concentrate all judgment-heavy work (composition roots, cron branching, queue wiring, infrastructure config) in a single Opus session, against a single skeleton branch, verified before any handoff.
- Produce a self-contained handoff doc that M2.7 can execute against in separate sessions without access to conversation history or additional context.
- Preserve Railway production availability until the Workers deployment is verified end-to-end, with a clean rollback path throughout.

## Non-Goals

- Re-specifying any of the four pre-migration specs. They are inputs to this work, not in-scope.
- Migrating the domain or application layers. They are untouched.
- Migrating the monitor worker via M2.7. The monitor is written end-to-end by Opus in the skeleton stage — its cognitive load (cron branching + queue consumer + error handling) is too high for reliable slice-based replication.
- Canary / gradual rollout. Request volume doesn't justify the infrastructure.
- Per-slice CI gates or PRs. Slices are small, isolated, and verified by local typecheck + curl.

---

## Direction validation

The core migration direction is approved:

- **Hono on Cloudflare Workers + Neon HTTP + Cloudflare Queues + Pages static assets.** Architecturally correct for this project.
- **`@neondatabase/serverless` HTTP mode, not WebSocket.** Workers are request-scoped; HTTP is the right driver.
- **Per-request dependency graph construction replacing NestJS DI.** Correct; Neon HTTP has no pool, Solana RPC is stateless, domain objects have no state.
- **Two workers: `clmm-v2-api` and `clmm-v2-monitor`.** Correct.

Four divergences from the reference doc that this design incorporates:

1. **Notification path is DB-only post-spec.** The `notification-durable-intent` spec deletes `InAppAlertAdapter`, `ExpoPushAdapter`, `WebPushAdapter`, replaces them with `DurableNotificationEventAdapter` writing to `notification_events` with `status: 'skipped'`. The reference doc's queue consumer calls Expo push via `fetch()`; the post-spec queue consumer invokes `NotificationPort.sendActionableAlert()` which is a DB insert. This looks like a no-op to a fresh reader and must be explicitly documented as intended behavior in the handoff doc.

2. **`OperationalStorageAdapter` constructor changes.** Post `solana-read-path-efficiency`, it is `(db, ids)` — the `positionReadPort` dependency is removed because `listActionableTriggers` becomes a pure DB query against `wallet_position_ownership`.

3. **`SolanaPositionSnapshotReader` is a new shared building block.** Consumed by both `OrcaPositionReadAdapter` and `SolanaExecutionPreparationAdapter`. Instantiated once per composition root and passed into both adapters. Stateless per spec; single instance accurately reflects that semantics.

4. **`ExecutionSubmissionPort.submitExecution` takes `plannedStepKinds`.** Post `transaction-reference-step-projection`, the signature changes and all callers in the application layer must pass the planned step kinds through.

Reference-doc job-handler mapping is corrected to:

- **BreachScan + TriggerQualification** → folded into the `*/2 * * * *` cron handler. Scan, evaluate qualification inline via `BreachEvaluationService`, enqueue `TriggerEvent` on confirmation. The pg-boss-era separation existed because pg-boss encouraged decomposing work into discrete queue steps; in Workers that indirection has no benefit.
- **Reconciliation** → second cron `*/5 * * * *`, branched inside `scheduled()` via `controller.cron`. Reconciliation is poll-based by nature (check Solana for tx confirmation status), not event-driven. Making it a queue consumer would push the scheduling problem upstream.
- **NotificationDispatch** → queue consumer invoking `DurableNotificationEventAdapter` via the `NotificationPort` abstraction. No Expo push, no external fetch.

Queue name is **`TRIGGER_QUEUE`**, not `BREACH_QUEUE`. Messages are emitted after qualification, so they represent confirmed triggers, not raw breach detections. The naming reflects the post-qualification semantics.

---

## Architecture

Three deployable units after migration:

```
clmm-v2-app       (Cloudflare Pages / static assets)   ← apps/app/dist
clmm-v2-api       (Cloudflare Worker)                  ← workers/api/
clmm-v2-monitor   (Cloudflare Worker, cron + queue)    ← workers/monitor/
```

### API worker

Runs Hono, exposes every route currently in `packages/adapters/src/inbound/http/*Controller.ts`. Builds its dependency graph per request via `workers/api/src/composition.ts::buildApiDependencies(env)`. No NestJS DI container, no decorators, no `reflect-metadata`.

Producer binding for `TRIGGER_QUEUE` is present (some API routes may enqueue manual triggers in the future), but no consumer binding on the API worker.

### Monitor worker

Single `workers/monitor/src/index.ts` with two entry points:

**`scheduled(controller, env, ctx)`** branches on `controller.cron`:

- `*/2 * * * *` — BreachScan + TriggerQualification. Fetches monitored positions via `operationalStorage.getMonitoredPositions()`, checks range state via `OrcaPositionReadAdapter`, evaluates qualification via `BreachEvaluationService`, on confirmation enqueues `TriggerEvent` to `TRIGGER_QUEUE`, records the episode via `operationalStorage`.
- `*/5 * * * *` — Reconciliation. Fetches pending execution attempts, calls `ExecutionSubmissionPort.reconcileExecution(references)`, updates attempt state.

**`queue(batch, env, ctx)`** consumes `TRIGGER_QUEUE`. For each message: builds exit preview via `PrepareExitPreviewUseCase`, persists via `operationalStorage`, invokes `notificationPort.sendActionableAlert()` (which writes a `notification_events` row with `status: 'skipped'`). Acks on success, `retry()` on failure, up to 3 retries, DLQ after.

Handler bodies extracted into `workers/monitor/src/handlers/{breach-scan,reconciliation,trigger-consumer}.ts`. The entry point stays readable and is pure dispatch.

### Shared packages

- `domain` and `application` — unchanged.
- `adapters/outbound/*` — changes only where the four specs dictate. Plus one change owned by this migration: `outbound/storage/db.ts` swaps from `postgres-js` to `@neondatabase/serverless` + `drizzle-orm/neon-http`. Every storage adapter already receives `db` through its constructor; no other adapter file changes.
- `adapters/inbound/http/` and `adapters/inbound/jobs/` — deleted.
- `adapters/composition/` (if it exists) — deleted.

### SolanaPositionSnapshotReader wiring

In each composition root:

```typescript
const rpc = createSolanaRpc(env.SOLANA_RPC_URL);
const snapshotReader = new SolanaPositionSnapshotReader(rpc);

const positionReader = new OrcaPositionReadAdapter(rpc, snapshotReader);
const executionPrep  = new SolanaExecutionPreparationAdapter(rpc, snapshotReader);
```

One instance, two consumers. The stateless-building-block nature of the reader is reflected in the wiring, which sends the right signal to anyone adding a third consumer later.

---

## Skeleton scope

Everything in this section lands on a single feature branch (`feat/workers-migration-skeleton`), typechecks, and is committed before the handoff doc is considered ready. If any piece is missing or wrong, M2.7's per-controller work is built on sand.

### Infrastructure / wrangler configs

- `workers/api/wrangler.jsonc` — name, main, compat date, `nodejs_compat`, producer binding for `TRIGGER_QUEUE`, observability enabled. No consumer binding.
- `workers/monitor/wrangler.jsonc` — name, main, compat date, `nodejs_compat`, two cron triggers (`*/2 * * * *`, `*/5 * * * *`), producer binding for `TRIGGER_QUEUE`, consumer binding for `TRIGGER_QUEUE` with `max_batch_size: 1`, `max_retries: 3`, `dead_letter_queue: clmm-trigger-dlq`.
- Root `wrangler.jsonc` — unchanged (static assets for the PWA).
- Root `package.json` — add `deploy:api`, `deploy:monitor`, `dev:api`, `dev:monitor` scripts. Remove the existing `dev:api` and `dev:worker` that invoke the NestJS entry points.

### Storage connection swap

- Rewrite `packages/adapters/src/outbound/storage/db.ts` to use `@neondatabase/serverless` + `drizzle-orm/neon-http`. Preserve the **factory** export shape: `export function createDb(connectionString: string): Database` and `export type Database = ReturnType<typeof createDb>`. Do not introduce a module-level singleton (`export const db = ...`) under any circumstance. In Workers, `env` is not available at module scope — a singleton constructed at import time cannot receive `DATABASE_URL` and fails at runtime with no clear error trail. Callers receive the `Database` instance from the composition root, never by importing `db` directly from this file.
- **Adapter-import audit (Stage 1 task).** Grep every file under `packages/adapters/src/outbound/storage/` for imports of `db` from `./db` or `../db` or `./db.js`. The expected shape is that every storage adapter receives `db` through its constructor and no file imports a module-level `db` instance. If any adapter imports `db` directly, the skeleton branch fixes it to constructor injection before the Neon swap is considered complete — that's a hidden migration task that must be caught here, not discovered during M2.7 dispatch.
- `drizzle.config.ts` unchanged. Drizzle Kit keeps running in Node for migrations; only runtime uses HTTP.
- `packages/adapters/package.json` — drop `@nestjs/*`, `pg-boss`, `postgres`, `reflect-metadata`. Add `@neondatabase/serverless`, `hono`.

### API worker skeleton

- `workers/api/src/composition.ts` — `Env` interface (`DATABASE_URL`, `SOLANA_RPC_URL`, `TRIGGER_QUEUE: Queue<TriggerEvent>`), `TriggerEvent` type, `buildApiDependencies(env)` with every adapter currently wired by `AppModule.ts`, reflecting post-spec constructor shapes. Returns a `Dependencies` object with named use cases, one entry per use case invoked by any controller.
- `workers/api/src/index.ts` — Hono app, CORS, logger, `/health`, route group mounts for all six routes. Stub route imports resolve because their files exist as empty Hono instances.
- `workers/api/src/routes/positions.ts` — fully ported reference route. Every Hono pattern M2.7 needs appears here: path params, query params, typed JSON body, 4xx errors, 5xx errors, status codes, use-case invocation, per-request dependency construction. Ported against actual `PositionController.ts` endpoints; executable end-to-end.
- `workers/api/src/routes/{alerts,previews,execution,wallet,health}.ts` — empty stubs:
  ```typescript
  export const alertsRoutes = new Hono<{ Bindings: Env }>();
  // TODO: ported by M2.7 slice
  ```

### Monitor worker (no M2.7 slice)

- `workers/monitor/src/composition.ts` — `Env` interface, `buildMonitorDependencies(env)` with the full adapter graph including `BreachEvaluationService`, `DirectionalExitPolicyService`, `PrepareExitPreviewUseCase`, and the application-layer reconciliation entry point (exact name verified during skeleton authoring).
- `workers/monitor/src/index.ts` — `scheduled` with cron branching, `queue` consumer. Both handlers fully implemented. Notification invocation includes an inline comment that `status: 'skipped'` is intended post-spec behavior.
- `workers/monitor/src/handlers/{breach-scan,reconciliation,trigger-consumer}.ts` — extracted handler bodies. Replicate current pg-boss job handler logic minus DI decorators.

### Deletions

- `packages/adapters/src/inbound/http/*Controller.ts`, `AppModule.ts`, `main.ts`, `tokens.ts`, `transient-errors.ts` — all deleted. Controller test files deleted in the same commit.
- `packages/adapters/src/inbound/jobs/` — entire directory deleted, including all `*JobHandler.ts`, `PgBossProvider.ts`, `WorkerModule.ts`, `WorkerLifecycle.ts`, and their test files.
- `packages/adapters/src/composition/` — if it exists, deleted.

### Scope boundary

The skeleton does not:

- Migrate the 5 remaining controllers. Those are M2.7 slices.
- Touch `domain` or `application` except where the four specs already mandate.
- Write or modify drizzle migrations. The `notification_events` migration is owned by the `notification-durable-intent` spec and lands before skeleton work begins.

---

## Handoff doc structure

**Location:** `docs/superpowers/specs/2026-04-14-clmm-v2-workers-migration-m2.7-handoff.md`. Committed to the skeleton branch. Self-contained. Every file path referenced exists in the commit M2.7 checks out. No cross-links to other design docs — stale indirection is the failure mode this design exists to avoid.

### Section 1: Context (≤200 words)

What the task is (port one NestJS controller to one Hono route file). What is already done (skeleton, composition roots, monitor worker, reference route). What M2.7's output is (one file). What success looks like (typecheck passes, no non-target files modified, route behavior matches the controller it replaces). No architecture discussion. No migration rationale.

### Section 2: The golden reference

Path: `workers/api/src/routes/positions.ts`.

Instruction: *"Open this file. Read it completely before writing anything. Every Hono pattern you need is demonstrated there: path params, query params, typed JSON body, 4xx errors, 5xx errors, status codes, dependency construction via `buildApiDependencies(c.env)`, use-case invocation. Your output should look structurally identical, scaled to your target controller's endpoints."*

The doc does not paste the reference route inline. M2.7 reads the file from the checkout. Pasting would duplicate source of truth.

### Section 3: The `Dependencies` shelf

The literal `Dependencies` type exported from `workers/api/src/composition.ts`, copy-pasted verbatim, prefaced with:

> **These are the only use cases and adapters available to you. If the route you are porting appears to need something not listed here, stop and report the gap (see Section 6). Do not invent a use case name. Do not call an adapter method not exposed on this type.**

For each use case, one line showing its signature: `listSupportedPositions.execute({ walletId }): Promise<SupportedPosition[]>`. Method signatures only, no bodies. The exact `Dependencies` shape is locked at skeleton-authoring time after auditing all six controllers.

### Section 4: Forbidden list

Hard rules, numbered:

1. Do not modify any file outside your target route file.
2. Do not edit `composition.ts`. If you think you need a new dependency there, stop and report.
3. Do not add `fetch()` calls to external services. In particular: **do not add Expo Push or any other notification HTTP call.** Notifications in this system are handled elsewhere via a database write; if your route appears to need to send a notification, it does not — it invokes a use case that handles it.
4. Do not add imports from `node:*`, `pg`, `pg-boss`, `@nestjs/*`, or `express`. These are banned in the Workers runtime.
5. Do not use `process.env`. Use `c.env` from the Hono context.
6. Do not "improve" controller logic during porting. Behavior-preserving port only. Preserve status codes. Map thrown error types to matching HTTP statuses.
7. Do not add tests.

### Section 5: Per-controller slices

Five numbered sections, one per controller. Each is a complete, self-contained slice that can be copied into its own M2.7 session together with sections 1-4.

Each slice contains:

- **Target file** — path M2.7 creates/overwrites.
- **Source file** — the NestJS controller being ported. Instruction to open it; its behavior is what must be preserved.
- **Endpoint inventory** — table with columns [Method, **Resolved path**, Params/Body/Query, Use case(s) invoked, Success status, Error cases]. Resolved path is the fully-composed URL (`@Controller('alerts')` + `@Get(':id')` → `/api/alerts/:id`), not the decorator fragments. Extracted by Opus during skeleton authoring; M2.7 uses it as a checklist.
- **Dependencies used by this slice** — filtered subset of the shelf: *"Of the full Dependencies shelf in Section 3, this slice uses these: `listActionableAlerts`, `acknowledgeAlert`. Do not invoke any others from this route file."*
- **Verification step** — exact commands M2.7 runs before declaring done: `pnpm --filter @clmm/adapters typecheck && git status`. Expectation: only the target file changed.

The five slices: `alerts.ts`, `previews.ts`, `execution.ts`, `wallet.ts`, `health.ts`. `positions.ts` is the golden reference, not a slice.

### Section 6: Escalation protocol

If M2.7 finds a genuine gap (use case the controller invokes that isn't on the shelf, adapter method that doesn't exist, import that refuses to resolve), it stops and reports in this format:

```
GAP: <controller file>:<line>
EXPECTED: <what the controller invokes>
AVAILABLE: <nearest matches on Dependencies shelf>
PROPOSED_NAME: <what I would add to Dependencies if you approve>
```

A GAP report returns to Opus (or the user). The skeleton's Dependencies shelf is extended (or the real gap is fixed), committed to the skeleton branch, and that slice is re-dispatched.

### Handoff-doc scope boundaries

- Does not cover the monitor worker. M2.7 never touches it.
- Does not cover composition roots, wranglers, or deletions.
- Does not cover the Neon driver swap or any storage adapter changes.
- Does not describe the four pre-migration specs. When M2.7 checks out the skeleton branch, post-spec shapes are already reflected in the `Dependencies` type, and M2.7 needs no awareness of what changed or why.

---

## Verification and sequencing

### Stage 0 — Pre-migration specs and Neon provisioning (blocking)

Two workstreams, both blocking:

**Specs.** The four specs land first as their own branches and merges, following existing implementation plans: `walletid-contamination-fix`, `notification-durable-intent`, `solana-read-path-efficiency`, `transaction-reference-step-projection`. Migration work does not start until all four are on `main`.

This is a hard blocker. Starting the skeleton against pre-spec shapes and retrofitting it as each spec lands is exactly the multi-source-of-truth reconciliation problem Approach C exists to avoid. Cost of waiting a day for specs to merge is zero. Cost of retrofitting is a full re-verification of everything downstream.

**Neon provisioning and Railway cutover to Neon.** Neon Postgres is provisioned, `DATABASE_URL` for the running Railway API and worker are reconfigured to point at Neon, and any existing data is copied from Railway's Postgres to Neon. This happens *before* any of the four specs run their migrations, so that each spec's drizzle migration (including `notification-durable-intent`'s `notification_events` table) applies to Neon directly, not to Railway's Postgres followed by a later copy.

The Workers migration itself then does not involve a data-layer change — just a code move from Railway's NestJS + pg-boss processes (already talking to Neon) to Cloudflare Workers (also talking to Neon). Stage 4 cutover is a pure DNS / base-URL flip with no data migration in the critical path. This removes the riskiest class of failure (data-layer change during cutover) and makes rollback a code-only operation.

### Stage 1 — Skeleton branch (Opus, one session)

Branch name: `feat/workers-migration-skeleton`. Deliverables are exactly what "Skeleton scope" enumerates. Stage closes when all of the following pass:

1. `pnpm install` succeeds against the post-migration dependency set.
2. `pnpm typecheck` passes across every package.
3. `pnpm --filter @clmm/adapters test` passes. Domain and application tests are untouched; surviving adapter tests (storage adapters, snapshot reader, etc.) still pass.
4. `cd workers/api && pnpm wrangler dev` starts without error. `curl localhost:8787/health` returns 200. `curl localhost:8787/api/positions/<testWallet>` returns a real response (or a well-formed empty result against a test DB). The five stubbed routes return 404 — expected; they're empty Hono instances.
5. `cd workers/monitor && pnpm wrangler dev --test-scheduled` starts without error. Manually triggering both cron paths (`?cron=*/2+*+*+*+*` and `?cron=*/5+*+*+*+*`) executes the full handler logic against the test DB without throwing.

The skeleton branch is **not merged to main at this point.** It stays a branch. Railway continues to serve production.

### Stage 2 — Handoff doc authoring (Opus, same session)

After Stage 1 verification passes, the handoff doc is written to the path specified in "Handoff doc structure," including all five per-controller slices with resolved endpoint paths, filtered Dependencies subsets, and endpoint inventories. Committed to the skeleton branch. Stage closes when the spec self-review passes (no placeholders, internal consistency, no ambiguity in per-slice instructions).

### Stage 3 — M2.7 slice dispatch (five separate sessions, parallel-safe)

Each slice is an independent M2.7 session checking out the skeleton branch. Order does not matter between slices — they write to disjoint files, touch nothing shared. After each slice returns:

1. The target route file exists.
2. `git status` shows only that file modified or created.
3. `pnpm --filter @clmm/adapters typecheck` passes.
4. Curl spot-check against the running `wrangler dev` API worker matches the behavior of the old controller for a representative endpoint.
5. If M2.7 returns a GAP report, Opus extends the skeleton's Dependencies shelf (or fixes the real gap), commits to the skeleton branch, re-dispatches that slice only.

Slices merge into the skeleton branch as each is accepted — not individual PRs, just commits.

### Stage 4 — Cutover

Skeleton branch complete. Run full `pnpm test` and `pnpm typecheck` top-to-bottom. Deploy to a preview Workers environment. Smoke test: wallet connect → list positions → view position detail → simulate a breach trigger via monitor test-scheduled endpoint → confirm `notification_events` row written → check reconciliation cron against a known pending attempt.

If all green: merge skeleton branch to main, run `pnpm deploy:api && pnpm deploy:monitor && pnpm deploy:app` against production Cloudflare, update DNS / front-end base URLs pointing at Railway, verify production traffic flows end-to-end, then tear down Railway after a 72-hour cool-off period.

If not green: stay on the branch, fix, re-verify.

### Rollback posture

Until Stage 4 flips DNS / base URLs, production is unaffected. Railway stays up. Skeleton branch is unmerged. Rollback is a git revert on a branch nobody depends on yet.

Post-cutover rollback is reverting the DNS / base URL change and redeploying the pre-cutover frontend. Railway infrastructure remains reachable for 72 hours before teardown to cover late-surfacing dependencies (webhooks, forgotten integrations pointing at old URLs).

### What this sequencing deliberately does not do

- **No canary / gradual rollout.** ~100 req/day; split-traffic infrastructure is overkill. Preview smoke test is the rollout.
- **No "migrate half, run both, compare" phase.** Two backends against one database is zero operational benefit; pg-boss workers racing Cloudflare cron against the same triggers is a correctness risk, not a safety net.
- **No per-slice CI gate.** Slices are small, isolated, verified by local typecheck + curl. A PR per slice adds ceremony without signal.
- **No data migration during the Workers cutover.** The Railway → Neon data move is a Stage 0 concern, completed before any spec or skeleton work begins. Stage 4 is a pure code / DNS flip. Combining code migration and data migration in the same cutover window is the single largest avoidable risk in a project like this, and this sequencing avoids it entirely.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Reference doc drift during skeleton authoring introduces bugs in `positions.ts` that propagate to all five slices via pattern replication. | Golden route is verified end-to-end against `wrangler dev` before the handoff doc is written. Verification step #4 in Stage 1 is non-optional. |
| M2.7 hallucinates a use case name that doesn't exist on the Dependencies shelf. | Filtered Dependencies subset per slice is a whitelist. Forbidden list rule #2 prohibits editing `composition.ts`. Escalation protocol requires a GAP report rather than improvisation. TypeScript catches name mismatches at typecheck. |
| M2.7 "fixes" the notification path by adding Expo push because `status: 'skipped'` looks like a placeholder. | Forbidden list rule #3 is explicit about notifications. The monitor worker (where the notification invocation lives) is not in M2.7's scope anyway. |
| A pre-migration spec lands late and the skeleton gets started against partial post-spec shapes. | Stage 0 is a hard blocker. Do not start the skeleton until all four specs are on `main`. |
| Spec migrations run against Railway's Postgres because Neon isn't live yet, forcing a data copy later that includes the new `notification_events` table schema. | Stage 0's second workstream provisions Neon and switches `DATABASE_URL` *before* any spec migrations run. Specs apply to Neon directly. No schema drift between environments. |
| Neon HTTP driver behaves differently than expected under load or long-running queries. | Free-tier request volume (~100/day) makes this a non-issue in practice. If a specific query times out, Neon's `sql.transaction()` HTTP batching is the fallback. Smoke test in Stage 4 catches this before cutover. |
| Cloudflare cron + queue behavior differs from local `wrangler dev`. | Stage 4 preview deployment exercises real Cloudflare infrastructure before the DNS flip. |

## Migration

No data migration owned by this work. The Railway → Neon data copy and the switch of the running Railway API's `DATABASE_URL` to Neon are both part of Stage 0 (see "Neon provisioning and Railway cutover to Neon"), and happen before any of the four pre-migration specs run their drizzle migrations. By the time the skeleton branch is authored, Neon is already the live database. The Workers migration is a code-only move.

## Open questions

None. All decisions are locked:

- Queue name: `TRIGGER_QUEUE`.
- Reconciliation as a second cron, not a second queue.
- `SolanaPositionSnapshotReader` as a single shared instance per composition root.
- Monitor handler bodies extracted into `handlers/*.ts`, not inlined in `index.ts`.
- Stub files for the five non-golden routes, typechecking as empty Hono instances.
- Railway tear-down after 72-hour post-cutover cool-off.
