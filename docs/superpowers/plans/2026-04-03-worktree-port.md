# Donor Port Plan: mvp-out-of-range-flow -> superpowers-v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harvest the useful preview, signing, and wallet-history improvements from the `mvp-out-of-range-flow` worktree into `superpowers-v2` without regressing the April 2, 2026 v2 architecture.

**Architecture:** `superpowers-v2` remains the only target branch. Treat `mvp-out-of-range-flow` as a donor worktree, not a branch to finish and not a commit stream to cherry-pick wholesale. Re-implement or selectively copy only the user-facing and API-surface improvements that fit the current pg-boss, AdaptersModule, and prepared-payload design already present on `superpowers-v2`.

**Tech Stack:** TypeScript strict mode, NestJS, Expo Router, React Native, TanStack Query v5, Zustand v4, Drizzle, pg-boss.

---

## Decision Summary

- `superpowers-v2` is the correct base because it already matches the v2 design for worker composition and queueing.
- `mvp-out-of-range-flow` still contains useful donor changes in three areas:
  - preview creation and route/navigation correctness
  - wallet-scoped execution history
  - signing workflow UX, including decline, interruption, and native signing
- Do not finish `mvp-out-of-range-flow`.
- Do not cherry-pick the donor branch wholesale.
- Port file-by-file, test-by-test, and preserve the v2 architecture.

## Non-Negotiable Rules

- Preserve the directional invariant in `DirectionalExitPolicyService`. No port may re-derive direction anywhere else.
- Keep `superpowers-v2` worker infrastructure intact.
- Keep `superpowers-v2` as the target for all edits and verification.
- Prefer manual reimplementation over commit cherry-picks because the donor worktree contains both committed divergence and local uncommitted changes.
- Treat the donor worktree's local diff as valid source material, but not as authoritative architecture.

## Port Strategy

### Port Now

These files contain behavior worth porting directly or re-implementing immediately on `superpowers-v2`.

| Donor file | Target file | Why it should be ported |
|---|---|---|
| `packages/adapters/src/inbound/http/PreviewController.ts` | `packages/adapters/src/inbound/http/PreviewController.ts` | Adds explicit `POST /previews/:triggerId` preview creation so the app does not fake initial preview creation by calling refresh. |
| `packages/adapters/src/inbound/http/PreviewController.test.ts` | `packages/adapters/src/inbound/http/PreviewController.test.ts` | Adds controller coverage for create-preview behavior. |
| `packages/adapters/src/inbound/http/ExecutionController.ts` | `packages/adapters/src/inbound/http/ExecutionController.ts` | Adds wallet history, signing payload, decline, and interruption surfaces. Port selectively, preserving the current v2 execution flow where appropriate. |
| `packages/adapters/src/inbound/http/ExecutionController.test.ts` | `packages/adapters/src/inbound/http/ExecutionController.test.ts` | Provides regression coverage for the signing/history endpoints. |
| `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts` | `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts` | Adds the missing wallet-scoped history query. |
| `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts` | `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts` | Covers wallet-scoped history behavior. |
| `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts` | `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts` | Useful if the current v2 flow exposes signing payload retrieval explicitly. |
| `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts` | `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts` | Covers payload availability, invalid state, and expiry behavior. |
| `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts` | `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts` | Adds explicit interruption handling required by the v2 degraded-state design. |
| `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts` | `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts` | Covers interruption transitions. |
| `packages/application/src/dto/index.ts` | `packages/application/src/dto/index.ts` | Required if new signing-payload or wallet-history DTOs are added. |
| `packages/application/src/index.ts` | `packages/application/src/index.ts` | Exports the new use cases and DTOs. |
| `packages/application/src/public/index.ts` | `packages/application/src/public/index.ts` | Makes any new DTOs available to UI code through the public surface. |
| `apps/app/src/api/previews.ts` | `apps/app/src/api/previews.ts` | Adds explicit create-preview client behavior and stronger response validation. |
| `apps/app/src/api/previews.test.ts` | `apps/app/src/api/previews.test.ts` | Covers preview create/fetch/refresh client behavior. |
| `apps/app/app/preview/[triggerId].tsx` | `apps/app/app/preview/[triggerId].tsx` | Uses create-preview explicitly instead of abusing refresh on initial load. |
| `apps/app/src/api/executions.ts` | `apps/app/src/api/executions.ts` | Adds signing payload fetch, decline/interruption calls, wallet history fetch, and better DTO validation. Port selectively to fit the final backend contract. |
| `apps/app/src/api/executions.test.ts` | `apps/app/src/api/executions.test.ts` | Provides contract coverage for the new execution API client behavior. |
| `apps/app/app/signing/[attemptId].tsx` | `apps/app/app/signing/[attemptId].tsx` | Improves signing UX and handles decline/interruption paths explicitly. |
| `packages/ui/src/screens/SigningStatusScreen.tsx` | `packages/ui/src/screens/SigningStatusScreen.tsx` | Adds status notice, decline action, and explicit "view result" action. |
| `packages/ui/src/screens/SigningStatusScreen.test.tsx` | `packages/ui/src/screens/SigningStatusScreen.test.tsx` | Covers the enhanced signing UI states. |
| `apps/app/src/platform/nativeWallet.ts` | `apps/app/src/platform/nativeWallet.ts` | Adds native signing support instead of connect-only behavior. |
| `apps/app/src/platform/nativeWallet.test.ts` | `apps/app/src/platform/nativeWallet.test.ts` | Covers native signing behavior. |
| `apps/app/app/(tabs)/alerts.tsx` | `apps/app/app/(tabs)/alerts.tsx` | Preserves `triggerId` in alert navigation instead of dropping it. |
| `apps/app/app/(tabs)/history.tsx` | `apps/app/app/(tabs)/history.tsx` | Switches history list to the correct wallet-scoped surface. |
| `apps/app/src/signingRoute.test.ts` | `apps/app/src/signingRoute.test.ts` | Optional but useful route-level coverage for the new signing behavior. |

### Evaluate Before Porting

These donor files may contain useful ideas, but they should not be copied blindly. Reconcile them against the current `superpowers-v2` design first.

| Donor file | Current target | Decision rule |
|---|---|---|
| `apps/app/src/platform/browserWallet.ts` | `apps/app/src/platform/browserWallet.ts` | Do not port mechanically. The donor simplifies signing to raw payload bytes, while current `superpowers-v2` deserializes and signs a versioned transaction. Keep the current implementation unless the explicit signing-payload surface requires a different browser contract. |
| `packages/application/src/use-cases/execution/RequestWalletSignature.ts` | `packages/application/src/use-cases/execution/RequestWalletSignature.ts` | Reconcile carefully. The donor flow front-loads more of the signing payload lifecycle. Keep the current v2 behavior unless the target API contract changes. |
| `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts` | `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts` | Reconcile carefully. The donor submit flow expects a different payload lifecycle than the current prepare-and-submit path. |
| `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts` | `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts` | Port only if needed for signing-expiry or state-recording fixes proven by tests. |
| `packages/testing/src/scenarios/BreachToExitScenario.ts` | `packages/testing/src/scenarios/BreachToExitScenario.ts` | Use as inspiration for scenario coverage after the API and UI surfaces are stable. |
| `packages/testing/src/scenarios/BreachToExitScenario.test.ts` | `packages/testing/src/scenarios/BreachToExitScenario.test.ts` | Port assertions, not whole scenario structure, if the current scenario harness differs. |
| `packages/testing/src/scenarios/InterruptedSessionResume.test.ts` | `packages/testing/src/scenarios/InterruptedSessionResume.test.ts` | Good reference once interruption support exists on the target branch. |
| `packages/testing/src/scenarios/PartialCompletionResume.test.ts` | `packages/testing/src/scenarios/PartialCompletionResume.test.ts` | Good reference for regressions after signing-flow changes. |

### Ignore Completely

These donor files represent the superseded architecture or unrelated branch-specific churn. Do not port them.

| Donor file(s) to ignore | Reason |
|---|---|
| `packages/adapters/src/inbound/jobs/WorkerModule.ts` | Uses old direct wiring and in-memory queue composition. Conflicts with pg-boss and `AdaptersModule` in `superpowers-v2`. |
| `packages/adapters/src/inbound/jobs/main.ts` | Uses an HTTP-style worker bootstrap instead of application-context worker lifecycle. |
| `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` | `superpowers-v2` already has the correct v2 job pipeline. |
| `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts` | Same reason as above. |
| `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` | Same reason as above. |
| `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts` | Same reason as above. |
| `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts` | Same reason as above. |
| `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts` | Same reason as above. |
| `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts` | Same reason as above. |
| `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts` | Same reason as above. |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | The donor branch mixes older execution payload assumptions into storage. Keep the current target storage model unless a specific missing repository method is required. |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.test.ts` | Same reason as above. |
| `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts` | Only revisit if wallet history cannot be implemented using the current target adapter cleanly. |
| `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.wallet.test.ts` | Same reason as above. |
| `packages/adapters/src/outbound/storage/schema/executions.ts` | Avoid donor schema drift unless a deliberate target schema change is approved. |
| `packages/adapters/drizzle/0002_attempt_signing_payload.sql` | Do not adopt donor migration shape without an explicit schema decision. |
| `packages/adapters/drizzle/meta/*` | Donor migration metadata is branch-local and not trustworthy for target migration history. |
| `packages/adapters/src/inbound/http/AppModule.ts` | Keep current `superpowers-v2` module wiring. Only edit if new controller providers or tokens are truly required. |
| `packages/adapters/src/inbound/jobs/WorkerModule.ts` local uncommitted diff | Same reason as above. |
| `packages/application/src/use-cases/execution/ApproveExecution.ts` donor deletion/change | Keep the current target approval model unless replaced intentionally by a reviewed design decision. |
| `packages/application/src/use-cases/execution/ApproveExecution.test.ts` donor deletion/change | Same reason as above. |
| `docs/superpowers/specs/*` donor edits | Historical reference only. Do not port spec text into implementation work. |
| `docs/superpowers/plans/*` donor edits | Historical reference only. |

## Recommended Implementation Order

### Task 1: Fix Preview Creation Contract First

**Files:**
- Modify: `packages/adapters/src/inbound/http/PreviewController.ts`
- Create or modify: `packages/adapters/src/inbound/http/PreviewController.test.ts`
- Modify: `apps/app/src/api/previews.ts`
- Create or modify: `apps/app/src/api/previews.test.ts`
- Modify: `apps/app/app/preview/[triggerId].tsx`

- [ ] Add an explicit create-preview surface to the target preview controller using donor behavior as reference.
- [ ] Keep the existing refresh endpoint intact.
- [ ] Update the app preview client to call `POST /previews/:triggerId` for initial load.
- [ ] Update the preview route so initial entry creates a preview and refresh remains a distinct action.
- [ ] Run the preview controller and preview API tests.

**Why first:** It removes the current target branch's biggest flow mismatch and gives the rest of the signing flow a stable entry point.

### Task 2: Preserve Trigger Context Through Navigation

**Files:**
- Modify: `apps/app/app/(tabs)/alerts.tsx`
- Modify: `apps/app/app/position/[id].tsx`
- Modify if needed: `packages/ui/src/screens/AlertsListScreen.tsx`
- Modify if needed: `packages/ui/src/screens/PositionDetailScreen.tsx`
- Create or modify tests if needed:
  - `packages/ui/src/screens/AlertsListScreen.test.tsx`
  - `packages/ui/src/screens/PositionDetailScreen.test.tsx`

- [ ] Port the donor alert-route behavior that preserves `triggerId` during navigation.
- [ ] Verify the position detail route still opens preview from backend trigger state, not local inference.
- [ ] Add or update regression tests for alert selection and preview navigation.

**Why second:** It ensures preview entry stays tied to backend trigger IDs before more signing behavior is layered on top.

### Task 3: Add Wallet-Scoped History Surface

**Files:**
- Create: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.ts`
- Create: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Modify if DTO changes are required: `packages/application/src/dto/index.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.test.ts`
- Modify: `apps/app/src/api/executions.ts`
- Modify: `apps/app/src/api/executions.test.ts`
- Modify: `apps/app/app/(tabs)/history.tsx`
- Remove or stop using: `apps/app/src/api/history.ts`

- [ ] Add the wallet-scoped history use case to the application layer.
- [ ] Add `GET /executions/history/wallet/:walletId` to the target execution controller.
- [ ] Update the app history client to call the wallet endpoint instead of treating `walletId` as `positionId`.
- [ ] Switch the history tab to the wallet-scoped client.
- [ ] Run history-related controller, application, and app-client tests.

**Why third:** The current target history tab is wired to the wrong backend surface. This is a correctness bug, not just a UX gap.

### Task 4: Add Explicit Decline and Interruption Recording

**Files:**
- Create: `packages/application/src/use-cases/execution/RecordSignatureInterruption.ts`
- Create: `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/application/src/public/index.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify: `packages/adapters/src/inbound/http/ExecutionController.test.ts`
- Modify: `apps/app/src/api/executions.ts`
- Modify: `apps/app/src/api/executions.test.ts`

- [ ] Add the missing application use case for signature interruption.
- [ ] Add `POST /executions/:attemptId/decline-signature` and `POST /executions/:attemptId/interrupt-signature` to the target controller.
- [ ] Add app API client functions for both endpoints.
- [ ] Verify controller responses preserve authoritative attempt direction and reject invalid state transitions.
- [ ] Run application, controller, and client tests for both paths.

**Why fourth:** The v2 design explicitly calls out decline and interruption as honest degraded states. This behavior should exist before the UI is rewired to depend on it.

### Task 5: Decide Whether to Expose Signing Payload Explicitly

**Files:**
- Create if adopted: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.ts`
- Create if adopted: `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts`
- Modify if adopted: `packages/application/src/index.ts`
- Modify if adopted: `packages/application/src/public/index.ts`
- Modify if adopted: `packages/application/src/dto/index.ts`
- Modify if adopted: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Modify if adopted: `packages/adapters/src/inbound/http/ExecutionController.test.ts`
- Modify if adopted: `apps/app/src/api/executions.ts`
- Modify if adopted: `apps/app/src/api/executions.test.ts`

- [ ] Review the current target prepare-and-submit flow before porting donor signing-payload retrieval.
- [ ] If explicit payload retrieval simplifies native/browser parity and matches the target data model, add `GET /executions/:attemptId/signing-payload`.
- [ ] If the current `prepare` endpoint is sufficient, document that decision in code comments and skip the donor endpoint.
- [ ] Do not replace the current prepared-payload storage model just to match the donor branch.

**Why fifth:** This is the only donor change that touches the target execution payload lifecycle. It needs an explicit decision rather than automatic adoption.

### Task 6: Rewire the Signing Route and UI

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`
- Modify: `packages/ui/src/screens/SigningStatusScreen.tsx`
- Modify: `packages/ui/src/screens/SigningStatusScreen.test.tsx`
- Create or modify: `apps/app/src/signingRoute.test.ts`

- [ ] Port the donor route behavior for status notices, decline action, and interruption handling.
- [ ] Keep the final route logic aligned with the backend contract chosen in Task 5.
- [ ] Preserve the current target branch's lifecycle refresh and result navigation behavior where it is already correct.
- [ ] Add regression coverage for:
  - awaiting-signature with sign action
  - explicit decline
  - interruption notice
  - submitted state with result navigation

**Why sixth:** Once the backend behavior exists, the signing screen can become honest about the user's actual choices and wallet handoff outcomes.

### Task 7: Add Native Signing Support

**Files:**
- Modify: `apps/app/src/platform/nativeWallet.ts`
- Create or modify: `apps/app/src/platform/nativeWallet.test.ts`
- Modify: `apps/app/app/signing/[attemptId].tsx`
- Modify if needed: `apps/app/src/state/walletSessionStore.ts`
- Modify if needed: `apps/app/src/platform/walletConnection.ts`

- [ ] Port the donor's `signNativeTransaction` capability into the target native wallet helper.
- [ ] Update the signing route to choose browser or native signing based on the current connection kind.
- [ ] Keep the current branch's browser signing path unless Task 5 explicitly changes the browser payload contract.
- [ ] Verify native-signing cancellation and interruption map into the new decline/interruption API surfaces.

**Why seventh:** Native signing is valuable, but it should land after the backend and route states are already stable.

### Task 8: Harden Client DTO Validation

**Files:**
- Modify: `apps/app/src/api/executions.ts`
- Modify: `apps/app/src/api/executions.test.ts`
- Modify if needed: `apps/app/src/api/previews.ts`
- Modify if needed: `apps/app/src/api/previews.test.ts`
- Modify if needed: `apps/app/src/api/http.ts`
- Modify if needed: `apps/app/src/api/http.test.ts`

- [ ] Port the donor's stricter DTO guards for execution responses where they improve correctness.
- [ ] Keep error messages and parsing behavior consistent with the target branch's existing API-client style.
- [ ] Avoid broad refactors outside the execution, preview, and history surfaces.

**Why eighth:** Validation hardening is useful, but it should follow backend contract decisions rather than lead them.

### Task 9: Final Verification and Cleanup

**Files:**
- Verify all files modified in Tasks 1-8
- Remove any dead code left behind, including `apps/app/src/api/history.ts` if fully replaced

- [ ] Run focused tests for:
  - `packages/adapters/src/inbound/http/PreviewController.test.ts`
  - `packages/adapters/src/inbound/http/ExecutionController.test.ts`
  - `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`
  - `packages/application/src/use-cases/execution/RecordSignatureInterruption.test.ts`
  - `packages/application/src/use-cases/execution/GetAwaitingSignaturePayload.test.ts` if Task 5 adopted it
  - `apps/app/src/api/previews.test.ts`
  - `apps/app/src/api/executions.test.ts`
  - `packages/ui/src/screens/SigningStatusScreen.test.tsx`
- [ ] Run broader repo verification:
  - `pnpm test:application`
  - `pnpm test:adapters`
  - `pnpm typecheck`
- [ ] Manually verify the route sequence:
  - alert -> position detail -> preview -> approve -> signing -> submit/result
  - history tab shows wallet-scoped data
  - decline and interruption leave the attempt in an honest state

## Explicit Do-Not-Do List

- Do not revive the donor worker architecture.
- Do not replace pg-boss wiring.
- Do not port donor Drizzle migrations.
- Do not adopt donor storage changes unless a specific missing repository method is proven necessary.
- Do not delete or replace the current target approval flow without an explicit reviewed decision.
- Do not use branch-level cherry-picks as the primary migration technique.

## Recommended Commit Order

1. `feat: add explicit preview creation surface`
2. `fix: preserve trigger context through alert and preview navigation`
3. `feat: add wallet-scoped execution history`
4. `feat: record signature interruption and decline via execution API`
5. `feat: expose awaiting-signature payload` if Task 5 is adopted
6. `feat: wire signing route for decline interruption and result states`
7. `feat: add native wallet transaction signing`
8. `test: harden execution and preview API client validation`

## Success Criteria

The donor port is complete when all of the following are true on `superpowers-v2`:

- preview entry uses explicit create-preview semantics
- alert navigation does not drop trigger context
- history tab is wallet-scoped rather than accidentally position-scoped
- signing screen can show and record decline and interruption honestly
- native signing is supported
- any new signing-payload surface fits the current target execution data model
- no worker, queue, or storage regressions were introduced from donor architecture

