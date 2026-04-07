# User Story: Code Review Fixes for Preview Freshness, Durable History, and Partial Reconciliation

## Summary

As a user approving an execution, I want stale previews to be blocked at signature time, my execution history to remain visible after positions are closed, and mixed on-chain confirmation outcomes to be classified accurately, so the system does not mislead me about whether an exit is safe, durable, or complete.

---

## Background

Four review comments identified real product and correctness issues in the execution flow.

The common pattern is that the current implementation stores or derives state too early, then reuses that cached result later without re-checking the real source of truth.

---

## Defect 1 - Preview freshness is not recomputed before signature approval

`RequestWalletSignature` checks `preview.freshness.kind` from the stored preview record and only separately checks `expiresAt`. That means a preview can remain `fresh` in storage even after it has crossed the stale threshold, so approvals are still allowed during the 30-60 second stale window.

**Affected files:**
- `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
- `packages/domain/src/execution/PreviewFreshnessPolicy.ts`

**My view:**
- I agree with the bug.
- The approval decision should use current time, not just persisted freshness.
- This should be fixed in the application use case, not by making the storage adapter responsible for time-based policy.

**Recommendation:**
- Recompute freshness from `estimatedAt` and `clock.now()` immediately before signature approval.
- Reject previews that are `stale` or `expired` even if the stored record still says `fresh`.
- Keep persisted freshness for audit and display, but do not treat it as authoritative for approval.

**Tradeoff:**
- Slightly more logic at approval time, but the behavior becomes correct and easier to reason about.

---

## Defect 2 - Wallet history is filtered by current open positions

`OffChainHistoryStorageAdapter.getWalletHistory()` asks the position read port for currently supported positions, then filters history by those active positions. If the user has exited all positions, the method returns `[]`, which hides historical events that still should be visible.

**Affected files:**
- `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
- `packages/adapters/src/outbound/storage/schema/history.ts`
- `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`

**My view:**
- I agree with the concern and the product gap.
- This is not just a query bug; it is also a data-model gap.
- The history schema currently stores `positionId`, but not durable wallet ownership or a wallet-history projection.

**Recommendation:**
- Treat wallet history as durable operational history, not current-position history.
- Add a persisted wallet-to-position ownership source, or maintain a wallet-history projection that survives position closure.
- Keep the endpoint semantics honest: if the data source only knows about live positions, do not call it wallet history.

**Tradeoff:**
- Fixing this properly likely requires a schema or projection change, not only an adapter edit.
- That is more work, but it is the correct way to preserve historical visibility.

---

## Defect 3 - Reconciliation marks partial outcomes as confirmed

`SolanaExecutionSubmissionAdapter.reconcileExecution()` currently returns `confirmed` whenever at least one transaction reference reports a confirmed status. For multi-reference submissions, that collapses mixed outcomes into full success and hides the partial-completion path.

**Affected files:**
- `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`
- `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
- `packages/domain/src/execution/RetryBoundaryPolicy.ts`

**My view:**
- I agree with the bug.
- The adapter is too optimistic.
- The application layer and domain already have `partial` state and retry rules, so the adapter should preserve that distinction instead of flattening it.

**Recommendation:**
- Return `confirmed` only when all referenced steps are confirmed.
- Return `partial` when some references confirm and others do not.
- Treat the no-confirmation case as `pending` or `failed` based on whether there is a hard failure signal.
- Add regression coverage for mixed outcomes.

**Tradeoff:**
- Requires a little more status handling, but it prevents the system from suppressing recovery logic after an incomplete execution.

---

## Defect 4 - Prepared payload freshness checks can be bypassed when `payloadVersion` is omitted

`ExecutionController.submitExecution()` only validates the stored prepared payload when `body.payloadVersion` is present. That means callers can omit `payloadVersion` and still submit against a stale or missing prepared payload, which bypasses the freshness/version guard entirely.

**Affected files:**
- `packages/adapters/src/inbound/http/ExecutionController.ts`
- `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`

**My view:**
- I agree with the bug.
- The prepared payload path should enforce freshness/version checks regardless of whether the request body includes `payloadVersion`.
- If a prepared payload exists for the attempt, omitting `payloadVersion` should not allow the caller to fall back to an unguarded submit path.

**Recommendation:**
- Treat the prepared payload row as authoritative whenever it exists.
- Require the request to match the stored prepared payload version before submission proceeds.
- Reject stale or missing prepared payloads explicitly instead of letting them slip through a legacy path by accident.

**Tradeoff:**
- This makes the submit contract stricter, but it removes a bypass that can otherwise send outdated signed payloads through the system.

---

## Overall Recommendation

1. Fix preview freshness recomputation first, because it blocks unsafe approvals.
2. Fix prepared payload freshness enforcement next, because it blocks stale or missing payload submission.
3. Fix partial reconciliation next, because it directly affects recovery and retry behavior.
4. Design the wallet-history persistence change deliberately, because it crosses the storage model and cannot be solved reliably with the current live-position filter alone.

These changes are aligned with the product invariant: never sign based on stale state, never hide durable history, and never misclassify a partial exit as complete.
