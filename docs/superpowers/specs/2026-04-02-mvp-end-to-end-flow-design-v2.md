# MVP End-to-End Out-of-Range Flow — Design v2

**Goal:** Wire the remaining stubbed and disconnected parts of CLMM V2 so a connected wallet can progress from a real out-of-range Orca position through backend-triggered detection, directional preview, explicit user-signed execution, lifecycle reconciliation, and durable history — producing a shippable non-custodial MVP.

**Scope:** Orca-only, non-custodial, user-signed exits. No product scope expansion.

**Supersedes:** `2026-03-31-working-mvp-end-to-end-out-of-range-flow-design.md`

---

## 1. Current State (Audited)

This section is grounded in a codebase audit, not assumptions.

### What exists and works

| Layer | State | Evidence |
|-------|-------|----------|
| Domain services | Complete | 6 services: DirectionalExitPolicyService, TriggerQualificationService, ExecutionPlanFactory, ExecutionStateReducer, PreviewFreshnessPolicy, RetryBoundaryPolicy — all tested |
| Application layer | Complete | 17 port interfaces, 22 use cases, full DTO layer |
| BFF controllers | Complete | 4 NestJS controllers (Position, Alert, Preview, Execution) with real DI wiring |
| Outbound adapters | ~95% | Orca reads, Solana range observation, Jupiter quotes, execution prep/submit, wallet signing (native + browser), Expo push, in-app alerts, telemetry — all real. Only WebPushAdapter is a stub |
| Storage adapters | Complete | 5 Drizzle tables (breach_episodes, exit_triggers, execution_previews, execution_attempts, execution_sessions, history_events). OperationalStorageAdapter implements 3 repos. One gap: `getOutcomeSummary` returns null |
| UI screens | Complete | 10 screens, 6 view models, 2 presenters, 12+ components, design system |
| Testing infra | Complete | 18 fakes, fixtures, 3 port contracts, 4 scenario tests including BreachToExitScenario |

### What is stubbed or missing

| Gap | Current State | Impact |
|-----|---------------|--------|
| Worker job handlers | All 4 are `console.log('stub')` — BreachScan, TriggerQualification, Reconciliation, NotificationDispatch | No automated breach detection exists |
| pg-boss integration | Zero pg-boss code anywhere — WorkerModule has providers but no job registration or scheduling | Worker cannot run |
| Monitored-wallet registry | No table, no port, no enrollment mechanism | Worker has no wallets to scan |
| WorkerModule composition | Bare NestJS module — no port injection, no pg-boss setup | Job handlers have no dependencies |
| AdaptersModule (shared) | Empty `@Module({})` | No shared adapter wiring |
| App route data wiring | 6 of 9 routes are thin re-exports (`export default SomeScreen`) — no TanStack Query, no params, no navigation | App cannot fetch or display backend state |
| Drizzle migrations | Schema files exist, no migration files generated | DB tables don't exist in Postgres |
| `getOutcomeSummary` | Returns null | History screen cannot show outcome aggregation |

### Where the pipeline breaks

```
Wallet enrolled for monitoring        ← MISSING (no wallet registry)
         │
pg-boss schedules scan job            ← MISSING (no pg-boss integration)
         │
BreachScanJobHandler runs             ← STUB
         │
TriggerQualificationJobHandler runs   ← STUB
         │
Trigger persisted to Postgres         ← EXISTS (schema + adapter ready)
         │
BFF serves alerts/preview             ← EXISTS (controllers ready)
         │
App route fetches backend state       ← MISSING (thin re-exports)
         │
User reviews directional preview      ← MISSING (thin re-export)
         │
User signs via MWA/browser wallet     ← MISSING (thin re-export)
         │
ReconciliationJobHandler updates      ← STUB
         │
NotificationDispatchJobHandler fires  ← STUB
         │
App shows result + history            ← MISSING (thin re-exports)
```

The domain, application, BFF, and outbound adapters are real. The gaps are: worker infrastructure, wallet registry, app route wiring, and Drizzle migrations.

---

## 2. Directional Invariant (Unchanged — Restated for Completeness)

```
lower-bound-breach → remove liquidity → collect fees → swap SOL→USDC → exit-to-usdc
upper-bound-breach → remove liquidity → collect fees → swap USDC→SOL → exit-to-sol
```

This mapping lives ONLY in `DirectionalExitPolicyService`. No adapter, worker, UI, or BFF layer may re-derive direction from token order or price comparison.

---

## 3. Architecture

### State Ownership

| State | Owner | Access pattern |
|-------|-------|----------------|
| Monitored wallet set | Postgres (new `monitored_wallets` table) | Written on wallet-connect enrollment; read by breach scan job |
| Position snapshots | Backend read model (Postgres cache) | Written by position read adapter; served by BFF |
| Breach episodes + triggers | Postgres (existing tables) | Written by qualification job; read by BFF alert queries |
| Execution previews | Postgres (existing table) | Written by preview use case; read/refreshed by BFF |
| Execution attempts + sessions | Postgres (existing tables) | Written by approval flow; updated by reconciliation job |
| History timeline | Postgres (existing table) | Appended on every lifecycle transition; read by BFF |
| Wallet keys / signing authority | User wallet ONLY — never backend | Signing happens on client device only |
| Route state + query cache | App (Zustand + TanStack Query) | Populated from BFF responses; invalidated on mutations |

### System Sequence (One Complete User Journey)

```
┌─────────────┐     ┌────────────────┐     ┌──────────────┐     ┌───────────┐
│  pg-boss    │     │  Worker        │     │  BFF         │     │  App      │
│  scheduler  │     │  (NestJS)      │     │  (NestJS)    │     │  (Expo)   │
└──────┬──────┘     └───────┬────────┘     └──────┬───────┘     └─────┬─────┘
       │                    │                     │                    │
       │ cron: breach-scan  │                     │                    │
       ├───────────────────>│                     │                    │
       │                    │                     │                    │
       │         ┌──────────┴──────────┐          │                    │
       │         │ For each monitored  │          │                    │
       │         │ wallet:             │          │                    │
       │         │ 1. Load positions   │          │                    │
       │         │ 2. Observe range    │          │                    │
       │         │ 3. Detect breach    │          │                    │
       │         │ 4. Enqueue qualify  │          │                    │
       │         └──────────┬──────────┘          │                    │
       │                    │                     │                    │
       │ qualify-trigger    │                     │                    │
       ├───────────────────>│                     │                    │
       │                    │                     │                    │
       │         ┌──────────┴──────────┐          │                    │
       │         │ 1. Evaluate confirm │          │                    │
       │         │ 2. Persist trigger  │          │                    │
       │         │ 3. Enqueue notify   │          │                    │
       │         └──────────┬──────────┘          │                    │
       │                    │                     │                    │
       │ notify-dispatch    │                     │                    │
       ├───────────────────>│                     │                    │
       │                    │──── push/in-app ────────────────────────>│
       │                    │                     │                    │
       │                    │                     │  GET /alerts/:wid  │
       │                    │                     │<───────────────────│
       │                    │                     │── trigger list ───>│
       │                    │                     │                    │
       │                    │                     │ POST /preview      │
       │                    │                     │<───────────────────│
       │                    │                     │── preview ────────>│
       │                    │                     │                    │
       │                    │                     │ POST /approve      │
       │                    │                     │<───────────────────│
       │                    │                     │── payload ────────>│
       │                    │                     │                    │
       │                    │                     │                    │── sign (MWA)
       │                    │                     │                    │
       │                    │                     │ POST /submit       │
       │                    │                     │<───────────────────│
       │                    │                     │── submitted ──────>│
       │                    │                     │                    │
       │ reconcile          │                     │                    │
       ├───────────────────>│                     │                    │
       │         ┌──────────┴──────────┐          │                    │
       │         │ 1. Check chain      │          │                    │
       │         │ 2. Update lifecycle │          │                    │
       │         │ 3. Append history   │          │                    │
       │         └──────────┬──────────┘          │                    │
       │                    │                     │                    │
       │                    │                     │ GET /execution/:id │
       │                    │                     │<───────────────────│
       │                    │                     │── result ─────────>│
```

---

## 4. New Schema: Monitored Wallets

The worker needs an authoritative set of wallets to scan. This requires one new Drizzle table.

### Table: `monitored_wallets`

```
monitored_wallets
├── wallet_id       TEXT PRIMARY KEY    -- Solana wallet address
├── enrolled_at     BIGINT NOT NULL     -- ClockTimestamp of enrollment
├── last_scanned_at BIGINT              -- ClockTimestamp of last completed scan (null = never)
└── active          BOOLEAN NOT NULL DEFAULT true
```

### New Port: `MonitoredWalletRepository`

Location: `packages/application/src/ports/index.ts`

```typescript
export interface MonitoredWalletRepository {
  enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void>;       // upsert
  unenroll(walletId: WalletId): Promise<void>;                                 // soft-deactivate
  listActiveWallets(): Promise<Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>>;
  markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void>;
}
```

### Enrollment Trigger

Enrollment happens when the app establishes a wallet session via `ConnectWalletSession`. The BFF exposes `POST /wallets/:walletId/monitor` called by the app after successful wallet connection. This is idempotent — re-connecting an already-enrolled wallet is a no-op.

---

## 5. pg-boss Integration

pg-boss is the job queue. It uses the existing Postgres instance (no Redis).

### Setup

The `WorkerModule` must:

1. Initialize a pg-boss instance connected to the Railway Postgres
2. Register job handlers for the 4 job types
3. Schedule the `breach-scan` job on a recurring interval (60s MVP default)

### Job Definitions

| Job Name | Trigger | Payload | Handler |
|----------|---------|---------|---------|
| `breach-scan` | pg-boss cron schedule (every 60s) | `{}` (scans all active wallets) | `BreachScanJobHandler` |
| `qualify-trigger` | Enqueued by breach-scan handler | `{ positionId, walletId, directionKind, observedAt }` | `TriggerQualificationJobHandler` |
| `reconcile-execution` | Enqueued after submission | `{ attemptId }` | `ReconciliationJobHandler` |
| `dispatch-notification` | Enqueued after trigger creation | `{ triggerId, walletId, positionId, directionKind }` | `NotificationDispatchJobHandler` |

### Idempotency

- `breach-scan`: pg-boss cron ensures single active instance. `markScanned` timestamp prevents re-scanning within interval.
- `qualify-trigger`: `TriggerQualificationService` + episode idempotency key prevents duplicate triggers for the same breach episode.
- `reconcile-execution`: Job uses `attemptId` as idempotency key. Reconciliation is safe to retry.
- `dispatch-notification`: `NotificationDedupPort.hasDispatched(triggerId)` prevents duplicate dispatch.

---

## 6. Worker Job Handler Specifications

### 6.1 BreachScanJobHandler

**Injected ports:** MonitoredWalletRepository, SupportedPositionReadPort, RangeObservationPort, ClockPort, ObservabilityPort, pg-boss (for enqueue)

**Algorithm:**
1. Load all active monitored wallets
2. For each wallet:
   a. Load supported positions via `SupportedPositionReadPort`
   b. For each position, observe range state via `RangeObservationPort`
   c. If range state is `below-range` or `above-range`, map to `BreachDirection`:
      - `below-range` → `{ kind: 'lower-bound-breach' }`
      - `above-range` → `{ kind: 'upper-bound-breach' }`
   d. Enqueue `qualify-trigger` job with `{ positionId, walletId, directionKind, observedAt }`
   e. Record detection timing via `ObservabilityPort`
3. Mark wallet as scanned via `MonitoredWalletRepository.markScanned`

**Error handling:** Per-wallet failures are caught and logged. A single wallet failure does not abort the scan for remaining wallets.

### 6.2 TriggerQualificationJobHandler

**Injected ports:** TriggerRepository, ClockPort, IdGeneratorPort, ObservabilityPort, pg-boss

**Algorithm:**
1. Build observation context from job payload
2. Call `TriggerQualificationService.evaluate` to determine if observation qualifies
3. If qualified:
   a. Persist breach episode via `TriggerRepository.saveEpisode`
   b. Check episode idempotency via `TriggerRepository.getActiveEpisodeTrigger`
   c. If no active trigger for this episode: persist trigger via `TriggerRepository.saveTrigger`
   d. Enqueue `dispatch-notification` job
4. If not qualified: log and discard

**Error handling:** Failures are logged. pg-boss retries with backoff (3 attempts, exponential).

### 6.3 ReconciliationJobHandler

**Injected ports:** ExecutionRepository, ExecutionSubmissionPort, ExecutionHistoryRepository, ExecutionStateReducer (domain), ClockPort, ObservabilityPort

**Algorithm:**
1. Load execution attempt by `attemptId`
2. If attempt is not in `submitted` state, log warning and exit
3. Call `ExecutionSubmissionPort.reconcileExecution` with stored transaction references
4. Reduce confirmed steps through `ExecutionStateReducer` to determine new lifecycle state
5. Update attempt state via `ExecutionRepository.updateAttemptState`
6. Append history event via `ExecutionHistoryRepository.appendEvent`

**Error handling:** If chain query fails, job is retried. After max retries (5), attempt remains in `submitted` state — the app shows "pending confirmation" honestly.

### 6.4 NotificationDispatchJobHandler

**Injected ports:** NotificationPort, NotificationDedupPort, TriggerRepository, ObservabilityPort, ClockPort

**Algorithm:**
1. Check `NotificationDedupPort.hasDispatched(triggerId)` — skip if already sent
2. Load trigger via `TriggerRepository.getTrigger`
3. Call `NotificationPort.sendActionableAlert` with trigger context
4. Mark dispatched via `NotificationDedupPort.markDispatched`
5. Record delivery timing via `ObservabilityPort.recordDeliveryTiming`

**Error handling:** Notification delivery failure is logged but not fatal. The trigger exists in the database regardless — the app can show alerts even if push fails.

---

## 7. BFF Additions

The existing 4 controllers cover most queries. Two additions are needed:

### 7.1 Wallet Monitoring Enrollment

`POST /wallets/:walletId/monitor` — calls `MonitoredWalletRepository.enroll`

Response: `{ enrolled: true, enrolledAt: number }`

This endpoint is called by the app after wallet connection. It is idempotent.

### 7.2 Execution Submission Endpoint

The existing execution controller needs a `POST /executions/:attemptId/submit` endpoint that:

1. Accepts the signed payload from the client
2. Calls `ExecutionSubmissionPort.submitExecution`
3. Updates attempt state to `submitted`
4. Enqueues `reconcile-execution` job
5. Appends history event
6. Returns submission result with transaction references

Verify the existing controller already handles this, or add it.

---

## 8. App Route Wiring

Each thin re-export route must become a data-fetching route component that passes backend state to the UI screen.

### Pattern

Each route file in `apps/app/app/` follows the same structure:

1. Extract route params via `useLocalSearchParams`
2. Fetch backend data via TanStack Query hooks (defined in `packages/ui/src/view-models/`)
3. Handle loading/error states
4. Pass fetched data to the UI screen component

### Route-by-Route Specification

| Route | Params | Query | Screen |
|-------|--------|-------|--------|
| `(tabs)/positions.tsx` | none (wallet from context) | `useListPositions(walletId)` | `PositionsListScreen` |
| `(tabs)/alerts.tsx` | none (wallet from context) | `useListAlerts(walletId)` | `AlertsListScreen` |
| `(tabs)/history.tsx` | none (wallet from context) | `useExecutionHistory(walletId)` | `HistoryListScreen` |
| `position/[id].tsx` | `id: PositionId` | `usePositionDetail(id)` + `usePositionAlert(id)` | `PositionDetailScreen` |
| `preview/[triggerId].tsx` | `triggerId: ExitTriggerId` | `usePreview(triggerId)` | `ExecutionPreviewScreen` |
| `signing/[attemptId].tsx` | `attemptId: string` | `useExecutionAttempt(attemptId)` | `SigningScreen` |
| `execution/[attemptId].tsx` | `attemptId: string` | `useExecutionAttempt(attemptId)` | `ExecutionResultScreen` |

### TanStack Query Hook Locations

These hooks belong in `packages/ui/src/view-models/` because they orchestrate data fetching for screens. They call application public API functions which are injected via React context at the composition root (`apps/app/src/composition/`).

### Navigation Flow

```
positions tab ──> position/[id] ──> preview/[triggerId] ──> signing/[attemptId] ──> execution/[attemptId]
                                                                                          │
alerts tab ───> position/[id] ──> preview/[triggerId]                                     │
                                                                              history tab <─┘
```

Navigation always carries backend IDs. No client-side state is invented.

### Wallet Context

A Zustand store in `packages/ui/` holds the connected wallet ID. All tab routes read from this store. If no wallet is connected, routes redirect to the connect screen.

---

## 9. Drizzle Migration Strategy

Schema files exist but no migrations have been generated.

### Steps

1. Add the `monitored_wallets` table to the Drizzle schema
2. Run `pnpm db:generate` to create migration files for ALL tables (first migration covers everything)
3. Run `pnpm db:migrate` against Railway Postgres (or local dev Postgres)
4. Verify tables exist with `pnpm db:studio`

This is a prerequisite for all worker and BFF work. Nothing that reads or writes Postgres can work without migrations applied.

---

## 10. Degraded State Handling

The original design did not cover what happens when things go wrong. Each failure mode must degrade honestly.

| Failure | User-Visible Behavior | System Behavior |
|---------|----------------------|-----------------|
| Orca position read fails | "Unable to load positions — retrying" | Worker logs error, skips wallet, retries next cycle |
| Jupiter quote fails | Preview shows "quote unavailable" | Preview creation fails, no stale data served |
| MWA handoff interrupted | Signing screen shows "signature interrupted — tap to retry" | Attempt stays in `awaiting-signature`, no state corruption |
| Reconciliation timeout | Result screen shows "confirming on chain..." | Attempt stays in `submitted`, reconciliation job retries |
| Push notification fails | Alert still visible in alerts tab | Trigger exists in DB; notification failure is non-blocking |
| Wallet not enrolled | No alerts appear | Worker has no wallets; enrollment happens on next connect |
| Stale preview | "Preview expired — tap to refresh" | Signing blocked until fresh preview created |
| Partial execution | "Exit partially completed — manual review needed" | Attempt terminal at `partial`; no blind retry |

---

## 11. Delivery Phases

### Phase 1: Database Foundation
**Scope:** Drizzle migrations + monitored wallet registry

**Tasks:**
1. Add `monitored_wallets` schema to `packages/adapters/src/outbound/storage/schema/`
2. Add `MonitoredWalletRepository` port to `packages/application/src/ports/index.ts`
3. Implement `MonitoredWalletStorageAdapter` in `packages/adapters/src/outbound/storage/`
4. Add fake to `packages/testing/src/fakes/`
5. Generate Drizzle migrations for all tables
6. Apply migrations to dev Postgres
7. Implement `getOutcomeSummary` in `OffChainHistoryStorageAdapter`

**Verification:** `pnpm db:studio` shows all 6 tables. `MonitoredWalletStorageAdapter` passes port contract tests. `pnpm typecheck` passes.

**Risk:** Low. Schema already designed; this is mechanical.

### Phase 2: pg-boss Worker Infrastructure
**Scope:** pg-boss setup + WorkerModule composition + all 4 job handlers

**Tasks:**
1. Add pg-boss dependency
2. Create pg-boss provider in WorkerModule (connection to Railway Postgres)
3. Register job schedules (breach-scan cron)
4. Wire port dependencies into WorkerModule (AdaptersModule must provide them)
5. Implement `BreachScanJobHandler` with real port calls
6. Implement `TriggerQualificationJobHandler` with real port calls
7. Implement `ReconciliationJobHandler` with real port calls
8. Implement `NotificationDispatchJobHandler` with real port calls
9. Wire `AdaptersModule` to export all needed adapters

**Verification:** Worker starts with `pnpm dev:worker`. Breach scan job runs on schedule. Given a monitored wallet with an out-of-range position, a trigger row appears in `exit_triggers`. `pnpm test:adapters` passes.

**Risk:** Medium. pg-boss integration is new to the codebase. The WorkerModule needs non-trivial DI wiring.

**Dependency:** Phase 1 (migrations must exist before worker can write to Postgres).

### Phase 3: BFF Completion + Enrollment
**Scope:** Monitoring enrollment endpoint + verify existing query surfaces

**Tasks:**
1. Add `POST /wallets/:walletId/monitor` to a wallet controller (or Position controller)
2. Wire `MonitoredWalletRepository` into BFF DI (AppModule)
3. Audit existing BFF controllers to confirm they return real data (not stubs)
4. Add or fix any missing query endpoints (execution history, attempt detail)
5. Add `POST /executions/:attemptId/submit` if not already present

**Verification:** `curl` or test suite confirms all endpoints return real Postgres-backed data. Enrollment creates a row in `monitored_wallets`. `pnpm test:adapters` passes.

**Risk:** Low. Most controllers already exist and work.

**Dependency:** Phase 1 (for monitored wallet table). Phase 2 NOT required — BFF reads DB that worker writes, but BFF can be tested independently with manual DB inserts.

### Phase 4: App Route Wiring
**Scope:** Replace thin re-exports with data-fetching route components

**Tasks:**
1. Create TanStack Query hooks in `packages/ui/src/view-models/` for each query
2. Create application context provider in `apps/app/src/composition/` that supplies use case functions
3. Wire `(tabs)/positions.tsx` with `useListPositions`
4. Wire `(tabs)/alerts.tsx` with `useListAlerts`
5. Wire `(tabs)/history.tsx` with `useExecutionHistory`
6. Wire `position/[id].tsx` with `usePositionDetail`
7. Wire `preview/[triggerId].tsx` with `usePreview`
8. Wire `signing/[attemptId].tsx` with `useExecutionAttempt`
9. Wire `execution/[attemptId].tsx` with `useExecutionAttempt`
10. Add wallet-connect enrollment call after successful connection
11. Add loading/error states to all routes

**Verification:** App navigates full flow: positions → detail → preview → signing → result. All screens show real backend data (or loading/error states). `pnpm typecheck` and `pnpm lint` pass.

**Risk:** Medium. Route wiring involves coordinating React context, TanStack Query, and Expo Router params.

**Dependency:** Phase 3 (BFF endpoints must serve real data). Phase 2 is useful for real triggers but not strictly required (can test with manual DB inserts).

### Phase 5: Signing + Submission Flow
**Scope:** Connect the approval → sign → submit → reconcile chain through the app

**Tasks:**
1. Wire preview "Approve" action to `POST /executions/approve` → creates attempt
2. Wire attempt creation response to signing screen navigation
3. Wire signing screen to `WalletSigningPort` (MWA for native, browser adapter for PWA)
4. Wire signed payload to `POST /executions/:attemptId/submit`
5. Wire submission response to result screen navigation
6. Verify reconciliation job picks up submitted attempts
7. Wire result screen polling/refresh for lifecycle state updates
8. Handle decline, interruption, and MWA handoff return

**Verification:** Full signing flow completes: preview → approve → sign → submit → confirmed/failed. Decline and interruption paths show correct UI states. `pnpm test:e2e` scenario passes.

**Risk:** High. MWA handoff is the most complex integration point. Browser wallet signing is simpler but still needs testing.

**Dependency:** Phase 2 (reconciliation job), Phase 3 (submission endpoint), Phase 4 (route wiring).

### Phase 6: Notifications + Deep Links
**Scope:** Push notification dispatch + deep-link re-entry

**Tasks:**
1. Verify `NotificationDispatchJobHandler` sends via Expo Push
2. Add notification dedup storage (can use existing Postgres or a simple table)
3. Wire deep-link entry points in `apps/app/app/` to resolve backend IDs
4. Wire notification tap → deep link → preview/history route
5. Add deep-link resolution using `DeepLinkEntryPort` adapter

**Verification:** Out-of-range detection → push notification arrives → tap opens app at correct preview/position. Duplicate notifications are suppressed. `pnpm test:adapters` notification contract passes.

**Risk:** Medium. Push notification delivery is best-effort and hard to test in CI. Manual verification required.

**Dependency:** Phase 2 (notification job), Phase 4 (routes must handle deep-link params).

### Phase Dependency Graph

```
Phase 1 ──> Phase 2 ──> Phase 5
   │            │           │
   └──> Phase 3 ┘     Phase 6
            │              │
        Phase 4 ───────────┘
```

Phases 2 and 3 can proceed in parallel after Phase 1.
Phase 4 can begin as soon as Phase 3 is done.
Phase 5 requires Phases 2, 3, and 4.
Phase 6 requires Phases 2 and 4.

---

## 12. Testing Strategy (Per Phase)

### Phase 1: Database Foundation
- Port contract test for `MonitoredWalletRepository` (enroll, unenroll, listActive, markScanned)
- Unit test for `getOutcomeSummary` implementation
- Integration test: Drizzle migration applies cleanly to fresh Postgres

### Phase 2: Worker Infrastructure
- Unit test each job handler with fakes from `packages/testing`
- `BreachScanJobHandler`: given 2 wallets (1 with out-of-range position), produces exactly 1 qualify-trigger enqueue
- `TriggerQualificationJobHandler`: given qualifying observation, persists trigger; given duplicate, skips
- `ReconciliationJobHandler`: given submitted attempt with confirmed chain state, transitions to confirmed
- `NotificationDispatchJobHandler`: given un-dispatched trigger, calls notification port; given dispatched, skips
- Integration test: pg-boss starts, registers jobs, fires scheduled breach-scan

### Phase 3: BFF Completion
- Controller tests for wallet enrollment endpoint
- Verify all existing controller tests still pass
- Integration test: enrollment → list active wallets returns enrolled wallet

### Phase 4: App Route Wiring
- View model hook tests with mocked API responses
- Route-level render tests: each route renders loading state, then content, handles error
- Navigation test: position list → detail → preview navigates with correct params

### Phase 5: Signing Flow
- Scenario test: preview → approve → sign → submit → confirmed (extend BreachToExitScenario)
- Scenario test: preview → approve → decline → attempt stays awaiting-signature
- Scenario test: submit → reconcile → partial → no retry available
- MWA handoff: manual test on device (cannot be fully automated)

### Phase 6: Notifications + Deep Links
- NotificationDispatchJobHandler dedup test
- Deep link parsing test via `DeepLinkEntryPort`
- Manual test: notification → tap → app opens at correct route

---

## 13. Manual Verification Checklist (End-to-End)

The MVP is complete when this journey succeeds on a real device/browser:

1. [ ] Connect wallet (MWA on mobile, browser adapter on web)
2. [ ] Wallet enrolled for monitoring (verify `monitored_wallets` row)
3. [ ] Position list shows real supported Orca positions
4. [ ] Worker detects out-of-range position (verify `exit_triggers` row created)
5. [ ] Alerts tab shows actionable alert with correct directional label
6. [ ] Tap alert → position detail shows directional context
7. [ ] Tap "View Exit Preview" → preview shows ordered steps + freshness
8. [ ] Tap "Approve" → signing screen shows awaiting-signature state
9. [ ] Sign transaction → submission screen shows submitted state
10. [ ] Reconciliation confirms → result screen shows confirmed + tx reference
11. [ ] History tab shows complete timeline: trigger → preview → sign → submit → confirmed
12. [ ] Push notification received for out-of-range detection
13. [ ] Tap notification → app opens at correct preview/position
14. [ ] Stale preview blocks signing and shows refresh prompt
15. [ ] Declined signature shows correct state without corruption
16. [ ] Partial execution shows terminal state without retry option

---

## 14. Non-Goals

This design does not add:

- Autonomous/scheduled/delegated execution
- Portfolio analytics or yield dashboards
- Multi-protocol support (Orca only)
- Multi-chain support
- Backend custody or signing authority
- On-chain receipts, attestations, proofs, or claim verification
- WebPushAdapter implementation (stub is acceptable for MVP; Expo push is primary)
- Generic wallet features (transfer, stake, arbitrary swap)

---

## 15. Open Questions

| Question | Impact | Default if unresolved |
|----------|--------|-----------------------|
| Should breach-scan run per-wallet or batch all wallets? | Job granularity + failure isolation | Batch all wallets in one job; per-wallet error isolation within handler |
| What is the MVP confirmation policy threshold? | How many observations before trigger qualifies | 1 observation (immediate qualification for MVP) |
| Should preview creation be eager (on trigger creation) or lazy (on user request)? | Latency vs resource usage | Lazy — created when user opens preview route |
| How long before a preview is considered stale? | Freshness UX | 60 seconds (configurable via PreviewFreshnessPolicy) |
| Reconciliation polling interval after submission? | Confirmation latency | 5 seconds for first 30s, then 15 seconds, max 10 minutes |

---

## Appendix A: Files to Create or Modify

### New Files
- `packages/adapters/src/outbound/storage/schema/monitored-wallets.ts` — Drizzle schema
- `packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.ts` — adapter
- `packages/testing/src/fakes/FakeMonitoredWalletRepository.ts` — fake
- `drizzle/migrations/0001_initial.sql` (or equivalent generated migration)

### Modified Files
- `packages/application/src/ports/index.ts` — add `MonitoredWalletRepository` port
- `packages/adapters/src/outbound/storage/schema/index.ts` — export new schema
- `packages/adapters/src/inbound/jobs/WorkerModule.ts` — pg-boss setup + DI
- `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` — real implementation
- `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` — real implementation
- `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts` — real implementation
- `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts` — real implementation
- `packages/adapters/src/composition/AdaptersModule.ts` — shared adapter wiring
- `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts` — implement `getOutcomeSummary`
- `apps/app/app/(tabs)/alerts.tsx` — data-fetching wiring
- `apps/app/app/(tabs)/history.tsx` — data-fetching wiring
- `apps/app/app/position/[id].tsx` — data-fetching wiring
- `apps/app/app/preview/[triggerId].tsx` — data-fetching wiring
- `apps/app/app/signing/[attemptId].tsx` — data-fetching wiring
- `apps/app/app/execution/[attemptId].tsx` — data-fetching wiring
- BFF controller file(s) — enrollment endpoint + submission endpoint
