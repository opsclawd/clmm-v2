# Design: Preview Freshness Revalidation, Durable Wallet History, and Partial Reconciliation

**Story:** [code-review-fixes-preview-freshness-history-partial-reconciliation](../stories/2026-04-06-code-review-fixes-preview-freshness-history-partial-reconciliation.md)
**Date:** 2026-04-06
**Status:** Draft

---

## Problem

Three adapter-path defects allow the system to make approval, history, and reconciliation decisions from stale or incomplete state.

1. **Preview freshness is not recomputed before signature approval.** `RequestWalletSignature` trusts the stored `preview.freshness.kind` and only separately checks hard expiry. A preview can therefore be approved during the stale window even though policy requires stale previews to be blocked before signing.

2. **Wallet history is filtered by currently supported positions.** `OffChainHistoryStorageAdapter.getWalletHistory()` derives the scope from `listSupportedPositions(walletId)`. If the user has no currently supported positions, the method returns `[]`, even when durable history exists for positions that were previously exited or closed.

3. **Partial reconciliation is collapsed into confirmed.** `SolanaExecutionSubmissionAdapter.reconcileExecution()` returns `confirmed` whenever at least one transaction reference confirms. Mixed outcomes on multi-reference submissions should be classified as `partial`, not full success.

4. **Prepared payload freshness checks are bypassable when `payloadVersion` is omitted.** `ExecutionController.submitExecution()` only validates the stored prepared payload when the request body includes `payloadVersion`. A caller can therefore omit the field and still submit against a stale or missing prepared payload without hitting the freshness/version guard.

These issues are independent, but they share one design mistake: the system reuses derived state at the wrong layer instead of recomputing or persisting the authoritative fact that the downstream decision actually needs.

---

## Goals

- Block signature approval when a preview is stale, not just when it is expired.
- Preserve wallet execution history after positions are closed or no longer supported.
- Classify reconciliation results accurately when only some references confirm.
- Enforce prepared payload freshness/version validation even when the caller omits `payloadVersion`.
- Keep the core directional exit invariant untouched.
- Minimize churn outside the affected workflows.

## Non-Goals

- Reworking the directional exit policy or swap direction mapping.
- Introducing a new general history analytics system.
- Changing the execution lifecycle state machine.
- Adding new user-facing flows beyond correct current behavior.

---

## Design Summary

The recommended design is:

1. Re-evaluate preview freshness at the approval boundary using the current clock and the preview’s `estimatedAt`.
2. Introduce a durable wallet-position ownership projection for history queries, so history lookup no longer depends on live supported positions.
3. Reconcile execution references by counting confirmed, pending, and failed references, then return `confirmed`, `partial`, `failed`, or `null` accordingly.
4. Treat the stored prepared payload as authoritative for submit-time freshness/version validation whenever it exists, rather than gating those checks on the presence of `body.payloadVersion`.

The storage adapters remain adapters: they persist and retrieve data, but the application layer owns time-sensitive policy decisions.

---

## 1. Preview Freshness Revalidation

### Decision

`RequestWalletSignature` will recompute freshness at approval time using:

```typescript
evaluatePreviewFreshness(preview.estimatedAt, clock.now())
```

The approval flow will reject any preview whose recomputed freshness is `stale` or `expired`, even if the stored preview record still says `fresh`.

`OperationalStorageAdapter.getPreview()` will continue to rehydrate the persisted preview snapshot as-is. It does not need to know about the live clock.

### Why this design

- The approval decision is the only place that must be current-time accurate.
- The application use case already has a clock port and already owns the signability check.
- Keeping recomputation out of the storage adapter avoids turning persistence into a policy layer.

### Alternatives considered

- **Recompute freshness in `OperationalStorageAdapter.getPreview()`**
  - Pros: every read returns a live freshness view.
  - Cons: the adapter would need a clock and policy awareness, and the approval boundary would still need to validate freshness again.
  - Rejected because it couples storage to business policy.

- **Keep stored freshness as the source of truth**
  - Pros: no code change.
  - Cons: wrong during the stale window.
  - Rejected because it allows unsafe approvals.

### Implementation shape

- `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
  - Recompute freshness after loading the preview.
  - Reject stale or expired previews before payload preparation.
- `packages/domain/src/execution/PreviewFreshnessPolicy.ts`
  - Remains the single freshness rule implementation.
- Tests should cover the stale window explicitly, not only hard expiry.

---

## 2. Durable Wallet History

### Decision

`getWalletHistory(walletId)` will no longer derive its scope from the currently supported positions returned by the live position read port.

Instead, the system will maintain a durable wallet-position ownership projection and query history through that projection. The projection is append-oriented:

- When a wallet-position pair is observed, it is recorded.
- When a position later disappears from the live supported set, the ownership record remains.
- History queries use the durable projection, not the live support set.

### Why this design

- The product expectation is durable history, not “history for positions that are still open.”
- The current `history_events` table is keyed by `positionId`, so history can remain position-centric while wallet ownership is stored separately.
- This avoids forcing a wallet identifier into every historical event writer, which would be invasive and brittle because some history events are emitted from workflows that do not naturally originate in a wallet-scoped controller.

### Data model

Add a durable projection table, conceptually:

| Column | Purpose |
|---|---|
| `wallet_id` | Owner wallet |
| `position_id` | Observed supported position |
| `first_seen_at` | First time the ownership was observed |
| `last_seen_at` | Most recent observation time |

Suggested constraints:

- Unique key on `(wallet_id, position_id)`
- `last_seen_at >= first_seen_at`

The exact schema can be tuned, but the important property is that ownership records are retained even when the position is no longer currently supported.

### Query shape

`OffChainHistoryStorageAdapter.getWalletHistory(walletId)` should:

1. Load known position IDs for the wallet from the durable ownership projection.
2. Query `history_events` by those position IDs.
3. Return the ordered event list.

If a wallet has no known historical positions, the method may still return `[]`, but that should only mean “no known history yet,” not “no currently open positions.”

### Alternatives considered

- **Continue filtering by `listSupportedPositions(walletId)`**
  - Pros: no schema changes.
  - Cons: hides closed-position history.
  - Rejected because it violates durable history expectations.

- **Store `walletId` directly on every history event**
  - Pros: simplest query path once populated.
  - Cons: more invasive because not every history writer naturally has wallet context.
  - Rejected for this pass because it over-couples event emission to wallet ownership and requires broader plumbing.

### Implementation shape

- `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
  - Replace live-position filtering with the durable ownership projection.
- `packages/adapters/src/outbound/storage/schema/history.ts`
  - No structural change required if the ownership projection is a separate table.
- Add a new storage table and write path for wallet-position ownership.
- Update the fake history repository and tests to reflect durable wallet history.

---

## 3. Partial Reconciliation Classification

### Decision

`SolanaExecutionSubmissionAdapter.reconcileExecution()` will classify all references before choosing a final lifecycle state:

- `confirmed` when all references are confirmed or finalized
- `partial` when at least one reference is confirmed and at least one other reference is unresolved or failed
- `failed` when every reference is definitively failed
- `null` when nothing is confirmed and the result is still unresolved

This preserves the recovery path for multi-reference submissions that are only partially complete.

### Why this design

- The domain model already has a `partial` lifecycle state and retry boundary rules for it.
- A single confirmed step is not equivalent to a fully completed execution.
- Returning `confirmed` too early can suppress the retry/recovery path that should remain available after incomplete execution.

### Classification rules

For each `TransactionReference`:

- If the signature status is `confirmed` or `finalized`, count it as confirmed.
- If the RPC reports an explicit error, count it as failed.
- If the status is missing, pending, or unknown, count it as unresolved.

Then aggregate:

| Summary | Final state |
|---|---|
| all confirmed | `{ kind: 'confirmed' }` |
| some confirmed, some unresolved or failed | `{ kind: 'partial' }` |
| none confirmed, some unresolved, no explicit failures | `null` |
| none confirmed, all failed | `{ kind: 'failed' }` |

`confirmedSteps` should contain only the steps whose references actually confirmed.

### Alternatives considered

- **Keep “any confirmed => confirmed”**
  - Pros: simplest.
  - Cons: wrong for mixed outcomes.
  - Rejected because it erases partial completion.

- **Return `failed` for any unresolved reference**
  - Pros: easy to implement.
  - Cons: too pessimistic; would confuse pending network propagation with real failure.
  - Rejected because it would destroy the pending path.

### Implementation shape

- `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`
  - Inspect every reference and compute an aggregate result.
- `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.ts`
  - Remains the consumer of the port result and persists `partial` when returned.
- Add regression coverage for mixed confirmed/unresolved and mixed confirmed/failed inputs.

---

## 4. Prepared Payload Freshness Enforcement

### Decision

`ExecutionController.submitExecution()` will always load and validate the stored prepared payload when one exists for the attempt.

The checks are not conditional on `body.payloadVersion` being present:

- If a prepared payload row exists, the request must match the stored `payloadVersion`.
- If the prepared payload is expired, reject with `410 Gone`.
- If the prepared payload is missing, reject the prepared-submit path rather than silently skipping freshness validation.

If the codebase retains any explicitly defined legacy submit path without prepared payloads, that path must be separate and must not bypass the prepared-payload checks. Omission of `payloadVersion` must never act as an implicit escape hatch.

### Why this design

- Freshness and versioning are security-sensitive submit-time guards, not optional client hints.
- Gating validation on the presence of a body field makes the guard bypassable.
- The submit endpoint should behave deterministically based on the stored prepared payload, not on whether the caller chose to include a field.

### Classification rules

For submit requests against a prepared payload:

- Missing `payloadVersion` with an existing prepared payload -> conflict.
- Mismatched `payloadVersion` -> conflict.
- Expired prepared payload -> gone.
- Matching `payloadVersion` on a fresh prepared payload -> proceed.

### Alternatives considered

- **Keep the `if (body.payloadVersion)` gate**
  - Pros: minimal code churn.
  - Cons: allows stale or missing prepared payloads through the submit path.
  - Rejected because it is the bug reported in review.

- **Treat missing `payloadVersion` as a legacy bypass**
  - Pros: preserves backwards compatibility.
  - Cons: makes the guard optional and hard to reason about.
  - Rejected unless a separate, explicitly documented legacy path is required.

### Implementation shape

- `packages/adapters/src/inbound/http/ExecutionController.ts`
  - Load the prepared payload row before submission and validate it unconditionally.
  - Separate any legacy submit path from the prepared-submit path.
- `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
  - Continue persisting prepared payloads as the source of truth for freshness/version validation.
- Add regression coverage for missing `payloadVersion`, mismatched `payloadVersion`, and expired prepared payloads.

---

## Testing Strategy

### Preview freshness

- Approval should fail when a preview is still under hard expiry but already stale.
- Approval should succeed when a preview is still fresh at current clock time.
- The stored preview snapshot should remain unchanged for read-back purposes.

### Wallet history

- History should still be returned when the wallet currently has no supported positions but has known historical positions.
- History should include events for positions that are no longer currently supported.
- Empty history should only mean “no recorded ownership/history,” not “no open positions.”

### Reconciliation

- All references confirmed => `confirmed`.
- One confirmed, one unresolved => `partial`.
- One confirmed, one failed => `partial`.
- None confirmed, none failed yet => `null`.
- None confirmed, all failed => `failed`.

### Submit freshness

- Missing `payloadVersion` with a stored prepared payload -> rejected.
- Matching `payloadVersion` with a fresh prepared payload -> accepted.
- Mismatched or expired prepared payload -> rejected before submission.

---

## Rollout Notes

- The freshness fix is low risk and should be implemented first.
- The prepared-payload freshness fix should follow immediately after, because it closes a submit bypass.
- The reconciliation fix is localized and can follow immediately after.
- The wallet-history fix likely needs a schema addition and backfill story, so it should be planned separately from the adapter code change.

---

## Acceptance Criteria

- Signature approval rejects stale previews, not just expired previews.
- Prepared payload submission rejects stale or missing payloads even when `payloadVersion` is omitted.
- Wallet history is still visible after a position is exited or no longer supported.
- Mixed multi-reference reconciliation returns `partial`, not `confirmed`.
- Existing directional exit behavior remains unchanged.
