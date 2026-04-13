# Design: Transaction Reference — Honest Step-Kind Projection

**Date:** 2026-04-13
**Status:** Draft

---

## Problem

In `SolanaExecutionSubmissionAdapter.submitExecution()` at lines 37-40:

```typescript
const reference: TransactionReference = {
  signature: signature.toString(),
  stepKind: 'swap-assets',
};
```

The adapter submits one transaction containing all prepared instructions — which can include `remove-liquidity`, `collect-fees`, and `swap-assets` — and returns a single `TransactionReference` hardcoded to `stepKind: 'swap-assets'`.

This is false bookkeeping. The history and reconciliation model records that only a swap happened, regardless of what the transaction actually contained. When `reconcileExecution()` processes the references, it can only confirm `swap-assets` as a completed step. If the transaction also removed liquidity and collected fees, those steps are invisible to reconciliation. The `confirmedSteps` array and the resulting `ExecutionLifecycleState` are based on incomplete data.

## Root Cause

`submitExecution()` receives only `signedPayload: Uint8Array`. It has no knowledge of which execution steps were bundled into that payload. The adapter cannot inspect the signed transaction to determine which instructions are inside — that would require decoding and instruction-matching, which is fragile and couples submission to preparation internals. So it hardcodes the step kind.

The information about which steps are in the plan exists at the call site. The application layer knows the `ExecutionPlan` and its steps. It just never passes that information to the submission port.

## Goals

- Make `submitExecution()` return one `TransactionReference` per planned step kind, all sharing the same transaction signature.
- Make `reconcileExecution()` deduplicate signature status lookups so the same signature is checked exactly once per reconciliation pass.
- Keep the `TransactionReference` domain type unchanged.
- Maintain backward compatibility with existing persisted `transactionRefsJson` data.

## Non-Goals

- Changing the `TransactionReference` domain type to `{ signature: string; stepKinds: ExecutionStep['kind'][] }`.
- Modeling per-instruction transaction topology.
- Changing the execution lifecycle state machine.
- Migrating existing persisted transaction reference data.

---

## Design

### Interface Change: `ExecutionSubmissionPort`

**Location:** `packages/application/src/ports/index.ts`

```typescript
// Before:
export interface ExecutionSubmissionPort {
  submitExecution(signedPayload: Uint8Array): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }>;
  reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<ExecutionPlan['steps'][number]['kind']>;
    finalState: ExecutionLifecycleState | null;
  }>;
}

// After:
export interface ExecutionSubmissionPort {
  submitExecution(
    signedPayload: Uint8Array,
    plannedStepKinds: ReadonlyArray<ExecutionStep['kind']>,
  ): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }>;
  reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<ExecutionPlan['steps'][number]['kind']>;
    finalState: ExecutionLifecycleState | null;
  }>;
}
```

`reconcileExecution` is unchanged. Only `submitExecution` gains the `plannedStepKinds` parameter.

### Adapter Change: `SolanaExecutionSubmissionAdapter.submitExecution()`

```typescript
async submitExecution(
  signedPayload: Uint8Array,
  plannedStepKinds: ReadonlyArray<ExecutionStep['kind']>,
): Promise<{
  references: TransactionReference[];
  submittedAt: ClockTimestamp;
}> {
  const rpc = this.getRpc();
  const base64 = uint8ArrayToBase64(signedPayload) as Base64EncodedWireTransaction;
  const signature = await rpc
    .sendTransaction(base64, { encoding: 'base64', skipPreflight: true })
    .send();

  const sig = signature.toString();
  const uniqueStepKinds = [...new Set(plannedStepKinds)];
  const references: TransactionReference[] = uniqueStepKinds.map(
    (stepKind) => ({ signature: sig, stepKind }),
  );

  return {
    references,
    submittedAt: makeClockTimestamp(Date.now()),
  };
}
```

For a standard 3-step plan (`remove-liquidity`, `collect-fees`, `swap-assets`), this returns 3 references all sharing the same signature. Each reference means "this signature covers evidence that this execution step was included in the submitted transaction."

### Adapter Change: `SolanaExecutionSubmissionAdapter.reconcileExecution()`

The current implementation iterates references and calls `rpc.getSignatureStatuses()` for each one individually. With multiple references sharing a signature, this would check the same signature multiple times. The fix deduplicates signature lookups.

**Before:** One `getSignatureStatuses` call per reference (N calls for N references).

**After:**

1. Collect unique signatures from all references: `[...new Set(references.map(r => r.signature))]`.
2. Fetch status for each unique signature once, build a `Map<string, 'confirmed' | 'failed' | 'pending'>`.
3. Iterate references, look up each reference's signature in the map, classify as confirmed/failed/pending.
4. `finalState` logic is unchanged from current implementation.

For 3 references sharing 1 signature, this produces 1 RPC call instead of 3.

### Call Site Updates

Every caller of `submitExecution()` in the application layer must pass `plannedStepKinds`.

**Retrieval path in `submitExecutionAttempt()`** (the primary call site in `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`):

The function receives `attemptId`, looks up the `StoredExecutionAttempt` via `executionRepo.getAttempt(attemptId)`. The attempt has `previewId?: string`. The step kinds are recovered via:

```
attempt.previewId → executionRepo.getPreview(previewId) → preview.plan.steps.map(s => s.kind)
```

This is the explicit retrieval path. If `previewId` is not present on the attempt (legacy/edge case), the function should fall back to the current behavior of returning a single `swap-assets` reference — this preserves backward compatibility for any attempt that was created before preview tracking was added.

The implementation must handle the case where `getPreview(previewId)` returns `null` (preview was cleaned up or never persisted) — fall back to single `swap-assets` reference in that case as well, with a logged warning.

### Uniqueness Invariant

**This design assumes at most one instance of each step kind per execution plan.** The current `ExecutionPlanFactory` produces plans with exactly one `remove-liquidity`, one `collect-fees`, and one `swap-assets` step. If a plan ever contained duplicate step kinds (e.g., two `swap-assets` steps), the fan-out would create multiple `TransactionReference` entries with the same `(signature, stepKind)` pair, which produces ambiguous bookkeeping — `reconcileExecution()` would count the same step kind as confirmed multiple times.

To enforce this:

1. `submitExecution()` must deduplicate `plannedStepKinds` before building references: `[...new Set(plannedStepKinds)]`.
2. This is a defensive guard, not a design-level accommodation for multi-step-same-kind plans. If the execution model ever needs multiple steps of the same kind, `TransactionReference` will need a richer identity (e.g., a step index), and that is a domain-type change (Option B territory).

The deduplication ensures that even if a caller accidentally passes duplicate step kinds, the bookkeeping remains unambiguous.

### Fake/Test Implementation Update

`FakeExecutionSubmissionPort` in `packages/testing/src/fakes/` must be updated to accept the new `plannedStepKinds` parameter. The fake should use it the same way — return one reference per step kind with a generated fake signature.

### Domain Type — No Change

`TransactionReference` stays as:

```typescript
export type TransactionReference = {
  readonly signature: string;
  readonly stepKind: ExecutionStep['kind'];
};
```

Under this design, a `TransactionReference` means "a signature-backed reference for a completed execution step." Multiple references sharing a signature is semantically correct because one atomic Solana transaction covers multiple execution steps. This is an honest projection of execution steps onto a single transaction boundary.

### Serialization Compatibility

`executionAttempts.transactionRefsJson` stores `TransactionReference[]` as JSON. The shape of each element is unchanged — still `{ signature, stepKind }`. The only difference is that new rows will have multiple elements where before there was one.

Existing persisted rows with a single `swap-assets` reference remain valid. They will reconcile the same way they do today — only `swap-assets` appears in `confirmedSteps`. This is the same inaccuracy they have today, not a regression. No data migration is needed.

---

## Error Handling

No change to error semantics. If `sendTransaction` fails, the error propagates as it does today. The only difference is in the success path — the return shape contains more references.

In `reconcileExecution()`, if a signature status check fails (network error), the signature is classified as `failed` (matching current behavior). Since all references sharing that signature resolve to the same status, all corresponding step kinds are consistently classified.

## Testing

- **`submitExecution()` with 3-step plan:** Pass `['remove-liquidity', 'collect-fees', 'swap-assets']` as `plannedStepKinds`. Verify 3 references returned, all with the same signature, each with a distinct `stepKind`.
- **`submitExecution()` with 1-step plan:** Pass `['swap-assets']`. Verify 1 reference returned. This is the backward-compatible degenerate case.
- **`reconcileExecution()` with shared-signature references:** Mock RPC to return confirmed status for the signature. Verify all 3 step kinds appear in `confirmedSteps`. Verify `finalState` is `{ kind: 'confirmed' }`.
- **`reconcileExecution()` signature dedup:** Pass 3 references sharing one signature. Verify `getSignatureStatuses` is called exactly once, not 3 times.
- **`reconcileExecution()` with failed signature:** Mock RPC to return error status. Verify `finalState` is `{ kind: 'failed' }`. Verify `confirmedSteps` is empty.
- **`reconcileExecution()` with mixed signatures (future-proofing):** Pass references with 2 different signatures (simulating a future multi-transaction scenario). Verify each signature is checked once and step kinds are independently classified.
- **`submitExecution()` deduplication:** Pass `['swap-assets', 'swap-assets', 'collect-fees']`, verify only 2 references returned (`swap-assets` and `collect-fees`), not 3.
- **Call site fallback:** When `attempt.previewId` is undefined or `getPreview()` returns null, verify `submitExecution` is called with `['swap-assets']` as the fallback.
- **Fake update:** Verify `FakeExecutionSubmissionPort` accepts `plannedStepKinds` and returns the correct number of references.

## Risk

Low-medium. The interface change to `ExecutionSubmissionPort` requires updating all call sites, but the port has a single real implementation and the callers are in the application layer. The `FakeExecutionSubmissionPort` also needs updating. The serialized JSON shape is unchanged, so no migration is needed. The risk is primarily in missing a call site during the update, which TypeScript will catch as a compile error.
