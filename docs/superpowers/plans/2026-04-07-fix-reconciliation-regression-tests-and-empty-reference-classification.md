# Reconciliation Regression Coverage and Empty-Reference Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a direct adapter regression test for Solana execution reconciliation and fix the remaining empty-reference classification bug so pending, failed, partial, and confirmed outcomes are classified correctly.

**Architecture:** Keep the fix localized to the Solana submission adapter and its adapter-level tests. The adapter should own the aggregate classification rules, while the tests should model the RPC response shape one signature at a time so they exercise the production path instead of a fake aggregate shortcut. The application-level reconciliation tests remain valuable, but this plan adds the missing direct coverage where the behavior actually lives.

**Tech Stack:** TypeScript, Vitest, @solana/kit, pnpm workspaces

---

### Task 1: Add Direct Adapter Regression Coverage

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts`

- [ ] **Step 1: Add a failing regression test for the zero-confirmed, explicit-failure-plus-unresolved case**

First, replace the current `mockSend`-based RPC helper with a per-signature status map so each `getSignatureStatuses()` call returns the status for the signature it was asked about:

```typescript
type RpcStatus =
  | { confirmationStatus?: 'processed' | 'confirmed' | 'finalized'; err?: unknown }
  | null;

function makeMockRpc(statusBySignature: Record<string, RpcStatus>) {
  return {
    getSignatureStatuses: ([signature]: [unknown]) => ({
      send: vi.fn().mockResolvedValue({
        value: [statusBySignature[String(signature)] ?? null],
      }),
    }),
    sendTransaction: () => ({ send: vi.fn() }),
  };
}
```

Then update each existing test case to pass the signatures it cares about into `makeMockRpc(...)` instead of preloading a single shared `mockSend`.

Add this test inside the existing `describe('reconcileExecution classification', () => { ... })` block:

```typescript
it('returns failed when some references fail and others are unresolved with zero confirmed', async () => {
  const adapter = makeAdapter(makeMockRpc({
    'sig-fail-1': { err: { err: 'Transaction failed' } },
    'sig-pending-1': null,
    'sig-pending-2': null,
  }));

  const result = await adapter.reconcileExecution([
    makeRef('sig-fail-1', 'remove-liquidity'),
    makeRef('sig-pending-1', 'collect-fees'),
    makeRef('sig-pending-2', 'swap-assets'),
  ]);

  expect(result.finalState).toEqual({ kind: 'failed' });
  expect(result.confirmedSteps).toEqual([]);
});
```

- [ ] **Step 2: Run the adapter test to verify the new case fails against current behavior**

Run: `pnpm --filter @clmm/adapters test -- --run SolanaExecutionSubmissionAdapter`

Expected: FAIL. The current adapter still needs the empty-reference and zero-confirmed classification fixes, so at least one of the classification assertions should fail before the code change.

- [ ] **Step 3: Update the remaining classification tests to use the per-signature helper**

Rewrite each existing case in the file so it instantiates the adapter with a signature map that matches the test name:

```typescript
const adapter = makeAdapter(makeMockRpc({
  'sig1': { confirmationStatus: 'confirmed' },
  'sig2': null,
  'sig3': { confirmationStatus: 'confirmed' },
}));
```

For the explicit-failure cases, use:

```typescript
const adapter = makeAdapter(makeMockRpc({
  'sig-fail-1': { err: { err: 'Transaction failed' } },
  'sig-fail-2': { err: { err: 'Another failure' } },
}));
```

This keeps each test self-contained and ensures `reconcileExecution()` sees the same single-signature response shape it will get in production.

- [ ] **Step 4: Run the adapter test suite and confirm the new regression passes**

Run: `pnpm --filter @clmm/adapters test -- --run SolanaExecutionSubmissionAdapter`

Expected: PASS, including the new failed-plus-unresolved regression and the existing confirmed/partial/pending cases.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts
git commit -m "test: add direct reconciliation regression coverage for failed unresolved mixes"
```

### Task 2: Fix Empty-Reference Classification

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts:48-85`
- Test: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts`

- [ ] **Step 1: Add a failing direct test for the empty-reference case**

Add this test in the same `describe('reconcileExecution classification', () => { ... })` block:

```typescript
it('returns null when the references array is empty', async () => {
  const adapter = makeAdapter(makeMockRpc());

  const result = await adapter.reconcileExecution([]);

  expect(result.finalState).toBeNull();
  expect(result.confirmedSteps).toEqual([]);
});
```

- [ ] **Step 2: Run the adapter test to verify the empty-reference case fails**

Run: `pnpm --filter @clmm/adapters test -- --run SolanaExecutionSubmissionAdapter`

Expected: FAIL. The current implementation returns `{ kind: 'confirmed' }` when `references.length === 0` because `confirmedSteps.length === references.length`.

- [ ] **Step 3: Update the classification logic to handle empty references and separate pending from failed**

Replace the final-state selection block in `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts` with:

```typescript
    const unresolvedCount = references.length - confirmedSteps.length - failedCount;

    let finalState: ExecutionLifecycleState | null;
    if (references.length === 0) {
      finalState = null;
    } else if (confirmedSteps.length === references.length) {
      finalState = { kind: 'confirmed' };
    } else if (confirmedSteps.length > 0) {
      finalState = { kind: 'partial' };
    } else if (failedCount > 0) {
      finalState = { kind: 'failed' };
    } else if (unresolvedCount > 0) {
      finalState = null;
    } else {
      finalState = { kind: 'failed' };
    }
```

This keeps the intended precedence explicit:
- empty references -> pending/null
- all confirmed -> confirmed
- mixed confirmed with anything else -> partial
- zero confirmed with at least one hard failure -> failed
- zero confirmed with only unresolved statuses -> null

- [ ] **Step 4: Run the adapter test suite and confirm all classification cases pass**

Run: `pnpm --filter @clmm/adapters test -- --run SolanaExecutionSubmissionAdapter`

Expected: PASS.

- [ ] **Step 5: Run the focused application reconciliation tests to confirm the downstream consumer still behaves correctly**

Run: `pnpm --filter @clmm/application test -- --run ReconcileExecutionAttempt`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts
git commit -m "fix: handle empty reference reconciliation and add direct adapter regressions"
```

### Task 3: Final Verification

**Files:**
- None

- [ ] **Step 1: Run the relevant package checks**

Run:

```bash
pnpm --filter @clmm/adapters test -- --run SolanaExecutionSubmissionAdapter OffChainHistoryStorageAdapter
pnpm --filter @clmm/application test -- --run ReconcileExecutionAttempt
pnpm build
```

Expected:
- `@clmm/adapters` adapter tests pass, including the new regression coverage
- `@clmm/application` reconciliation tests pass
- `pnpm build` passes

- [ ] **Step 2: Commit if any verification-only adjustments were needed**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts
git commit -m "test: verify reconciliation classification coverage and empty-reference handling"
```

## Implementation Order

| Order | Task | What |
|-------|------|------|
| 1 | Adapter regression coverage | Add a direct test that exercises the real adapter call shape |
| 2 | Empty-reference classification | Fix the remaining classification bug and keep pending distinct from failed |
| 3 | Final verification | Run adapter, application, and workspace checks |
