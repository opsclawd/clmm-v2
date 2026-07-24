<!-- plan-review-required -->

# Regime Position Plan Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the pinned Regime Engine position-plan and execution-result contracts so users can request, acknowledge, decline, or execute supported advisory plans while clmm-v2 retains authoritative position checks, deterministic breach precedence, explicit wallet signing, durable idempotency, and restart-safe result reporting.

**Architecture:** Vendor and validate the canonical contracts at the application boundary, model plan lifecycle and execution origin explicitly in the domain, and persist both plan state and an execution-result outbox in PostgreSQL. A backend-only adapter calls Regime Engine; focused application use cases build requests from existing authoritative position reads, bridge plan exits into the existing preparation/signing/submission/reconciliation capabilities without pretending they are breach events, and allow a worker to retry audit delivery after crashes. The Position Detail UI talks only to the BFF and renders advisory state separately from deterministic breach controls.

**Tech Stack:** TypeScript, Vitest, NestJS, Drizzle/PostgreSQL, pg-boss, React Native/Expo Router, TanStack Query, pnpm workspaces.

---

## Goal

- Consume only canonical `HOLD`, `STAND_DOWN`, and `REQUEST_EXIT_CLMM` position plans.
- Preserve the precedence `qualified deterministic breach > position plan > pair-level PolicyInsight`.
- Persist plan identity, content hash, lifecycle, user decision, execution linkage, terminal outcome, and result-delivery state.
- Reuse the existing execution preparation, wallet-signing, submission, and reconciliation safety capabilities for plan exits without inventing a breach.
- Deliver canonical execution results idempotently with bounded retry and restart recovery.

## Non-goals

- No inline candles, client-authored regime state, portfolio allocation targets, enter-position, add-liquidity, rebalance, or multi-action execution.
- No autonomous signing or submission.
- No changes to Regime Engine synthesis behavior or PolicyInsight presentation.
- No changes to `/v1/clmm-execution-result`; deterministic breach telemetry remains separate.
- No Solana SDK work in domain, application, or UI packages.
- No cached plan may be presented as current unless the pinned contract explicitly defines its validity and the UI marks it cached/stale.
- No on-chain receipt, attestation, proof, or claim-verification concept.

## Mandatory contract-readiness gate

Do not begin Task 1 while the canonical pin fields in `issue.md` remain unfilled. The issue must name a merged Regime Engine commit, the exact request/response/result artifacts, their version and checksums, and the authenticated/private-network behavior.

Before implementation, inspect the pinned artifacts and abort rather than infer if any of these are absent or ambiguous:

- the exact supported-action enum and unknown-version behavior;
- plan identity, canonical hash rules, as-of/expiry/freshness semantics, and replay/conflict semantics;
- canonical result statuses/reason codes for acknowledgement, success, failure, decline/skip, stale/changed position, expiry/abandonment, and supersession;
- the idempotency key location and duplicate/conflict HTTP behavior;
- retryable versus permanent response classes and authentication header;
- an authoritative exit intent for `REQUEST_EXIT_CLMM` that identifies the requested post-exit posture or swap direction without deriving it from token order;
- whether monetary/result fields are optional when clmm-v2 lacks authoritative values.

If the contract does not carry an unambiguous plan-exit intent, create a prerequisite Regime Engine contract issue and stop. Do not encode an in-range plan exit as a fake `lower-bound-breach` or `upper-bound-breach`.

## Affected files

- `schemas/regime-engine/position-plan.v1/schema.json`
- `schemas/regime-engine/position-plan.v1/schema.sha256`
- `schemas/regime-engine/position-plan.v1/fixtures/valid/`
- `schemas/regime-engine/position-plan.v1/fixtures/invalid/`
- `schemas/regime-engine/position-plan.v1/provenance.json`
- `schemas/regime-engine/execution-result.v1/schema.json`
- `schemas/regime-engine/execution-result.v1/schema.sha256`
- `schemas/regime-engine/execution-result.v1/fixtures/valid/`
- `schemas/regime-engine/execution-result.v1/fixtures/invalid/`
- `schemas/regime-engine/execution-result.v1/provenance.json`
- `packages/application/src/dto/regimePlan.ts`
- `packages/application/src/dto/regimePlanValidator.ts`
- `packages/application/src/dto/regimePlanContract.test.ts`
- `packages/application/src/dto/regimePlanValidator.test.ts`
- `packages/application/src/dto/index.ts`
- `packages/application/src/public/index.ts`
- `packages/application/src/public/regimePlan.exports.test.ts`
- `packages/domain/src/regime/PositionPlan.ts`
- `packages/domain/src/regime/PlanLifecycleReducer.ts`
- `packages/domain/src/regime/PlanLifecycleReducer.test.ts`
- `packages/domain/src/regime/index.ts`
- `packages/domain/src/execution/index.ts`
- `packages/domain/src/history/index.ts`
- `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`
- `packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts`
- `packages/application/src/ports/index.ts`
- `packages/testing/src/fakes/FakePlanRepository.ts`
- `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- `packages/testing/src/fakes/FakeExecutionRepository.ts`
- `packages/testing/src/fakes/index.ts`
- `packages/adapters/src/outbound/storage/schema/position-plans.ts`
- `packages/adapters/src/outbound/storage/schema/index.ts`
- `packages/adapters/src/outbound/storage/PlanStorageAdapter.ts`
- `packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts`
- `packages/adapters/drizzle/0002_position_plan_lifecycle.sql`
- `packages/adapters/drizzle/meta/0002_snapshot.json`
- `packages/adapters/drizzle/0003_execution_origin.sql`
- `packages/adapters/drizzle/meta/0003_snapshot.json`
- `packages/adapters/drizzle/meta/_journal.json`
- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- `packages/application/src/use-cases/plans/RecordPlanDecision.ts`
- `packages/application/src/use-cases/plans/RecordPlanDecision.test.ts`
- `packages/application/src/use-cases/plans/CreatePlanExitPreview.ts`
- `packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts`
- `packages/application/src/use-cases/plans/ApprovePlanExit.ts`
- `packages/application/src/use-cases/plans/ApprovePlanExit.test.ts`
- `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- `packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts`
- `packages/application/src/index.ts`
- `packages/application/src/use-cases/previews/CreateExecutionPreview.ts`
- `packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts`
- `packages/application/src/use-cases/previews/GetExecutionPreview.test.ts`
- `packages/application/src/use-cases/previews/RefreshExecutionPreview.ts`
- `packages/application/src/use-cases/previews/RefreshExecutionPreview.test.ts`
- `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`
- `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts`
- `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
- `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`
- `packages/application/src/use-cases/execution/RecordSignatureDecline.ts`
- `packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts`
- `packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts`
- `packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts`
- `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts`
- `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts`
- `packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts`
- `packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts`
- `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts`
- `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts`
- `packages/application/src/use-cases/execution/GetExecutionHistory.ts`
- `packages/application/src/use-cases/execution/GetExecutionHistory.test.ts`
- `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts`
- `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`
- `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts`
- `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts`
- `packages/application/src/dto/index.ts`
- `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
- `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`
- `packages/ui/src/screens/ExecutionPreviewScreen.tsx`
- `packages/ui/src/screens/HistoryDetailScreen.tsx`
- `packages/ui/src/screens/HistoryListScreen.tsx`
- `packages/ui/src/components/HistoryEventRow.tsx`
- `packages/ui/src/view-models/PreviewViewModel.ts`
- `packages/ui/src/view-models/PreviewViewModel.test.ts`
- `packages/ui/src/view-models/HistoryViewModel.ts`
- `packages/ui/src/view-models/HistoryViewModel.test.ts`
- `apps/app/app/signing/[attemptId].tsx`
- `apps/app/app/execution/[attemptId].tsx`
- `apps/app/src/api/executions.ts`
- `apps/app/src/api/executions.test.ts`
- `apps/app/src/api/previews.ts`
- `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`
- `packages/domain/src/execution/RetryBoundaryPolicy.test.ts`
- `packages/adapters/src/outbound/storage/schema/previews.ts`
- `packages/adapters/src/outbound/storage/schema/executions.ts`
- `packages/adapters/src/outbound/storage/schema/history.ts`
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
- `packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts`
- `packages/adapters/src/inbound/http/PlanController.ts`
- `packages/adapters/src/inbound/http/PlanController.test.ts`
- `packages/adapters/src/inbound/http/AppModule.ts`
- `packages/adapters/src/inbound/http/tokens.ts`
- `packages/adapters/src/composition/AdaptersModule.ts`
- `packages/adapters/src/inbound/jobs/tokens.ts`
- `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts`
- `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts`
- `packages/adapters/src/inbound/jobs/WorkerLifecycle.ts`
- `packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts`
- `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- `apps/app/src/api/plans.ts`
- `apps/app/src/api/plans.test.ts`
- `packages/ui/src/view-models/PositionPlanViewModel.ts`
- `packages/ui/src/view-models/PositionPlanViewModel.test.ts`
- `packages/ui/src/components/PositionPlanCard.tsx`
- `packages/ui/src/components/PositionPlanCard.test.tsx`
- `packages/ui/src/screens/PositionDetailScreen.tsx`
- `packages/ui/src/screens/PositionDetailScreen.test.tsx`
- `packages/ui/src/index.ts`
- `apps/app/app/position/[id].tsx`
- `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`
- `README.md`
- `.env.sample`
- `docs/architecture/domain-model.md`
- `docs/architecture/repo-map.md`
- `docs/architecture/release-checklist.md`

## Cross-task implementation rules

- Write every invariant test named below before its implementation and run it once to observe the intended failure.
- After each implementation task, the orchestration loop automatically runs `pnpm -r typecheck`; keep each task workspace-typecheckable.
- When a port method is introduced or changed, update every implementation and fake in the same task.
- Treat the vendored schema and fixtures as immutable upstream assets. Handwritten DTOs may narrow them only by validation, never widen them.
- Keep plan-result delivery as a durable outbox operation: persist local state before attempting the network call.
- Use the same result idempotency identity for every retry of one terminal plan outcome.
- Keep all lower/upper breach mapping calls inside `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`; plan exits use the explicit canonical plan-exit intent.
- Never let a `HOLD` or `STAND_DOWN` transition mutate triggers, breach episodes, previews, or deterministic execution attempts.
- Use new focused test files for plan behavior rather than expanding `packages/adapters/src/inbound/http/ExecutionController.test.ts`, which is already oversized.

## Task 1: Vendor and validate the pinned plan contracts

**Files:**

- Create: `schemas/regime-engine/position-plan.v1/schema.json`
- Create: `schemas/regime-engine/position-plan.v1/schema.sha256`
- Create: `schemas/regime-engine/position-plan.v1/fixtures/valid/`
- Create: `schemas/regime-engine/position-plan.v1/fixtures/invalid/`
- Create: `schemas/regime-engine/position-plan.v1/provenance.json`
- Create: `schemas/regime-engine/execution-result.v1/schema.json`
- Create: `schemas/regime-engine/execution-result.v1/schema.sha256`
- Create: `schemas/regime-engine/execution-result.v1/fixtures/valid/`
- Create: `schemas/regime-engine/execution-result.v1/fixtures/invalid/`
- Create: `schemas/regime-engine/execution-result.v1/provenance.json`
- Create: `packages/application/src/dto/regimePlan.ts`
- Create: `packages/application/src/dto/regimePlanValidator.ts`
- Create: `packages/application/src/dto/regimePlanContract.test.ts`
- Create: `packages/application/src/dto/regimePlanValidator.test.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Create: `packages/application/src/public/regimePlan.exports.test.ts`

**Acceptance criteria:**

- [ ] Copy the exact pinned artifacts into the two vendored directories, preserving valid/invalid fixtures, and record source repository, commit, source path, and SHA-256 for every asset in each `provenance.json`.
- [ ] Define application-owned `RegimePlanRequest`, `RegimePlanResponse`, `RegimePlanAction`, `RegimePlanExitIntent`, and `RegimeExecutionResult` types whose fields and literals exactly match the pinned schemas.
- [ ] Implement `parseRegimePlanResponse` and `parseRegimeExecutionResult` as fail-closed validators. Unknown versions/actions/statuses, extra forbidden fields, malformed timestamps, invalid expiry ordering, and invalid hashes return a validation failure rather than a partial object.
- [ ] Add fixture parity tests named `accepts every canonical position-plan valid fixture`, `rejects every canonical position-plan invalid fixture`, `accepts every canonical execution-result valid fixture`, and `rejects every canonical execution-result invalid fixture`.
- [ ] Add focused validator tests named `rejects unsupported plan actions and schema versions`, `rejects a request-exit plan without canonical exit intent`, and `does not admit inline candles regime state or portfolio allocations`.
- [ ] Export only validated contract types/parsers through the application public boundary.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/dto/regimePlanContract.test.ts src/dto/regimePlanValidator.test.ts src/public/regimePlan.exports.test.ts
pnpm exec eslint packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/regimePlan.exports.test.ts
git diff --check -- schemas/regime-engine/position-plan.v1 schemas/regime-engine/execution-result.v1 packages/application/src/dto/regimePlan.ts packages/application/src/dto/regimePlanValidator.ts packages/application/src/dto/regimePlanContract.test.ts packages/application/src/dto/regimePlanValidator.test.ts packages/application/src/dto/index.ts packages/application/src/public/index.ts packages/application/src/public/regimePlan.exports.test.ts
```

Expected: fixture parity and export tests pass; invalid or unsupported contract values never produce executable DTOs.

## Task 2: Model the plan lifecycle and explicit execution origin

**Files:**

- Create: `packages/domain/src/regime/PositionPlan.ts`
- Create: `packages/domain/src/regime/PlanLifecycleReducer.ts`
- Create: `packages/domain/src/regime/PlanLifecycleReducer.test.ts`
- Modify: `packages/domain/src/regime/index.ts`
- Modify: `packages/domain/src/execution/index.ts`
- Modify: `packages/domain/src/history/index.ts`
- Modify: `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`
- Modify: `packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts`

**Behavioral invariants:**

- `requested + valid response -> advisory-ready`; exact replay preserves the existing record; same plan ID with a different canonical hash transitions to `conflict` and cannot execute.
- `advisory-ready(HOLD|STAND_DOWN) + acknowledge -> result-pending` with no execution origin or attempt.
- `advisory-ready(REQUEST_EXIT_CLMM) + preview -> exit-previewed`; approval may then move through `awaiting-signature`, `submitted`, and `result-pending`.
- `advisory-ready|exit-previewed|awaiting-signature + qualified breach -> superseded`; the breach remains independently actionable.
- An expired/stale/position-changed plan can move only to `result-pending` with the canonical non-executed outcome.
- `result-pending + delivery success -> reported`; retry scheduling leaves it `result-pending`; permanent rejection moves to `report-failed` without re-execution.
- Terminal/reported/conflict plans reject transitions that would create another preview or attempt.
- `ExecutionOrigin` is either `qualified-breach` with a real `BreachDirection` or `regime-plan` with plan ID/hash and canonical exit intent; neither variant can be constructed with the other variant's fields.
- Lower and upper breach behavior remains exactly the release-blocker mapping in `DirectionalExitPolicyService`; no plan-intent mapping is added elsewhere.

**Acceptance criteria:**

- [ ] Write named tests `transitions a valid requested plan to advisory-ready`, `keeps exact response replay idempotent`, `fails closed on same plan id with different content`, `acknowledges hold without creating execution`, `supersedes advisory work when a breach qualifies`, `prevents execution after expiry or material position change`, `keeps retryable result delivery pending`, `rejects duplicate execution from a terminal plan`, and `keeps breach and regime-plan execution origins disjoint`.
- [ ] Add an exhaustive pure reducer that returns typed transition results and throws on impossible runtime discriminants.
- [ ] Introduce `ExecutionOrigin` alongside the existing execution/history types without changing their required members yet; Task 7 performs the atomic signature migration with every consumer and storage implementation.
- [ ] Add regression tests named `lower breach still exits to USDC` and `upper breach still exits to SOL`.

**Verification:**

```bash
pnpm --filter @clmm/domain test -- src/regime/PlanLifecycleReducer.test.ts src/exit-policy/DirectionalExitPolicyService.test.ts
pnpm exec eslint packages/domain/src/regime/PositionPlan.ts packages/domain/src/regime/PlanLifecycleReducer.ts packages/domain/src/regime/PlanLifecycleReducer.test.ts packages/domain/src/regime/index.ts packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts
git diff --check -- packages/domain/src/regime/PositionPlan.ts packages/domain/src/regime/PlanLifecycleReducer.ts packages/domain/src/regime/PlanLifecycleReducer.test.ts packages/domain/src/regime/index.ts packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.ts packages/domain/src/exit-policy/DirectionalExitPolicyService.test.ts
```

Expected: all lifecycle and directional-policy tests pass, including the unchanged lower/upper mapping.

## Task 3: Persist plan lifecycle and the result outbox atomically

**Files:**

- Modify: `packages/application/src/ports/index.ts`
- Create: `packages/testing/src/fakes/FakePlanRepository.ts`
- Modify: `packages/testing/src/fakes/index.ts`
- Create: `packages/adapters/src/outbound/storage/schema/position-plans.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Create: `packages/adapters/src/outbound/storage/PlanStorageAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts`
- Create: `packages/adapters/drizzle/0002_position_plan_lifecycle.sql`
- Create: `packages/adapters/drizzle/meta/0002_snapshot.json`
- Modify: `packages/adapters/drizzle/meta/_journal.json`

**Behavioral invariants:**

- The first response for a plan ID inserts the plan; an identical plan ID/hash returns `exact-replay`; a different hash returns `conflict` without overwriting original content.
- One plan can link to at most one execution attempt, and one execution attempt can link to at most one plan.
- A terminal local outcome and its canonical result payload/idempotency identity are committed in one transaction.
- Claiming due result rows is concurrency-safe; one row is not delivered by two workers simultaneously.
- Retry scheduling preserves payload and idempotency identity while incrementing attempt count and moving `nextAttemptAt`.
- Marking delivered stores completion metadata and removes the row from future claims.

**Acceptance criteria:**

- [ ] Add `PlanRepository` with explicit methods for request creation, response acceptance, current-plan lookup, decision recording, execution linkage, terminal-result enqueue, due-result claim, retry scheduling, delivery completion, and permanent failure.
- [ ] In the same task, implement every method in `PlanStorageAdapter` and `FakePlanRepository`.
- [ ] Store plan identity/hash/version, position/wallet identity, request/response/as-of/expiry timestamps, action/reasons, snapshot fingerprint, lifecycle/decision, execution attempt ID, canonical result JSON, result idempotency key, delivery attempts, next attempt, last error class, and delivered timestamp.
- [ ] Add database uniqueness/check constraints for replay identity, one-to-one attempt linkage, valid lifecycle values, and result-delivery consistency.
- [ ] Generate a forward-only migration and metadata; never edit an existing migration.
- [ ] Add tests named `accepts an exact plan replay without duplication`, `preserves original plan on conflicting replay`, `links one execution attempt exactly once`, `commits terminal outcome and outbox together`, `claims each due result once under concurrency`, and `reschedules retry without changing idempotency identity`.

**Verification:**

```bash
pnpm --filter @clmm/adapters test -- src/outbound/storage/PlanStorageAdapter.test.ts
pnpm exec eslint packages/application/src/ports/index.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/storage/schema/position-plans.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/testing/src/fakes/FakePlanRepository.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/storage/schema/position-plans.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.ts packages/adapters/src/outbound/storage/PlanStorageAdapter.test.ts packages/adapters/drizzle/0002_position_plan_lifecycle.sql packages/adapters/drizzle/meta/0002_snapshot.json packages/adapters/drizzle/meta/_journal.json
```

Expected: focused repository tests pass and the migration creates only the new plan/outbox structures.

## Task 4: Implement authenticated Regime plan and result transport

**Files:**

- Modify: `packages/application/src/ports/index.ts`
- Create: `packages/testing/src/fakes/FakeRegimePlanPort.ts`
- Modify: `packages/testing/src/fakes/index.ts`
- Create: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts`
- Create: `packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts`

**Behavioral invariants:**

- A valid plan response is parsed through the canonical validator before it reaches application logic.
- Timeout, network failure, `5xx`, and the contract's retryable statuses return explicit degraded/retryable results and never throw into deterministic monitoring.
- Unknown version/action, invalid JSON, and schema-invalid `2xx` bodies fail closed as malformed.
- Authentication, validation, and conflict failures are permanent and are never retried indefinitely.
- Every execution-result retry sends byte-equivalent canonical payload and the same idempotency identity.
- The adapter never calls `/v1/clmm-execution-result`.

**Acceptance criteria:**

- [ ] Add `RegimePlanPort.requestPositionPlan` and `RegimePlanPort.reportExecutionResult`; update `RegimePlanAdapter` and `FakeRegimePlanPort` in this same task.
- [ ] Use only `REGIME_ENGINE_BASE_URL` plus the exact backend-only authentication semantics from the pinned contract.
- [ ] Apply an abortable request timeout. Do not put retry loops in the adapter; return typed classifications so the persisted outbox owns retries.
- [ ] Log bounded metadata only: plan/result IDs, position ID, status class, duration, and validation reason. Never log wallet secrets, auth tokens, signed payloads, or complete monetary payloads.
- [ ] Add tests named `posts the exact canonical position-plan request`, `authenticates both write endpoints`, `fails closed on unknown action version and malformed body`, `classifies timeout and server failure as degraded`, `classifies auth validation and conflict as permanent`, and `reuses payload and idempotency identity across result attempts`.

**Verification:**

```bash
pnpm --filter @clmm/adapters test -- src/outbound/regime-engine/RegimePlanAdapter.test.ts
pnpm exec eslint packages/application/src/ports/index.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
git diff --check -- packages/application/src/ports/index.ts packages/testing/src/fakes/FakeRegimePlanPort.ts packages/testing/src/fakes/index.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.ts packages/adapters/src/outbound/regime-engine/RegimePlanAdapter.test.ts
```

Expected: transport tests prove authentication, validation, classification, endpoint separation, and stable result idempotency.

## Task 5: Request plans from authoritative position state

**Files:**

- Create: `packages/application/src/use-cases/plans/RequestPositionPlan.ts`
- Create: `packages/application/src/use-cases/plans/RequestPositionPlan.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`

**Behavioral invariants:**

- A missing, unsupported, stale, or ownership-mismatched position never produces an upstream request.
- The request contains only pinned fields derived from the existing `SupportedPositionReadPort`, trigger repository, clock, and locally owned plan/execution state.
- A qualified trigger is included when the contract supports it and always outranks the returned advisory plan.
- Regime timeout/unavailability returns an explicit advisory-degraded result and does not mutate trigger, breach, notification, preview, or execution state.
- An exact response replay returns the existing plan; conflicting content remains unexecuted.
- Unknown/malformed responses are persisted only as bounded diagnostics, never as executable plans.

**Acceptance criteria:**

- [ ] Add tests named `builds a position-scoped request from authoritative local state`, `sends no inline candles or client-authored regime state`, `rejects stale position state before calling Regime`, `keeps qualified lower breach authoritative during plan outage`, `keeps qualified upper breach authoritative over hold`, `returns advisory degraded without touching deterministic repositories`, `returns the existing plan for exact replay`, and `fails closed on conflicting replay`.
- [ ] Compute and persist a stable authoritative-position fingerprint from the exact contract-relevant local fields so later approval can detect material changes.
- [ ] Keep request mapping in this use case; do not duplicate RPC reads inside `RegimePlanAdapter`.
- [ ] Return an application DTO suitable for BFF/UI display, including explicit unavailable/stale/superseded/conflict states.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/RequestPositionPlan.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
git diff --check -- packages/application/src/use-cases/plans/RequestPositionPlan.ts packages/application/src/use-cases/plans/RequestPositionPlan.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
```

Expected: focused tests prove position scoping, freshness, replay behavior, and strict isolation from breach monitoring.

## Task 6: Record advisory decisions and enqueue canonical results

**Files:**

- Create: `packages/application/src/use-cases/plans/RecordPlanDecision.ts`
- Create: `packages/application/src/use-cases/plans/RecordPlanDecision.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`

**Behavioral invariants:**

- Acknowledging `HOLD` or `STAND_DOWN` persists the user decision and canonical result before any delivery attempt.
- `HOLD` and `STAND_DOWN` create no preview, attempt, wallet-signature request, or transaction submission.
- A qualified breach supersedes advisory work but is never deleted, suppressed, or delayed.
- Repeating the same acknowledgement returns the existing result identity; a conflicting second decision fails closed.
- Expired plans and unsupported decision/action combinations enqueue the canonical skipped/expired outcome supported by the contract.

**Acceptance criteria:**

- [ ] Add tests named `acknowledges hold without on-chain work`, `acknowledges stand-down without suppressing a qualified breach`, `persists result before delivery`, `replays the same acknowledgement idempotently`, `rejects a conflicting second decision`, and `records canonical expiry without execution`.
- [ ] Build result payloads solely from persisted authoritative fields; omit unavailable monetary values rather than estimate them.
- [ ] Keep remote delivery out of the request transaction; Task 8's worker owns delivery.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/RecordPlanDecision.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/RecordPlanDecision.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
git diff --check -- packages/application/src/use-cases/plans/RecordPlanDecision.ts packages/application/src/use-cases/plans/RecordPlanDecision.test.ts packages/application/src/index.ts packages/application/src/public/index.ts
```

Expected: acknowledgement tests pass and no execution dependency is invoked.

## Task 7: Bridge plan exits into the signed execution pipeline

**Files:**

- Modify: `packages/domain/src/execution/index.ts`
- Modify: `packages/domain/src/history/index.ts`
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/testing/src/fakes/FakeExecutionRepository.ts`
- Modify: `packages/application/src/use-cases/previews/CreateExecutionPreview.ts`
- Modify: `packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts`
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureDecline.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts`
- Modify: `packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts`
- Modify: `packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts`
- Create: `packages/application/src/use-cases/plans/CreatePlanExitPreview.ts`
- Create: `packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts`
- Create: `packages/application/src/use-cases/plans/ApprovePlanExit.ts`
- Create: `packages/application/src/use-cases/plans/ApprovePlanExit.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/previews.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/executions.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/history.ts`
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
- Create: `packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts`
- Create: `packages/adapters/drizzle/0003_execution_origin.sql`
- Create: `packages/adapters/drizzle/meta/0003_snapshot.json`
- Modify: `packages/adapters/drizzle/meta/_journal.json`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.test.ts`
- Modify: `packages/adapters/src/inbound/http/PreviewController.ts`
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`
- Modify: `packages/testing/src/scenarios/approvalFlow.ts`
- Modify: `packages/testing/src/scenarios/StalePreviews.test.ts`
- Modify: `packages/testing/src/scenarios/PartialCompletionResume.test.ts`
- Modify: `packages/testing/src/scenarios/InterruptedSessionResume.test.ts`
- Modify: `packages/testing/src/scenarios/BreachToExitScenario.ts`
- Modify: `packages/application/src/use-cases/previews/GetExecutionPreview.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts`
- Modify: `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts`
- Modify: `packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts`
- Modify: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionHistory.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionHistory.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts`
- Modify: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts`
- Modify: `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`
- Modify: `packages/ui/src/screens/ExecutionPreviewScreen.tsx`
- Modify: `packages/ui/src/screens/HistoryDetailScreen.tsx`
- Modify: `packages/ui/src/screens/HistoryListScreen.tsx`
- Modify: `packages/ui/src/components/HistoryEventRow.tsx`
- Modify: `packages/ui/src/view-models/PreviewViewModel.ts`
- Modify: `packages/ui/src/view-models/PreviewViewModel.test.ts`
- Modify: `packages/ui/src/view-models/HistoryViewModel.ts`
- Modify: `packages/ui/src/view-models/HistoryViewModel.test.ts`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/app/app/signing/[attemptId].tsx`
- Modify: `apps/app/app/execution/[attemptId].tsx`
- Modify: `apps/app/src/api/executions.ts`
- Modify: `apps/app/src/api/executions.test.ts`
- Modify: `apps/app/src/api/previews.ts`
- Modify: `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`
- Modify: `packages/domain/src/execution/RetryBoundaryPolicy.test.ts`

**Behavioral invariants:**

- A plan exit receives a distinct `regime-plan` execution origin; breach previews/attempts retain `qualified-breach` plus their exact direction.
- Preview creation re-reads position state and rejects closed, stale, expired, superseded, ownership-mismatched, or materially changed positions before preparing a transaction.
- A plan preview uses the canonical exit intent and the same quote/slippage/route/balance/fee/priority-fee/transaction-freshness safety capabilities as existing execution preparation.
- Approval still requires an explicit user action and wallet signature; no accepted plan can auto-submit.
- One plan creates at most one preview and one execution attempt, including concurrent/replayed requests and restart.
- User decline/interruption/abandonment and preparation/submission/reconciliation failures preserve the actual local outcome for canonical reporting.
- A breach that qualifies before signing supersedes the plan; no stale plan payload is signed.
- Existing lower/upper breach preview, signing, submission, reconciliation, retry, and history behavior remains unchanged.

**Acceptance criteria:**

- [ ] Complete the atomic `ExecutionOrigin` signature migration deferred by Task 2: add a required `origin: ExecutionOrigin` field to domain `ExecutionAttempt` in `packages/domain/src/execution/index.ts`, and replace the required `breachDirection: BreachDirection` field on domain `HistoryEvent` and `ExecutionOutcomeSummary` in `packages/domain/src/history/index.ts` with the required `origin: ExecutionOrigin` field, in this same task.
- [ ] Change `ExecutionRepository` preview/attempt methods to store `ExecutionOrigin`; update `OperationalStorageAdapter` and `FakeExecutionRepository` in this same task so the workspace typecheck remains green.
- [ ] Migrate direction columns to nullable only when `origin_kind = 'regime-plan'`, add plan-origin foreign keys/check constraints, and retain mandatory valid direction for `qualified-breach`.
- [ ] Add tests named `stores a plan exit without fabricating breach direction`, `preserves lower and upper breach origins`, `rejects a plan after position material change`, `rejects a plan superseded by a qualified breach`, `creates only one preview and attempt under replay`, `requires explicit approval and wallet signature`, `records user decline as the canonical non-executed outcome`, `links successful reconciliation to the plan`, and `records failed transaction without re-executing`.
- [ ] Make `CreatePlanExitPreview` and `ApprovePlanExit` thin policy wrappers around shared execution capabilities; do not duplicate Solana adapter logic.
- [ ] Keep exported DTOs discriminated by execution origin so UI/history never labels a plan exit as a lower/upper breach.
- [ ] Update every direct reader/writer of `StoredExecutionAttempt.breachDirection`, domain `HistoryEvent.breachDirection`, and `ExecutionOutcomeSummary.breachDirection` in the same task so the workspace typecheck stays green after the migration: the preview/attempt/history use cases (`GetExecutionPreview`, `RecordSignatureInterruption`, `ResumeExecutionAttempt`, `GetAwaitingSignaturePayload`, `GetExecutionHistory`, `GetWalletExecutionHistory`, `GetExecutionAttemptDetail`), the application DTO/public exports, `OffChainHistoryStorageAdapter`, the execution/preview/history UI surfaces (`ExecutionPreviewScreen`, `HistoryDetailScreen`, `HistoryListScreen`, `HistoryEventRow`, `PreviewViewModel`, `HistoryViewModel`), the app routes and API clients that read execution/preview DTOs (`signing/[attemptId]`, `execution/[attemptId]`, `apps/app/src/api/executions.ts`, `apps/app/src/api/previews.ts`), `FakeExecutionHistoryRepository`, and the domain `RetryBoundaryPolicy.test.ts` fixture. Do not touch Trigger-scoped `breachDirection` consumers (Position summary, Alert, Notification, and Trigger-qualification code) — that field belongs to `Trigger`, not to `ExecutionOrigin`, and is out of scope for this migration.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/previews/CreateExecutionPreview.test.ts src/use-cases/plans/CreatePlanExitPreview.test.ts src/use-cases/plans/ApprovePlanExit.test.ts
pnpm --filter @clmm/adapters test -- src/outbound/storage/PlanExecutionOriginStorage.test.ts
pnpm exec eslint packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/application/src/ports/index.ts packages/testing/src/fakes/FakeExecutionRepository.ts packages/application/src/use-cases/previews/CreateExecutionPreview.ts packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts packages/application/src/use-cases/plans/ApprovePlanExit.ts packages/application/src/use-cases/plans/ApprovePlanExit.test.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/storage/schema/previews.ts packages/adapters/src/outbound/storage/schema/executions.ts packages/adapters/src/outbound/storage/schema/history.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts packages/application/src/use-cases/previews/GetExecutionPreview.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts packages/application/src/use-cases/execution/GetExecutionHistory.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts packages/application/src/dto/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/components/HistoryEventRow.tsx packages/ui/src/view-models/PreviewViewModel.ts packages/ui/src/view-models/HistoryViewModel.ts packages/ui/src/index.ts apps/app/src/api/executions.ts apps/app/src/api/previews.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
git diff --check -- packages/domain/src/execution/index.ts packages/domain/src/history/index.ts packages/application/src/ports/index.ts packages/testing/src/fakes/FakeExecutionRepository.ts packages/application/src/use-cases/previews/CreateExecutionPreview.ts packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts packages/application/src/use-cases/execution/RecordSignatureDecline.ts packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.ts packages/application/src/use-cases/plans/CreatePlanExitPreview.test.ts packages/application/src/use-cases/plans/ApprovePlanExit.ts packages/application/src/use-cases/plans/ApprovePlanExit.test.ts packages/application/src/index.ts packages/application/src/public/index.ts packages/adapters/src/outbound/storage/schema/previews.ts packages/adapters/src/outbound/storage/schema/executions.ts packages/adapters/src/outbound/storage/schema/history.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/PlanExecutionOriginStorage.test.ts packages/adapters/drizzle/0003_execution_origin.sql packages/adapters/drizzle/meta/0003_snapshot.json packages/adapters/drizzle/meta/_journal.json packages/application/src/use-cases/previews/GetExecutionPreview.ts packages/application/src/use-cases/execution/RecordSignatureInterruption.ts packages/application/src/use-cases/execution/ResumeExecutionAttempt.ts packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts packages/application/src/use-cases/execution/GetExecutionHistory.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts packages/application/src/use-cases/execution/GetExecutionAttemptDetail.ts packages/application/src/dto/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/ui/src/screens/ExecutionPreviewScreen.tsx packages/ui/src/screens/HistoryDetailScreen.tsx packages/ui/src/screens/HistoryListScreen.tsx packages/ui/src/components/HistoryEventRow.tsx packages/ui/src/view-models/PreviewViewModel.ts packages/ui/src/view-models/HistoryViewModel.ts packages/ui/src/index.ts apps/app/src/api/executions.ts apps/app/src/api/previews.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts packages/domain/src/execution/RetryBoundaryPolicy.test.ts
```

Expected: both execution origins persist and execute truthfully; every existing focused breach test remains green.

## Task 8: Reconcile and retry execution-result delivery after restart

**Files:**

- Create: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts`
- Create: `packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts`
- Create: `packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerLifecycle.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`

**Behavioral invariants:**

- On launch/schedule, accepted plans with terminal local outcomes but undelivered results are discovered and reported without creating another execution.
- Unknown network outcomes schedule bounded exponential backoff with jitter/cap from constants and preserve the idempotency identity.
- Permanent auth/validation/conflict failures are marked `report-failed` and are not scheduled indefinitely.
- Successful duplicate/idempotent upstream responses mark the local result delivered.
- A non-terminal linked attempt remains pending and is revisited after reconciliation; it is never reported as success early.
- One malformed row or one delivery failure does not prevent other due rows from being processed.

**Acceptance criteria:**

- [ ] Add tests named `reports a persisted terminal result after app restart`, `does not execute again while recovering result delivery`, `retries unknown network outcome with the same idempotency identity`, `caps retry count and backoff`, `stops retrying permanent rejection`, `treats canonical duplicate response as delivered`, and `continues processing after one row fails`.
- [ ] Register a dedicated pg-boss queue and recurring schedule after schema readiness, separate from submitted-attempt reconciliation.
- [ ] Emit bounded observability for claimed, delivered, retried, exhausted, and permanently rejected results.

**Verification:**

```bash
pnpm --filter @clmm/application test -- src/use-cases/plans/SyncPlanExecutionResults.test.ts
pnpm --filter @clmm/adapters test -- src/inbound/jobs/PlanResultSweepHandler.test.ts src/inbound/jobs/WorkerLifecycle.test.ts
pnpm exec eslint packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/index.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/tokens.ts
git diff --check -- packages/application/src/use-cases/plans/SyncPlanExecutionResults.ts packages/application/src/use-cases/plans/SyncPlanExecutionResults.test.ts packages/application/src/index.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.ts packages/adapters/src/inbound/jobs/PlanResultSweepHandler.test.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.ts packages/adapters/src/inbound/jobs/WorkerLifecycle.test.ts packages/adapters/src/inbound/jobs/WorkerModule.ts packages/adapters/src/inbound/jobs/tokens.ts
```

Expected: recovery/retry tests prove durable, bounded, idempotent reporting and no duplicate execution.

## Task 9: Expose plan lifecycle through the BFF and wire backend composition

**Files:**

- Create: `packages/adapters/src/inbound/http/PlanController.ts`
- Create: `packages/adapters/src/inbound/http/PlanController.test.ts`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`

**Behavioral invariants:**

- Plan routes require wallet and position identity and return `404` for ownership mismatch without leaking another wallet's plan.
- Request, acknowledge/decline, preview, and approval endpoints map application discriminants to stable HTTP statuses and bounded bodies.
- Replayed commands return the existing resource/result identity; conflicts return `409` and never execute.
- Advisory degradation remains a successful bounded BFF state and does not alter health or deterministic execution routes.
- Regime credentials stay backend-only.

**Acceptance criteria:**

- [ ] Add `POST /plans/:walletId/:positionId/request`, `GET /plans/:walletId/:positionId/current`, `POST /plans/:walletId/:positionId/:planId/decision`, `POST /plans/:walletId/:positionId/:planId/preview`, and `POST /plans/:walletId/:positionId/:planId/approve` handlers.
- [ ] Register `PlanRepository`, `RegimePlanPort`, and shared execution dependencies in both API and worker composition; do not add `EXPO_PUBLIC_REGIME_ENGINE_*`.
- [ ] Add tests named `returns a position-scoped plan envelope`, `returns advisory degraded without affecting position routes`, `rejects wallet ownership mismatch`, `returns existing identity for replay`, `returns conflict without preview or submission`, and `never exposes Regime credentials or raw validation diagnostics`.

**Verification:**

```bash
pnpm --filter @clmm/adapters test -- src/inbound/http/PlanController.test.ts
pnpm exec eslint packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/jobs/tokens.ts
git diff --check -- packages/adapters/src/inbound/http/PlanController.ts packages/adapters/src/inbound/http/PlanController.test.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/inbound/jobs/tokens.ts
```

Expected: controller and composition tests pass with no client-visible Regime secret.

## Task 10: Add Position Detail plan UX and app orchestration

**Files:**

- Create: `apps/app/src/api/plans.ts`
- Create: `apps/app/src/api/plans.test.ts`
- Create: `packages/ui/src/view-models/PositionPlanViewModel.ts`
- Create: `packages/ui/src/view-models/PositionPlanViewModel.test.ts`
- Create: `packages/ui/src/components/PositionPlanCard.tsx`
- Create: `packages/ui/src/components/PositionPlanCard.test.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`
- Modify: `packages/ui/src/index.ts`
- Modify: `apps/app/app/position/[id].tsx`

**Behavioral invariants:**

- `HOLD` and `STAND_DOWN` render as advisory states with acknowledgement controls and no execution control.
- `REQUEST_EXIT_CLMM` renders a preview action, never an automatic submit action.
- Qualified breach UI remains primary and actionable even when a plan says hold/stand-down or Regime is unavailable.
- Stale, expired, superseded, conflict, malformed, and unavailable plans render explicit non-executable states.
- Background/request errors do not hide position detail or deterministic preview controls.
- Replayed button presses reuse the same plan/preview/result identity and disable duplicate in-flight mutations.

**Acceptance criteria:**

- [ ] Add API parsing that rejects malformed BFF envelopes and accepts only application-public DTOs.
- [ ] Add tests named `renders hold as acknowledgement only`, `renders stand-down without hiding qualified breach exit`, `renders request-exit as preview then explicit approval`, `disables stale expired superseded and conflicting plans`, `keeps position and breach controls during plan outage`, and `deduplicates repeated decision and preview taps`.
- [ ] Keep all server state in TanStack Query; invalidate the current-plan query after mutations and preserve the current position query.
- [ ] Keep presentation formatting in `PositionPlanViewModel`, not the route or API client.

**Verification:**

```bash
pnpm --filter @clmm/app test -- src/api/plans.test.ts
pnpm --filter @clmm/ui test -- src/view-models/PositionPlanViewModel.test.ts src/components/PositionPlanCard.test.tsx src/screens/PositionDetailScreen.test.tsx
pnpm exec eslint apps/app/src/api/plans.ts apps/app/src/api/plans.test.ts packages/ui/src/view-models/PositionPlanViewModel.ts packages/ui/src/view-models/PositionPlanViewModel.test.ts packages/ui/src/components/PositionPlanCard.tsx packages/ui/src/components/PositionPlanCard.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/index.ts apps/app/app/position/'[id].tsx'
git diff --check -- apps/app/src/api/plans.ts apps/app/src/api/plans.test.ts packages/ui/src/view-models/PositionPlanViewModel.ts packages/ui/src/view-models/PositionPlanViewModel.test.ts packages/ui/src/components/PositionPlanCard.tsx packages/ui/src/components/PositionPlanCard.test.tsx packages/ui/src/screens/PositionDetailScreen.tsx packages/ui/src/screens/PositionDetailScreen.test.tsx packages/ui/src/index.ts apps/app/app/position/'[id].tsx'
```

Expected: focused app/UI tests pass and deterministic exit controls retain visual/action precedence.

## Task 11: Add lifecycle scenarios and operational documentation

**Files:**

- Create: `packages/testing/src/scenarios/PositionPlanLifecycle.test.ts`
- Modify: `README.md`
- Modify: `.env.sample`
- Modify: `docs/architecture/domain-model.md`
- Modify: `docs/architecture/repo-map.md`
- Modify: `docs/architecture/release-checklist.md`

**Behavioral invariants:**

- End-to-end exact replay does not duplicate a plan, preview, attempt, transaction submission, or result.
- Restart after acceptance/terminal execution resumes only result reporting.
- Lower and upper qualified breaches remain actionable over plan outage, hold, and stand-down.
- Position change before approval yields the canonical non-executed result.
- Successful, failed, declined, stale/expired, superseded, and abandoned outcomes close the audit loop exactly once.

**Acceptance criteria:**

- [ ] Add scenario tests named `qualified lower breach outranks unavailable plan`, `qualified upper breach outranks hold plan`, `position change before signing skips plan execution`, `user decline reports once`, `successful exit reports authoritative result once`, `failed transaction reports failure once`, `restart resumes reporting without reexecution`, `result replay preserves idempotency`, and `conflicting result fails permanently`.
- [ ] Document backend-only Regime variables, migration ownership, worker/result-outbox behavior, endpoint separation, execution-origin model, breach precedence, and manual failure drills.
- [ ] Add release-checklist items for applying the migration before worker rollout, verifying private authentication, inducing a retryable result timeout, restarting the worker, and confirming no duplicate execution.

**Verification:**

```bash
pnpm --filter @clmm/testing test -- src/scenarios/PositionPlanLifecycle.test.ts
pnpm exec prettier --check packages/testing/src/scenarios/PositionPlanLifecycle.test.ts README.md docs/architecture/domain-model.md docs/architecture/repo-map.md docs/architecture/release-checklist.md
git diff --check -- packages/testing/src/scenarios/PositionPlanLifecycle.test.ts README.md .env.sample docs/architecture/domain-model.md docs/architecture/repo-map.md docs/architecture/release-checklist.md
```

Expected: all named scenarios pass and the documentation describes the actual persisted/retry behavior and deployment order.

## Tests to add or update

- Canonical fixture parity and validator rejection tests for both vendored schemas.
- Pure lifecycle transition and execution-origin tests.
- PostgreSQL repository tests for replay conflict, atomic outbox writes, concurrency claims, and retry scheduling.
- HTTP adapter tests for auth, timeout, malformed data, permanent failures, and idempotency.
- Application tests for authoritative request construction, breach precedence, acknowledgement, plan exit safety, decline, success/failure, and recovery.
- Worker tests for bounded backoff, restart recovery, poison-row isolation, and no duplicate execution.
- BFF tests for ownership, replay/conflict status mapping, and secret-safe responses.
- UI tests for every supported action and every fail-closed/degraded state.
- Cross-package lifecycle scenarios for the acceptance-criteria matrix.

## Validation commands

The dedicated validation phase, after all implementation tasks, should run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all five repository-wide commands pass. These are not a standalone implementation task; each task also has focused verification above.

## Risk areas

- The canonical contracts are not pinned in the current issue; implementation cannot safely start yet.
- The design's phrase “bridge into `CreateExecutionPreview`” hides a semantic mismatch: existing attempts require a real breach direction. The explicit `ExecutionOrigin` migration is required to avoid falsifying history and UI.
- Database migration and worker rollout order can produce restart loops if the worker sees new schema expectations before the API-owned migration runs.
- Unknown network outcomes can duplicate result posts unless payload and idempotency identity are persisted before delivery.
- Race conditions exist between plan request/approval and deterministic trigger qualification; transactional transitions and a final pre-signing breach check are required.
- Position fingerprints must include exactly contract-relevant authoritative fields: too little misses material changes; too much causes harmless changes to invalidate plans.
- Monetary/result data must remain omitted when not authoritative; estimates must not be reported as realized amounts.
- Authentication/private-network behavior must match the pinned contract exactly; weakening it would create a public write surface.

## Stop conditions

- Stop before Task 1 if the issue still lacks exact merged contract pins, checksums, and authentication semantics.
- Stop if the vendored assets do not match the pinned upstream SHA-256 values.
- Stop if `REQUEST_EXIT_CLMM` lacks an authoritative post-exit intent; do not infer direction from token order, range state, PolicyInsight, or current holdings.
- Stop if the live endpoint is unauthenticated and not provably private-only.
- Stop if the schema requires monetary/result fields clmm-v2 cannot populate authoritatively.
- Stop if a proposed implementation would move directional mapping outside `packages/domain/src/exit-policy/DirectionalExitPolicyService.ts`.
- Stop if a task would leave a changed port/interface without all implementations and fakes updated in that same task.
- Stop deployment if the new migration has not completed before API/worker code requiring the new tables starts.
- Stop and repair before continuing if any focused lower/upper breach regression test fails.
