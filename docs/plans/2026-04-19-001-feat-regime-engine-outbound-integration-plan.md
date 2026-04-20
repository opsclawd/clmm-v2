---
title: "feat: CLMM outbound regime-engine integration (Units 4 & 5)"
type: feat
status: active
date: 2026-04-19
origin: docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md
---

# feat: CLMM outbound regime-engine integration (Units 4 & 5)

> **Target repo:** `clmm-superpowers-v2` (this repo). All paths below are repo-relative unless otherwise stated. The counterpart repo is `regime-engine`.

## 1. Overview

This plan details the CLMM-side integration work that remains after `regime-engine` PR [#15](https://github.com/opsclawd/regime-engine/pull/15) landed Units 1–3 (S/R ledger persistence + S/R HTTP surface + CLMM execution-event ingest). The regime-engine side now exposes:

- `GET  /v1/sr-levels/current?symbol=&source=` — public read, 404 when empty
- `POST /v1/sr-levels` — `X-Ingest-Token` guarded (consumed by OpenClaw, not CLMM)
- `POST /v1/clmm-execution-result` — `X-CLMM-Internal-Token` guarded

This plan covers the two CLMM-side changes that consume those endpoints:

- **Unit 4** — outbound adapter that posts a terminal-only execution event, wired at **both** reconciliation seams.
- **Unit 5** — outbound adapter that fetches the current SOL/USDC+mco S/R brief, BFF enrichment of `PositionDetailDto`, app-side parser extension, and UI rendering with freshness + empty states.

Both units are adapter-layer + UI work in this repo. No changes to `packages/domain` or `packages/application` ports are introduced by this plan.

## 2. Problem Frame

CLMM reaches terminal execution state at two seams (inline fast-path in `ExecutionController.submitExecution` and later via `ReconciliationJobHandler`). Analytics on these terminal events currently dies inside CLMM's append-only history. `regime-engine` now has the ingest surface to receive those events and the S/R read surface to feed position-detail context back to users — but CLMM has no outbound transport wired, and the BFF does not enrich position detail with S/R levels.

Origin plan §2, §4, §5.2, §5.3 define the architectural seam and contracts. This plan is the executable decomposition against the code as it exists today.

## 3. Requirements Trace

Carried forward from origin plan §3 (see origin: `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md`):

| ID | Requirement | Covered by |
|---|---|---|
| R3 | Read path for current SOL/USDC + mco levels | Unit 5 (adapter + controller) |
| R4 | CLMM surfaces current levels read-only with freshness + empty state | Unit 5 (UI) |
| R5 | CLMM posts execution event after terminal state | Unit 4 (dual-seam wiring) |
| R6 | Notification is best-effort, non-blocking | Unit 4 (adapter never throws; caller unaffected) |
| R7 | Event carries enough context for analytics | Unit 4 (payload mapping) |
| R8 | Replay of same correlationId is idempotent | Unit 4 (relies on server dedup; adapter does not pre-check) |
| R10 | Minimum public surface; internal routes guarded | Unit 4 (shared-secret header) |
| R11 | Shared-secret protection for write routes | Unit 4 (`X-CLMM-Internal-Token`) |

## 4. Scope Boundaries

**In scope**

- New outbound adapter `RegimeEngineExecutionEventAdapter` (write, fire-and-forget semantics).
- New outbound adapter `CurrentSrLevelsAdapter` (read, `null`-on-failure semantics).
- Wiring at `ExecutionController.submitExecution` inline reconciliation branch.
- Wiring at `ReconciliationJobHandler.handle`.
- BFF merge of `srLevels` into `PositionDetailDto` for SOL/USDC positions only.
- App-side parser tolerance for the additive field.
- UI rendering of grouped levels + relative-freshness label + "no levels available" empty state + `>48h` warn state.
- `.env.sample` entries: `REGIME_ENGINE_BASE_URL`, `REGIME_ENGINE_INTERNAL_TOKEN`.
- Module wiring at `AdaptersModule`, `inbound/http/AppModule`, `inbound/http/tokens.ts`, and `inbound/jobs/tokens.ts`.

**Non-goals (hard rules — do not violate)**

- No new application-layer port. The adapter is referenced from inbound HTTP/jobs controllers via DI token only (origin §7 rule 3).
- No Expo-facing env var. `EXPO_PUBLIC_BFF_BASE_URL` remains the sole app-public URL (origin §7 rule 4).
- No call to `POST /v1/plan` from CLMM (origin §7 rule 1).
- No extension of `POST /v1/execution-result` (origin §7 rule 2).
- No `partial` or `pending` on the wire (origin §7 rule 7). Terminal gate applies.
- No pool-to-symbol generalization. Hardcode `(symbol="SOL/USDC", source="mco")` (origin §7 rule 8).
- No BFF retry on the read path — one 2s attempt, then `null`.
- No change to `packages/domain` or `packages/application` ports.

## 5. Context & Research

### 5.1 Relevant Code and Patterns

**ExecutionController inline terminal path** — `packages/adapters/src/inbound/http/ExecutionController.ts:312-412`

- `submitExecution` submits to the port, saves `submitted`, emits `submitted` lifecycle event, then inline-calls `submissionPort.reconcileExecution`.
- If `reconciliation.finalState` is `null` → returns `pending` (no adapter call).
- Otherwise, saves attempt with `finalState`, appends matching lifecycle event (`confirmed`/`partial-completion`/`failed`), and returns.
- The adapter call site is **after** the save+append block. `finalState.kind === 'partial'` branch returns early; the terminal-gate only fires on `'confirmed'` or `'failed'`.

**Job-side terminal path** — `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts:43-79`

- Delegates persistence and history appending to `reconcileExecutionAttempt` use case (`packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`) which returns `{ kind: 'confirmed' | 'partial' | 'failed' | 'pending' }`.
- Observability log at `info` level already runs post-reconciliation. Adapter call site sits immediately after that log, gated on `result.kind` being `'confirmed'` or `'failed'`.

**Adapter-layer patterns already in repo**

- `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts` — minimal async method, DI-injected via `AdaptersModule.ts` provider token. Good reference for shape/size.
- `packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.ts` — existing HTTP outbound, uses `fetch` (check exact mechanics during implementation). Good reference for outbound HTTP with timeout.
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` — constructor-injected deps pattern mirrored for the new adapters.

**DI wiring points** — three files

- `packages/adapters/src/composition/AdaptersModule.ts` — shared module used by workers/jobs; append provider for `REGIME_ENGINE_EVENT_PORT` and (Unit 5) `CURRENT_SR_LEVELS_PORT`.
- `packages/adapters/src/inbound/http/AppModule.ts` — HTTP-app DI module; append provider entries and constructor wiring for controllers.
- `packages/adapters/src/inbound/http/tokens.ts` + `packages/adapters/src/inbound/jobs/tokens.ts` — DI token symbols. Add new tokens in both so either composition graph can resolve.

**DTO pattern** — `packages/application/src/dto/index.ts`

- `PositionDetailDto` is a `PositionSummaryDto &` extension with optional fields. Extending with an optional `srLevels?: SrLevelsBlock` is additive and non-breaking for existing consumers.

**App-side parser pattern** — `apps/app/src/api/positions.ts`

- Uses structural `isPositionDetailDto` type-guard. New optional field must degrade gracefully (absent → accepted; present & malformed → rejected, existing-shape still accepted).

**View-model / presenter** — `packages/ui/src/view-models/PositionDetailViewModel.ts`, `packages/ui/src/presenters/PositionDetailPresenter.ts`, `packages/ui/src/screens/PositionDetailScreen.tsx`

- Clear viewmodel → presenter → screen pipeline. Freshness + empty-state fields go on the viewmodel.

**Invariants guard** — `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`

- `lower-bound-breach` → `SOL→USDC` swap → `EXIT_TO_USDC` posture. `upper-bound-breach` → `USDC→SOL` swap → `EXIT_TO_SOL` posture. `tokenOut` on the wire derives from this policy — do not re-derive elsewhere (AGENTS.md release-blocker invariant).

### 5.2 Institutional Learnings

- `docs/solutions/integration-issues/phantom-webview-expo-router-navigation-silent-failure-2026-04-15.md` — not directly relevant but confirms integration surfaces in this repo are historically fragile, reinforcing the "never throw" rule for the event adapter.
- `docs/solutions/database-issues/notification-events-migration-and-deliveredat-fix-2026-04-14.md` — `DurableNotificationEventAdapter` style (silent "skipped" channel) matches the posture we want for the event adapter when config is missing.

### 5.3 External References

None needed. Contracts and error shapes are fully specified by origin plan §5.2 and §5.3. Internal networking details covered by origin Unit 6 runbook.

## 6. Key Technical Decisions

1. **HTTP client: native `fetch` with `AbortSignal.timeout`.** Available in Node 20+ (workspace `engines.node`); no new dependency. **Note:** this plan introduces the `AbortSignal.timeout` + retry loop pattern — existing outbound adapters (`JupiterQuoteAdapter.ts`, `SolanaExecutionPreparationAdapter.ts`) do **not** yet use timeouts. Establish the pattern cleanly here.
2. **Retry policy: 3 attempts, exponential backoff starting at 500ms (500ms, 1000ms between attempts).** Per origin §6 Unit 4. Retry only on 5xx or network/timeout errors. Do **not** retry on 4xx — those are deterministic and retry churn wastes budget. Final failure is swallowed and logged at `error`.
3. **No-op fallback when env missing.** If `REGIME_ENGINE_BASE_URL` or `REGIME_ENGINE_INTERNAL_TOKEN` is unset, resolve a no-op adapter at DI time that logs once at `debug` per process. For the SR read adapter, use `warn` on first empty (silent empty state would mask misconfig in prod). Additionally, when `REGIME_ENGINE_BASE_URL` is set but `REGIME_ENGINE_INTERNAL_TOKEN` is missing, log at `warn` — that combination signals misconfig rather than intentional disable.
4. **Idempotency: server-owned, success-code dedup.** Adapter posts without client-side dedup cache. `correlation_id = attemptId` plus the server's `UNIQUE(correlation_id)` + canonical-JSON idempotency is the safety net. Dual-seam wiring WILL produce double-posts; that is expected. **Contract assumption:** regime-engine returns `2xx` with an idempotent indicator in the body on a duplicate (the idiomatic PR#15 shape is `200 { ok: true, idempotent: true, correlationId }`). The adapter treats any `2xx` as success; **if** the deployed regime-engine instead returns `409` on duplicate, the adapter treats `409` as non-retryable success (also log as idempotent). Only one of the two shapes will be observed in practice — confirm via the Unit 6 runbook smoke before assuming either in production monitors.
5. **Terminal gate lives in the caller, not the adapter.** Both seams check `finalState.kind in {'confirmed','failed'}` (inline controller) / `result.kind in {'confirmed','failed'}` (worker) before invoking the adapter. The adapter itself does not inspect domain state; it takes a shaped `ClmmExecutionEventRequest` and posts it. Lifecycle kinds `'expired'` and `'abandoned'` do **not** trigger a POST — they come from separate endpoints and are explicitly out of this plan's scope.
6. **`txSignature` selection rule.** For `confirmed`, prefer the `swap-assets` step's `TransactionReference.signature` (the meaningful terminal signature for the unwind); if absent (no swap-assets reference present), fall back to the **last** reference and log at `warn`. For `failed`, use the **last** `TransactionReference` in the array. If `transactionReferences` is empty in either case, post with `txSignature: ""` and log at `warn` with `{correlationId, reason: 'no-tx-refs'}` context — the wire contract marks it required, so empty-string keeps the payload server-valid while signaling the anomaly in logs.
7. **`tokenOut` derivation.** Derive from `breachDirection.kind`: `lower-bound-breach` → `"USDC"`, `upper-bound-breach` → `"SOL"`. This derivation mirrors the domain policy (`DirectionalExitPolicyService`). Do not introduce a second source-of-truth — import the policy result or use a one-line switch at the caller site, not inside the adapter.
8. **`detectedAtIso` optional-when-unknown.** The `StoredExecutionAttempt` does not carry the breach detection timestamp directly. For this sprint, omit the field when the calling controller does not have it in hand; do not add a new breach-episode lookup round-trip. Can be re-added later via a wider payload if analytics demands it.
9. **Freshness copy (Unit 5).** Relative time label driven by `Date.now() - capturedAtUnixMs`. Bands: `< 1h`: `"captured <N>m ago"`, `1h–48h`: `"captured <N>h ago"`, `> 48h`: `"captured <N>h ago · stale"` with a warn-tinted badge. Origin §6 Unit 5 specifies the 48h threshold; no test-and-release needed.
10. **Parallel fetch in PositionController.** For SOL/USDC positions, `Promise.all` the existing position-detail + trigger reads with the new SR-levels read. Non-SOL/USDC positions must not trigger the fetch at all (origin rule: do not generalize mapping).
11. **Symbol matching is narrow.** The BFF calls the SR adapter only when `position.poolId` maps to SOL/USDC. For this sprint, hardcode: any position whose `poolId` is in the configured SOL/USDC Orca pool allowlist → fetch; otherwise do not. Single-pool allowlist lives in `AppModule.ts` as a const; no dynamic pool registry.

## 7. Open Questions

### Resolved During Planning

- **Q: Where to add the DI token — existing `tokens.ts` or a new `adapter-tokens.ts`?**
  Resolution: append to existing `packages/adapters/src/inbound/http/tokens.ts` and `packages/adapters/src/inbound/jobs/tokens.ts`. Same file pattern already tracks outbound-port tokens like `NOTIFICATION_PORT`. Names: `REGIME_ENGINE_EVENT_PORT`, `CURRENT_SR_LEVELS_PORT`.
- **Q: Does the job handler need to read the attempt back after `reconcileExecutionAttempt` to get `transactionReferences`?**
  Resolution: yes. `reconcileExecutionAttempt` returns `{ kind, confirmedSteps? }` only — no transaction references. The handler must `getAttempt(attemptId)` after reconciliation to obtain the saved references, then build the event payload from that stored attempt.
- **Q: How does the app-side parser in `apps/app/src/api/positions.ts` handle the new field without version-skew breakage?**
  Resolution: additive optional. The existing `isPositionDetailDto` check already accepts unknown extra fields (structural check). Add a new permissive validator for `srLevels`: `undefined` OR a shape-check that accepts the `SrLevelsBlock` contract. Missing is valid; malformed is rejected.
- **Q: Where should the symbol/pool allowlist live?**
  Resolution: a small const map in `packages/adapters/src/inbound/http/AppModule.ts` at composition time, keyed by `poolId`, value `{ symbol: "SOL/USDC", source: "mco" }`. The controller receives the map via DI (`SR_LEVELS_POOL_ALLOWLIST` token) and consults it. This avoids leaking knowledge into the adapter and makes the allowlist trivially inspectable.

### Deferred to Implementation

- **Q1 (payload mapping): exact handling of `txSignature` on `failed` with empty `transactionReferences`.**
  Two options: (a) skip the post entirely and log; (b) post with empty-string signature. Resolve by checking real-world failed-attempt state during adapter test construction — specifically, whether `saveAttempt` can land a `failed` state with zero references via the current use cases. If (a) is provable at implementation time, choose (a) and add the skip path.
- **Q2 (observability wire-up): use existing `ObservabilityPort` or `console`?**
  `ReconciliationJobHandler` already has `ObservabilityPort` injected. The controller does not. Likely: inject `ObservabilityPort` into the adapter itself and use it uniformly. Confirm at implementation whether `ObservabilityPort` is already bound in the HTTP `AppModule` providers list — if not, add it. (It is bound in `AdaptersModule.ts` for workers.)
- **Q3 (stale-fetch smoothing): should the read adapter cache a last-known-good response across process lifetime?**
  Probably not this sprint — origin §6 Unit 5 says "no retry"; stale-or-empty is better than slow. Confirm by measuring request latency during Railway smoke test. If latency is fine, no cache.

## 8. High-Level Technical Design

> *This illustrates the intended dual-seam wiring shape. Directional guidance for review, not implementation specification.*

```
  ExecutionController.submitExecution (inline fast path)
  ────────────────────────────────────────────────────────
    submissionPort.submitExecution()
      └─ saveAttempt({ lifecycleState: 'submitted' })
         └─ appendLifecycleEvent('submitted')
            └─ submissionPort.reconcileExecution()
               └─ if finalState is null   → return 'pending'   (no post)
               └─ if finalState is 'partial' → return 'partial' (no post)
               └─ saveAttempt({ lifecycleState: finalState })
                  └─ appendLifecycleEvent(terminal event)
                     └─────► TERMINAL-GATE CHECK ◄──────
                     └─ if kind in {'confirmed','failed'}:
                        └─ buildEvent(attempt, finalState)
                           └─ regimeEngineEventPort.notify(event)   <─ fire-and-forget
                              └─ adapter: POST /v1/clmm-execution-result
                                 ├─ 2xx     → resolve
                                 ├─ 409     → treat as idempotent, log.info, resolve
                                 ├─ 5xx/net → exponential backoff × 3
                                 └─ final   → swallow, log.error, resolve

  ReconciliationJobHandler.handle (worker path)
  ──────────────────────────────────────────────
    reconcileExecutionAttempt()                       (use case owns saves+history)
      └─ returns { kind: 'confirmed'|'partial'|'failed'|'pending' }
         └─ observability.log('info', 'Reconciliation result', …)
            └─ if kind in {'confirmed','failed'}:
               └─ attempt = executionRepo.getAttempt(attemptId)     (re-read to get tx refs)
                  └─ buildEvent(attempt, kind)
                     └─ regimeEngineEventPort.notify(event)         <─ fire-and-forget
```

Payload shape (from origin §5.3, repeated for implementer convenience — do not copy as code):

```
ClmmExecutionEventRequest = {
  schemaVersion:     "1.0"
  correlationId:     attempt.attemptId
  positionId:        attempt.positionId
  breachDirection:   attempt.breachDirection.kind === 'lower-bound-breach'
                       ? "LowerBoundBreach"
                       : "UpperBoundBreach"
  reconciledAtIso:   clock.now() → ISO string
  txSignature:       (see Decision §7, with open question Q1)
  tokenOut:          lower-bound → "USDC"; upper-bound → "SOL"
  status:            "confirmed" | "failed"   (never "partial"/"pending")
  episodeId?:        attempt.episodeId (if present)
  previewId?:        attempt.previewId (if present)
  detectedAtIso?:    omit this sprint (Decision §8)
  amountOutRaw?:     omit this sprint (Decision §8)
  txFeesUsd?:        omit this sprint (Decision §8)
  priorityFeesUsd?:  omit this sprint (Decision §8)
  slippageUsd?:      omit this sprint (Decision §8)
}
```

## 9. Implementation Units

- [ ] **Unit 4: Regime-engine execution-event outbound adapter + dual-seam terminal wiring**

**Goal:** On reaching terminal (`confirmed`/`failed`) state via either the inline controller path or the reconciliation job, post a `ClmmExecutionEventRequest` to regime-engine. Best-effort, never blocks the caller, never throws, idempotent on server.

**Requirements:** R5, R6, R7, R8, R10, R11

**Dependencies:** None external to this plan. Regime-engine `POST /v1/clmm-execution-result` already shipped in `regime-engine` PR #15.

**Files:**
- Create: `packages/adapters/src/outbound/regime-engine/RegimeEngineExecutionEventAdapter.ts`
- Create: `packages/adapters/src/outbound/regime-engine/types.ts` *(wire types for both Unit 4 and Unit 5; introduce file here)*
- Test: `packages/adapters/src/outbound/regime-engine/RegimeEngineExecutionEventAdapter.test.ts`
- Modify: `packages/adapters/src/composition/AdaptersModule.ts` *(provider registration + env resolution)*
- Modify: `packages/adapters/src/inbound/http/AppModule.ts` *(provider registration for HTTP app DI graph)*
- Modify: `packages/adapters/src/inbound/http/tokens.ts` *(add `REGIME_ENGINE_EVENT_PORT`)*
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts` *(add `REGIME_ENGINE_EVENT_PORT`)*
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts` *(inject port; call after terminal save+history append)*
- Modify: `packages/adapters/src/inbound/http/ExecutionController.test.ts` *(new call-order + terminal-gate tests)*
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts` *(re-read attempt post-reconciliation; call port on terminal kinds)*
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts` *(new call-order + terminal-gate tests)*
- Modify: `packages/adapters/.env.sample` *(add `REGIME_ENGINE_BASE_URL`, `REGIME_ENGINE_INTERNAL_TOKEN`)*

**Approach:**

*Adapter construction.* Class `RegimeEngineExecutionEventAdapter` with three injected deps: `baseUrl: string | null`, `internalToken: string | null`, `observability: ObservabilityPort`. If either credential is null, expose a method that logs at `debug` once per process and resolves immediately. Otherwise, implement `notifyExecutionEvent(event)` to POST JSON to `${baseUrl}/v1/clmm-execution-result` with headers `Content-Type: application/json` and `X-CLMM-Internal-Token: <token>`. Per-request timeout 5s via `AbortSignal.timeout(5000)`. Retry policy: up to 3 total attempts on network error, timeout, or 5xx response. Exponential backoff: sleep 500ms, 1000ms between attempts. On 409, log at `info` with `{ correlationId, idempotent: true }` and resolve (do not retry). On 4xx other than 409, log at `error` with response body and resolve without retry. On terminal failure after retries, log at `error` and resolve. The method never rejects.

*ExecutionController wiring.* After the existing `saveAttempt` + `appendLifecycleEvent` for the terminal branch (line 400-405 range), check `reconciliation.finalState.kind`. If `'confirmed'` or `'failed'`, build the event payload (see Design §8) and invoke `regimeEngineEventPort.notifyExecutionEvent(event)` **without awaiting**. The response to the HTTP caller must not be delayed by the notification round trip. Use `void regimeEngineEventPort.notifyExecutionEvent(event)` (explicit floating-promise via `void`) OR await — resolve at implementation by running the test that asserts "controller response unaffected by adapter latency". If awaiting would add measurable latency, use `void`; otherwise prefer `await` for simpler error surface.

*ReconciliationJobHandler wiring.* After the use-case returns and the `info` observability log runs, if `result.kind in {'confirmed','failed'}`, re-read the attempt via `executionRepo.getAttempt(data.attemptId)` to obtain the updated `transactionReferences`, build the event, and call `regimeEngineEventPort.notifyExecutionEvent(event)`. Same awaiting/fire-and-forget decision as controller.

*Payload builder helper.* Both seams need the same builder. Put a pure helper function `buildClmmExecutionEvent(attempt: StoredExecutionAttempt, finalKind: 'confirmed' | 'failed', clock: ClockPort): ClmmExecutionEventRequest` in the same outbound file so the mapping lives in one place. The helper is exported for both wiring sites.

*DI composition.*
- `AdaptersModule.ts`: read env vars at module load, construct one instance with the resolved `baseUrl`/`internalToken`, provide under `REGIME_ENGINE_EVENT_PORT`.
- `inbound/http/AppModule.ts`: same construction; provide under the same token for controller DI.
- Both `tokens.ts` files: export `REGIME_ENGINE_EVENT_PORT = 'REGIME_ENGINE_EVENT_PORT'`.

**Execution note:** Implement test-first for both the adapter retry/gate scenarios and the wiring call-order assertions. The call-order invariant (adapter fires *after* persistence+history append) is the load-bearing correctness property here; characterization of the current controller/worker flow with fakes BEFORE adding the adapter hook prevents accidental reordering.

**Technical design:** *(see §8 High-Level Technical Design)*

**Patterns to follow:**
- DI + constructor injection shape: `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts`
- Outbound HTTP adapter shape (timeout + JSON): `packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.ts`
- Observability port usage: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts`
- Test-fake controller setup: `packages/adapters/src/inbound/http/ExecutionController.test.ts:60-128` (RecordingSubmissionPort pattern)

**Test scenarios:**

Adapter unit tests (`RegimeEngineExecutionEventAdapter.test.ts`):
- **Happy path:** Given a valid `ClmmExecutionEventRequest` and a stubbed `fetch` returning `200 { ok: true, correlationId }`, the adapter issues exactly one POST whose URL is `${baseUrl}/v1/clmm-execution-result`, whose body is the JSON-serialized event, and whose headers include `X-CLMM-Internal-Token: <token>` and `Content-Type: application/json`; the method resolves without throwing.
- **Happy path:** When the stub returns `200 { ok: true, correlationId, idempotent: true }` the adapter resolves and logs `info` with the correlation id (no retry).
- **Error path:** When the stub returns `500` on attempt 1 and `200` on attempt 2, the adapter issues exactly 2 POSTs with a ≥500ms gap between them and resolves successfully.
- **Error path:** When the stub returns `503` on three consecutive attempts, the adapter issues exactly 3 POSTs and resolves (does not throw), with a final `error`-level log entry carrying `{ correlationId, attempts: 3, lastStatus: 503 }` context.
- **Error path:** When the stub returns `409`, the adapter issues exactly 1 POST (no retry), logs at `info` with `{ idempotent: true }`, and resolves.
- **Error path:** When the stub returns `401`, the adapter issues exactly 1 POST (no retry), logs at `error`, and resolves.
- **Error path:** When the stub rejects with a `TypeError` (network failure), retries up to 3 total attempts with backoff, then resolves.
- **Edge case:** When the stub delays beyond 5s, the `AbortSignal` aborts the attempt; retry policy engages as if network failure.
- **Edge case:** When constructed with `baseUrl = null`, `notifyExecutionEvent` resolves without issuing any fetch and logs at `debug` once per process (subsequent calls do not re-log).
- **Edge case:** When constructed with `internalToken = null`, same no-op behavior.
- **Edge case:** `baseUrl` with trailing slash (`https://host/`) and without (`https://host`) both produce the correct URL `https://host/v1/clmm-execution-result` (single slash).

Payload builder unit tests (same file):
- **Happy path:** Given an attempt with `breachDirection.kind === 'lower-bound-breach'` and `lifecycleState: { kind: 'confirmed' }`, `buildClmmExecutionEvent` returns an event with `breachDirection === "LowerBoundBreach"`, `tokenOut === "USDC"`, `status === "confirmed"`, and `correlationId === attempt.attemptId`.
- **Happy path:** `upper-bound-breach` + `confirmed` maps to `"UpperBoundBreach"` + `"SOL"`.
- **Happy path:** `transactionReferences: [{signature: 'sig-remove', stepKind: 'remove-liquidity'}, {signature: 'sig-swap', stepKind: 'swap-assets'}]` with `status: 'confirmed'` picks `txSignature === 'sig-swap'` (swap-assets rule).
- **Edge case:** `failed` with `transactionReferences: [{ signature: 'sig-only', stepKind: 'remove-liquidity' }]` picks `txSignature === 'sig-only'` (last-reference rule).
- **Edge case:** `failed` with empty `transactionReferences` — resolve per open question Q1 at implementation.
- **Edge case:** `episodeId` and `previewId` present on the attempt → present on the event; absent → absent (optional-field fidelity).
- **Edge case:** `reconciledAtIso` is derived from `clock.now()` converted to ISO-8601 with `Z` suffix — deterministic under `FakeClockPort`.

ExecutionController wiring tests (`ExecutionController.test.ts`):
- **Integration:** On inline `confirmed` terminal outcome, the regime-engine event port is called exactly once, **after** the `saveAttempt(finalState)` and terminal `appendLifecycleEvent` calls (assert via a shared call-order recorder). The HTTP response body is unchanged.
- **Integration:** On inline `failed` terminal outcome, the event port is called exactly once; call order same as confirmed.
- **Integration:** On inline `partial` outcome (`finalState.kind === 'partial'`), the event port is **not** called.
- **Integration:** On inline `pending` outcome (`reconciliation.finalState === null`), the event port is **not** called.
- **Integration:** When `submissionPort.reconcileExecution` throws after `saveAttempt(submitted)`, the event port is **not** called and the HTTP error surface is unchanged.
- **Integration:** When the event port itself hangs/throws (inject a port stub that rejects), the HTTP response is still `confirmed` (or equivalent) and the controller does not observe the rejection. This proves best-effort semantics.
- **Integration:** The event payload passed to the port includes the `transactionReferences` written by the immediately-preceding `saveAttempt` (asserts the order of write-before-build).

ReconciliationJobHandler wiring tests (`ReconciliationJobHandler.test.ts`):
- **Integration:** On `confirmed` reconciliation kind, the event port is called exactly once with the re-read attempt's `transactionReferences`; call order is `saveAttempt` (inside use case) → observability `info` log → event port.
- **Integration:** On `failed` reconciliation kind, the event port is called exactly once.
- **Integration:** On `partial` reconciliation kind, the event port is **not** called.
- **Integration:** On `pending` reconciliation kind, the event port is **not** called.
- **Integration:** When the event port rejects, `handler.handle` still resolves without throwing (pg-boss does not re-queue the job for a notification failure).
- **Edge case:** When `getAttempt(attemptId)` returns `null` after reconciliation (shouldn't happen under current semantics), the handler logs `warn` and skips the post without throwing.

**Verification:**
- `pnpm test --filter @clmm/adapters` passes including the new scenarios.
- `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` all green — specifically, `boundaries` must confirm no new application-layer port import and no `packages/adapters` → `packages/ui` dependency.
- `grep -R "RegimeEngineNotificationPort" packages/application` returns zero matches (origin §7 rule 3).
- `grep -R "EXPO_PUBLIC_REGIME_ENGINE" apps packages` returns zero matches (origin §7 rule 4).
- Manual inspection: both `ExecutionController.ts` and `ReconciliationJobHandler.ts` gate the adapter call on `kind in {'confirmed','failed'}`.

---

- [ ] **Unit 5: BFF SR-levels read adapter + PositionDetail enrichment + UI surfacing**

**Goal:** For SOL/USDC positions, enrich the `PositionDetailDto` returned by the BFF with a freshest-brief `SrLevelsBlock` fetched from regime-engine. Surface grouped supports/resistances in the position-detail UI with relative-freshness copy and an explicit empty state. Non-SOL/USDC positions and error/empty responses must degrade silently to the existing experience.

**Requirements:** R3, R4

**Dependencies:** Unit 4's `packages/adapters/src/outbound/regime-engine/types.ts` file and the adapter folder; **not** blocked on Unit 4's wiring. Can proceed in parallel once the types file is created in Unit 4 — or first, in which case Unit 4 consumes the same file.

**Files:**
- Create: `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts`
- Test: `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.test.ts`
- Modify: `packages/adapters/src/outbound/regime-engine/types.ts` *(add `SrLevelsBlock`, `SrLevel` types per origin §5.2)*
- Modify: `packages/application/src/dto/index.ts` *(extend `PositionDetailDto` with `srLevels?: SrLevelsBlock`; re-export `SrLevelsBlock`, `SrLevel` from application public if needed — note: adapter types live in adapters; consider inlining the shape into the DTO to avoid reverse dependency)*
- Modify: `packages/adapters/src/composition/AdaptersModule.ts` *(provider registration for `CURRENT_SR_LEVELS_PORT` and `SR_LEVELS_POOL_ALLOWLIST`)*
- Modify: `packages/adapters/src/inbound/http/AppModule.ts` *(provider registration; construct pool allowlist map)*
- Modify: `packages/adapters/src/inbound/http/tokens.ts` *(add `CURRENT_SR_LEVELS_PORT`, `SR_LEVELS_POOL_ALLOWLIST`)*
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts` *(add `CURRENT_SR_LEVELS_PORT` if shared)*
- Modify: `packages/adapters/src/inbound/http/PositionController.ts` *(inject adapter + allowlist; fetch in parallel for allowlisted pools; merge non-null block into detail response)*
- Modify: `packages/adapters/src/inbound/http/PositionController.test.ts` *(enriched/empty/allowlist-miss scenarios)*
- Modify: `apps/app/src/api/positions.ts` *(extend `isPositionDetailDto` to permissively accept `srLevels?`; typed parse of the block)*
- Modify: `apps/app/src/api/positions.test.ts` *(new shape tolerance tests)*
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.ts` *(extend VM with `srLevels?: SrLevelsViewModelBlock`, freshness label, stale-warn flag)*
- Modify: `packages/ui/src/presenters/PositionDetailPresenter.ts` *(pass through; compute freshness label here using an injected `now` for testability)*
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx` *(new section rendering supports/resistances + freshness badge + empty state)*
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx` *(render scenarios for levels, empty state, stale warn)*

**Approach:**

*Shared wire types.* `packages/adapters/src/outbound/regime-engine/types.ts` owns `SrLevel`, `SrLevelsBlock` (matching origin §5.2 `SrLevelsCurrentResponse`), and `ClmmExecutionEventRequest` (Unit 4). Application DTO layer defines its own `SrLevelsBlock` shape that is structurally identical; do not import from `packages/adapters` into `packages/application` (`boundaries` would fail). Alternative: define the shape in `packages/application/src/dto/index.ts` as the canonical shape, and have the adapter re-export or import from the DTO's public surface. Since this data originates at an adapter boundary and the DTO is the application-layer contract to the UI, the cleanest split is: adapter parses raw JSON → converts to the DTO shape (defined in `application/dto`) → controller merges into the DTO it returns. Adapter never leaks its own type.

*CurrentSrLevelsAdapter.* Method `fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>`. POSTs... wait, `GET`. GET to `${baseUrl}/v1/sr-levels/current?symbol=${encodeURIComponent(symbol)}&source=${encodeURIComponent(source)}`. No auth header (origin §4: public read). 2s timeout via `AbortSignal.timeout(2000)`. On `200` → parse JSON → validate against the `SrLevelsCurrentResponse` shape → map to `SrLevelsBlock` (add `capturedAtUnixMs: Date.parse(capturedAtIso)`; keep `supports`, `resistances` as-is). On `404` → return `null`. On any error (network, timeout, 5xx, malformed JSON, validation fail) → log at `warn` with a one-liner, return `null`. **No retry.**

*No-op fallback.* When `REGIME_ENGINE_BASE_URL` is unset at DI time, adapter resolves to a form that always returns `null`. Log `warn` once per process on first invocation ("SR levels disabled — no REGIME_ENGINE_BASE_URL configured"). This keeps ephemeral review envs quiet but makes misconfig visible in prod logs.

*PositionController integration.* In `getPosition(walletId, positionId)`:
1. Look up `(symbol, source)` in the injected `SR_LEVELS_POOL_ALLOWLIST` using `result.position.poolId`. If missing, skip the fetch entirely.
2. For allowlisted pools, call `currentSrLevelsPort.fetchCurrent(symbol, source)` in parallel with the existing `triggerRepo.listActionableTriggers` call via `Promise.all`.
3. If the returned block is non-null, include `srLevels: block` in the response DTO.
4. If the returned block is null, omit the key — do not send `srLevels: null`.
5. Adapter errors are already swallowed; the controller sees only `SrLevelsBlock | null` and never fails the whole request due to S/R fetch issues.

*App-side parser.* Extend `isPositionDetailDto` with an optional `srLevels` validator. Define `isSrLevelsBlock(value)` and `isSrLevel(value)` guards. Absent field → accepted. Present but malformed → reject the whole detail payload (parser must not silently drop good data from a bad adjacent field — but we also don't want a partial rollout to break the app). **Deferred to implementation:** choose between strict-reject and permissive-drop. Lean permissive-drop for first cut: on malformed `srLevels`, warn in console and return the detail without that field. This matches the "stale-or-empty is better than fail" posture of the read path.

*ViewModel.* `PositionDetailViewModel` gains optional `srLevels?: SrLevelsViewModelBlock` where the block carries `{ supportsSorted: Array<{priceLabel: string, rankLabel?: string}>, resistancesSorted: Array<...>, freshnessLabel: string, isStale: boolean }`. Sorting by price ASC — origin §5.2 says the server does this, but defensive re-sort in the VM is cheap and documented by a comment.

*Presenter.* `presentPositionDetail({ position, now })` — inject `now: ClockTimestamp` so freshness is testable under a fake clock. Compute `ageMs = now - srLevels.capturedAtUnixMs`. Band:
- `ageMs < 60 * 60 * 1000` → `"captured ${Math.max(1, Math.round(ageMs/60000))}m ago"`, `isStale: false`
- `ageMs < 48 * 60 * 60 * 1000` → `"captured ${Math.round(ageMs/3600000)}h ago"`, `isStale: false`
- `ageMs >= 48 * 60 * 60 * 1000` → `"captured ${Math.round(ageMs/3600000)}h ago · stale"`, `isStale: true`

*Screen.* Below the existing directional-policy card, new section with title `"Support & Resistance (MCO)"`. Empty state: `"No current MCO levels available"` in muted text, no list. Populated state: two subsections — `"Support"` and `"Resistance"` — each a simple list of price labels with optional rank. Freshness label bottom-right of the section, with stale-badge styling when `isStale` is true.

**Execution note:** Implement the adapter test-first (smallest, most deterministic surface), then the controller integration, then the app parser and UI. The UI is the most visible surface but is downstream of the controller contract; do not start it until the DTO shape is locked.

**Patterns to follow:**
- Outbound HTTP adapter shape: `packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.ts`
- Structural type guards: `apps/app/src/api/positions.ts:14-72`
- ViewModel + presenter + screen split: `packages/ui/src/view-models/PositionDetailViewModel.ts`, `packages/ui/src/presenters/PositionDetailPresenter.ts`, `packages/ui/src/screens/PositionDetailScreen.tsx`
- Screen test shape: `packages/ui/src/screens/PositionDetailScreen.test.tsx:11-25` (`makePosition` overrides helper)
- Controller parallel-fetch tolerance: `packages/adapters/src/inbound/http/PositionController.ts:69-85` (trigger-fetch failure handling)

**Test scenarios:**

Adapter unit tests (`CurrentSrLevelsAdapter.test.ts`):
- **Happy path:** `200` with a populated block → returns a `SrLevelsBlock` with `supports`/`resistances` sorted ascending by price, `capturedAtUnixMs` derived from `capturedAtIso`, and top-level `briefId`, `summary`, `sourceRecordedAtIso` preserved.
- **Happy path:** URL query string correctly encodes `symbol=SOL%2FUSDC&source=mco` (the `/` in the symbol must be percent-encoded).
- **Happy path:** No `X-Ingest-Token` or `X-CLMM-Internal-Token` header is sent (public read).
- **Edge case:** `200` with `supports: []` and `resistances: []` → returns a block with empty arrays (not `null`).
- **Edge case:** `200` response where the server returns unsorted prices → adapter sorts defensively before returning.
- **Error path:** `404` → returns `null`, does **not** log at `error` (warns or debug at most).
- **Error path:** `500` → returns `null`, logs at `warn` with status, does not retry.
- **Error path:** Network error → returns `null`, logs at `warn`, does not throw.
- **Error path:** Malformed JSON → returns `null`, logs at `warn`.
- **Error path:** JSON with wrong shape (e.g., `supports` missing) → returns `null`, logs at `warn`.
- **Edge case:** Request exceeds 2s timeout → `AbortSignal` aborts → returns `null`.
- **Edge case:** `baseUrl = null` → returns `null` without any fetch; logs at `warn` on first call only.

PositionController integration tests (`PositionController.test.ts`):
- **Happy path:** For an allowlisted SOL/USDC pool, the controller returns a `PositionDetailDto` with `srLevels` populated when the adapter yields a block. The trigger lookup and S/R lookup run in parallel (assert via timing or counters on fakes).
- **Happy path:** For an allowlisted pool, when the adapter returns `null`, the response DTO does **not** include an `srLevels` key.
- **Happy path:** For a non-allowlisted pool, the adapter is **not** invoked (assert call count is zero).
- **Error path:** Existing position-not-found test remains green (no regression).
- **Error path:** When the adapter throws unexpectedly (it shouldn't — adapter never throws — but belt-and-braces), the controller still returns the base DTO. This proves the controller is insulated.
- **Edge case:** Concurrent-failure scenario — trigger lookup throws a transient failure and adapter returns `null` — the controller returns the existing-shape degraded response (trigger error surfaced; `srLevels` absent).

App-side parser tests (`positions.test.ts`):
- **Happy path:** Response with `srLevels` populated → parser returns the full DTO including the `srLevels` field.
- **Happy path:** Response without `srLevels` key → parser returns the DTO with `srLevels: undefined` (existing behavior preserved).
- **Edge case:** Response with `srLevels: null` explicitly → parser treats as absent.
- **Edge case:** Response with malformed `srLevels` (e.g., `supports` is a string) → resolve per implementation choice (strict-reject OR permissive-drop-with-warn). Test matches the chosen behavior.
- **Edge case:** Response with extra unknown fields inside `srLevels` → parser tolerates them.

ViewModel/presenter unit tests (new test file or extension):
- **Happy path:** Given a DTO with `srLevels.capturedAtUnixMs` 5 minutes ago → freshness label is `"captured 5m ago"`, `isStale: false`.
- **Happy path:** 3 hours ago → `"captured 3h ago"`, `isStale: false`.
- **Edge case:** 47 hours ago → `"captured 47h ago"`, `isStale: false`.
- **Edge case:** 49 hours ago → `"captured 49h ago · stale"`, `isStale: true`.
- **Edge case:** Exactly 48h → `isStale: true` (boundary rule: `>= 48h`).
- **Edge case:** 30 seconds ago → `"captured 1m ago"` (floor at 1 minute).
- **Happy path:** Supports/resistances are returned sorted ascending by `price`.
- **Happy path:** DTO without `srLevels` → VM has `srLevels: undefined`.

Screen render tests (`PositionDetailScreen.test.tsx`):
- **Happy path:** When `position.srLevels` is populated, the screen renders both a `"Support"` and `"Resistance"` heading, each price label appears on screen, and the freshness label renders.
- **Happy path:** When `position.srLevels.isStale === true`, the freshness label displays with the stale-warn styling.
- **Edge case:** When `position` has no `srLevels`, the screen renders `"No current MCO levels available"` below the existing position-detail sections.
- **Edge case:** When `position.srLevels` has `supports: []` but non-empty `resistances`, only the resistances section renders data (supports shows an empty-subsection label or hides gracefully — resolve at implementation).

Manual UI smoke (not automated, documented in verification):
- PWA renders current levels on the real SOL/USDC position against a seeded regime-engine brief.

**Verification:**
- `pnpm test --filter @clmm/adapters --filter @clmm/ui --filter app` green.
- `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` green.
- `grep -R "EXPO_PUBLIC_REGIME_ENGINE" apps packages` returns zero matches.
- `grep -R "from '@clmm/adapters" packages/application` returns zero matches (adapter types must not leak into application layer).
- Manual: start the BFF against a live regime-engine (seeded via the Unit 6 curl script from the origin plan) and render the position-detail screen in the PWA — levels, freshness, and empty state all observable.

## 10. System-Wide Impact

- **Interaction graph:**
  - Unit 4 adds a new outbound call site at two inbound seams (`ExecutionController.submitExecution` inline, `ReconciliationJobHandler.handle`). Both are side-effect points *after* the existing persistence + history-append path. No existing caller order changes. Both seams currently end after appending the terminal history event; the new adapter call appends to that suffix.
  - Unit 5 adds a new outbound call site at one inbound seam (`PositionController.getPosition`), parallel to the existing trigger fetch. No change to `listPositions`.
- **Error propagation:**
  - Unit 4 adapter never throws — errors terminate inside the adapter and are logged. Callers do not branch on success/failure. The only visible propagation is a log entry.
  - Unit 5 adapter returns `null` on any failure — the controller treats `null` identically to "pool not in allowlist": omit the field. No error returned to the HTTP client.
- **State lifecycle risks:**
  - Dual-seam firing *will* produce duplicate POSTs for an attempt whose terminal state is first reached inline (controller) and then re-checked by the worker. This is the safety-net path — server idempotency (`correlation_id UNIQUE` on regime-engine's `clmm_execution_events`) absorbs it and returns `200 { idempotent: true }`. This is load-bearing and must be preserved (see test: "Idempotency: same attemptId flowing through both paths").
  - No local state mutation from either adapter. No cleanup concerns.
- **API surface parity:**
  - `GET /positions/:walletId/:positionId` gains an optional response field. `GET /positions/:walletId` (list) does **not** gain the field — the list endpoint is the summary shape, and S/R enrichment is a detail-view concern.
  - No change to any CLMM outbound HTTP contract; the existing `POST /executions/...` shapes are untouched.
- **Integration coverage:**
  - The inline + worker call-order invariant needs an integration-style test (not pure unit) per unit — the adapter call must happen *after* `saveAttempt(finalState)` AND *after* `appendLifecycleEvent(terminal)`. Mock-only tests can mask reordering bugs; the plan's controller/job tests use shared call-order recorders rather than individual port assertions.
  - The app parser + BFF DTO pairing needs a test that asserts the live JSON shape round-trips through the parser — not just per-field unit tests. Add one scenario that takes an actual captured payload fixture, runs it through `isPositionDetailDto`, and asserts the `srLevels` block deserializes as expected.
- **Unchanged invariants:**
  - Directional mapping (`DirectionalExitPolicyService`) is the sole source of the `breachDirection → tokenOut` rule. Unit 4's `buildClmmExecutionEvent` must not re-implement this logic in a way that could drift. Import or switch in a single line; this plan does **not** change `packages/domain`.
  - Append-only history in `historyRepo`. Adapter call comes *after* the terminal history event — never in place of it.
  - `EXPO_PUBLIC_BFF_BASE_URL` remains the sole app-public URL. Regime-engine is backend-only reachable.
  - No application-layer port is introduced. `packages/application` is untouched except the additive DTO field.

## 11. Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Adapter call reorders before persistence, causing regime-engine to see events CLMM rolled back. | Call-order tests (not just call-count tests) for both seams. `void`/`await` decision only matters for latency, not ordering — the order guarantee comes from the await chain already established by `saveAttempt` → `appendLifecycleEvent` completing before the adapter invocation statement. |
| Dual-seam produces duplicate POSTs for the same terminal attempt. | Expected. Server-side `correlation_id UNIQUE` + canonical-JSON idempotency absorbs it. Adapter test stubs a `200 { idempotent: true }` response and asserts the adapter treats it as success. |
| `partial`/`pending` leaks into the adapter payload. | Callers gate on `kind in {'confirmed','failed'}`. Wire type enforces `"confirmed" \| "failed"` only — TypeScript catches it at the boundary. Adapter unit tests include a "builder rejects partial/pending" negative test. |
| `REGIME_ENGINE_INTERNAL_TOKEN` not configured in Railway → every POST fails silently. | No-op fallback logs at `debug` once when the token is missing. On first real deploy, the Unit 6 runbook's verification curl will confirm the token is reachable. Prod-time: add a `warn` log once per process (not per event) if token is missing but `REGIME_ENGINE_BASE_URL` is set — that combination indicates misconfig, not intentional disable. |
| `CurrentSrLevelsAdapter` blocks the position-detail response when regime-engine is slow. | 2s hard timeout, no retries. `Promise.all` with trigger fetch means the slowest path bounds overall latency at 2s + trigger fetch time. If regime-engine is consistently slow, the 2s timeout + `null` response keeps the page responsive. |
| App-side parser rejects a valid payload because of a new strict `srLevels` check. | Permissive-drop posture for malformed `srLevels` (decided in Approach §9 Unit 5). Existing-shape responses (without `srLevels`) must continue to parse — explicit regression test. |
| UI empty state and stale-warn state are easy to conflate visually. | Copy differs (`"No current MCO levels available"` vs `"captured Xh ago · stale"`). Stale state still renders the level lists; empty state does not. Screen tests cover both. |
| Adapter logs leak the shared-secret token on error paths. | Log only the URL path and status; never include headers in log context. Adapter unit test asserts no log line contains the token value. |
| `tokenOut` derivation drifts from `DirectionalExitPolicyService`. | Builder either imports the policy function or uses an inline switch that is co-located with a comment referencing the domain invariant. Builder unit tests assert both directions. |

## 12. Documentation / Operational Notes

- Update `packages/adapters/.env.sample` with both new vars and comments explaining they are backend-only.
- Note in `README.md` (this repo) that `REGIME_ENGINE_BASE_URL` and `REGIME_ENGINE_INTERNAL_TOKEN` are backend-only and mirror regime-engine's `CLMM_INTERNAL_TOKEN`.
- Origin plan's Unit 6 E2E runbook covers the cross-repo deploy validation — this plan does not duplicate it.
- When Unit 4 + Unit 5 land, update the companion plan's unit checkboxes:
  - `docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md` §6 Unit 4 and Unit 5 checkboxes.
- [x] Unit 6 CLMM-side deploy + E2E runbook landed in `docs/plans/2026-04-19-002-feat-clmm-regime-engine-deploy-runbook-plan.md`. Railway cross-service wiring, E2E fixtures, and verification log live there.

## 13. Sources & References

- **Origin plan:** [`docs/plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md`](../plans/2026-04-17-002-opus-clmm-regime-engine-integration-plan.md)
- **Regime-engine counterpart PR:** opsclawd/regime-engine#15 (Units 1–3)
- **Canonical contracts:** origin plan §5.2 (current-read response) and §5.3 (execution-event request)
- **Related code (this repo):**
  - `packages/adapters/src/inbound/http/ExecutionController.ts:312-412` (inline terminal seam)
  - `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts:43-79` (worker terminal seam)
  - `packages/adapters/src/inbound/http/PositionController.ts:49-87` (detail endpoint to enrich)
  - `packages/application/src/dto/index.ts:23-29` (DTO to extend)
  - `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts` (use-case return shape consumed by the worker)
  - `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts` (canonical direction→tokenOut mapping; do not duplicate)
  - `packages/adapters/src/outbound/notifications/DurableNotificationEventAdapter.ts` (shape reference for outbound adapter)
- **AGENTS.md guardrails:**
  - `AGENTS.md` §Hard Repo Boundaries (no adapter imports from application)
  - `AGENTS.md` §Release-Blocker Invariant (directional mapping lives only in domain)
