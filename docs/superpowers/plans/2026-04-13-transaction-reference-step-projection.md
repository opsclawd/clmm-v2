# Transaction Reference Step Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `submitExecution()` to return one `TransactionReference` per planned step kind (all sharing the same signature), fix `reconcileExecution()` to deduplicate signature status lookups, and update the call site to pass `plannedStepKinds` recovered from the persisted preview.

**Architecture:** Change `ExecutionSubmissionPort.submitExecution()` to accept `plannedStepKinds`, update the real adapter and fake, refactor `reconcileExecution()` to build a signature status map before iterating references, update `submitExecutionAttempt()` to look up step kinds from the preview.

**Tech Stack:** TypeScript, Vitest, @solana/kit

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/application/src/ports/index.ts` | Modify (line 68) | Add `plannedStepKinds` to `ExecutionSubmissionPort.submitExecution()` |
| `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts` | Modify | Update `submitExecution()` and `reconcileExecution()` |
| `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts` | Modify | Add tests for step projection and signature dedup |
| `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts` | Modify | Accept `plannedStepKinds`, return per-step references |
| `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts` | Modify | Recover step kinds from preview, pass to `submitExecution()` |
| `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts` | Modify | Test preview-based step kind recovery and fallback |

---

## Task 1: Update the Port Interface

**Files:**
- Modify: `packages/application/src/ports/index.ts` (line 68)

- [ ] **Step 1: Add `plannedStepKinds` parameter to `ExecutionSubmissionPort`**

In `packages/application/src/ports/index.ts`, change `submitExecution` in the `ExecutionSubmissionPort` interface. The current definition (around line 67-71):

```typescript
export interface ExecutionSubmissionPort {
  submitExecution(signedPayload: Uint8Array): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }>;
```

Change to:

```typescript
export interface ExecutionSubmissionPort {
  submitExecution(
    signedPayload: Uint8Array,
    plannedStepKinds: ReadonlyArray<ExecutionStep['kind']>,
  ): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }>;
```

Ensure `ExecutionStep` is imported at the top of the file. Check for an existing import from `@clmm/domain` — it should already import `ExecutionStep` or the types it's built from. If `ExecutionStep` is not imported, add it to the existing domain import:

```typescript
import type { ..., ExecutionStep } from '@clmm/domain';
```

- [ ] **Step 2: Verify typecheck fails at expected call sites**

Run: `cd packages/application && npx tsc -p tsconfig.typecheck.json --noEmit 2>&1 | head -20`

Expected: Type errors in `SubmitExecutionAttempt.ts` (missing second argument to `submitExecution`) and in `FakeExecutionSubmissionPort.ts` (signature doesn't match interface). This confirms the interface change is being enforced.

- [ ] **Step 3: Commit the interface change**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat(application): add plannedStepKinds parameter to ExecutionSubmissionPort

submitExecution now requires the caller to declare which step kinds
are covered by the submitted transaction. This enables honest per-step
reference tracking instead of hardcoding swap-assets."
```

---

## Task 2: Update the Fake

**Files:**
- Modify: `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts`

- [ ] **Step 4: Update `FakeExecutionSubmissionPort.submitExecution()`**

In `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts`, change the `submitExecution` method (lines 22-29):

```typescript
// Before:
async submitExecution(
  _payload: Uint8Array,
): Promise<{ references: TransactionReference[]; submittedAt: ClockTimestamp }> {
  return {
    references: [{ signature: 'fake-sig-1', stepKind: 'remove-liquidity' }],
    submittedAt: makeClockTimestamp(Date.now()),
  };
}

// After:
async submitExecution(
  _payload: Uint8Array,
  plannedStepKinds: ReadonlyArray<ExecutionStep['kind']> = ['swap-assets'],
): Promise<{ references: TransactionReference[]; submittedAt: ClockTimestamp }> {
  const uniqueStepKinds = [...new Set(plannedStepKinds)];
  return {
    references: uniqueStepKinds.map((stepKind) => ({
      signature: 'fake-sig-1',
      stepKind,
    })),
    submittedAt: makeClockTimestamp(Date.now()),
  };
}
```

Note: `ExecutionStep` is already imported on line 2 of this file.

- [ ] **Step 5: Verify the fake compiles**

Run: `cd packages/testing && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors in the testing package. The fake now satisfies the updated interface.

- [ ] **Step 6: Commit**

```bash
git add packages/testing/src/fakes/FakeExecutionSubmissionPort.ts
git commit -m "feat(testing): update FakeExecutionSubmissionPort for plannedStepKinds

Fake now accepts plannedStepKinds, deduplicates, and returns one
reference per unique step kind with a shared fake signature."
```

---

## Task 3: Update the Real Adapter — `submitExecution()`

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts` (lines 27-46)
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts`

- [ ] **Step 7: Write tests for step projection in `submitExecution()`**

Add these tests to the existing `describe('SolanaExecutionSubmissionAdapter', ...)` block in `SolanaExecutionSubmissionAdapter.test.ts`:

```typescript
describe('submitExecution step projection', () => {
  it('returns one reference per planned step kind, all sharing the same signature', async () => {
    const mockRpc = makeMockRpc({});
    const fakeSig = 'submitted-sig-abc';
    mockRpc.sendTransaction.mockImplementation(() => ({
      send: vi.fn().mockResolvedValue(fakeSig),
    }));
    const adapter = makeAdapter(mockRpc);

    const result = await adapter.submitExecution(
      new Uint8Array([1, 2, 3]),
      ['remove-liquidity', 'collect-fees', 'swap-assets'],
    );

    expect(result.references).toHaveLength(3);
    expect(result.references[0]).toEqual({ signature: fakeSig, stepKind: 'remove-liquidity' });
    expect(result.references[1]).toEqual({ signature: fakeSig, stepKind: 'collect-fees' });
    expect(result.references[2]).toEqual({ signature: fakeSig, stepKind: 'swap-assets' });
  });

  it('returns one reference for a single-step plan', async () => {
    const mockRpc = makeMockRpc({});
    const fakeSig = 'submitted-sig-single';
    mockRpc.sendTransaction.mockImplementation(() => ({
      send: vi.fn().mockResolvedValue(fakeSig),
    }));
    const adapter = makeAdapter(mockRpc);

    const result = await adapter.submitExecution(
      new Uint8Array([4, 5, 6]),
      ['swap-assets'],
    );

    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toEqual({ signature: fakeSig, stepKind: 'swap-assets' });
  });

  it('deduplicates step kinds', async () => {
    const mockRpc = makeMockRpc({});
    mockRpc.sendTransaction.mockImplementation(() => ({
      send: vi.fn().mockResolvedValue('dedup-sig'),
    }));
    const adapter = makeAdapter(mockRpc);

    const result = await adapter.submitExecution(
      new Uint8Array([7]),
      ['swap-assets', 'swap-assets', 'collect-fees'],
    );

    expect(result.references).toHaveLength(2);
    const stepKinds = result.references.map((r) => r.stepKind);
    expect(stepKinds).toContain('swap-assets');
    expect(stepKinds).toContain('collect-fees');
  });
});
```

- [ ] **Step 8: Run the new tests to verify they fail**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts -t "step projection"`

Expected: FAIL — `submitExecution` currently doesn't accept a second argument and always returns a single hardcoded `swap-assets` reference.

- [ ] **Step 9: Implement the fix in `submitExecution()`**

In `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`, add `ExecutionStep` to the domain import (line 12):

```typescript
// Before:
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp } from '@clmm/domain';

// After:
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp, ExecutionStep } from '@clmm/domain';
```

Then change the `submitExecution` method (lines 27-46):

```typescript
// Before:
async submitExecution(signedPayload: Uint8Array): Promise<{
  references: TransactionReference[];
  submittedAt: ClockTimestamp;
}> {
  const rpc = this.getRpc();

  const base64 = uint8ArrayToBase64(signedPayload) as Base64EncodedWireTransaction;

  const signature = await rpc.sendTransaction(base64, { encoding: 'base64', skipPreflight: true }).send();

  const reference: TransactionReference = {
    signature: signature.toString(),
    stepKind: 'swap-assets',
  };

  return {
    references: [reference],
    submittedAt: makeClockTimestamp(Date.now()),
  };
}

// After:
async submitExecution(
  signedPayload: Uint8Array,
  plannedStepKinds: ReadonlyArray<ExecutionStep['kind']>,
): Promise<{
  references: TransactionReference[];
  submittedAt: ClockTimestamp;
}> {
  const rpc = this.getRpc();

  const base64 = uint8ArrayToBase64(signedPayload) as Base64EncodedWireTransaction;

  const signature = await rpc.sendTransaction(base64, { encoding: 'base64', skipPreflight: true }).send();

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

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts`

Expected: ALL tests PASS — both the new step projection tests and the existing reconciliation tests.

- [ ] **Step 11: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts
git commit -m "fix(adapters): submitExecution returns per-step references from plannedStepKinds

Instead of hardcoding a single swap-assets reference, the adapter now
returns one TransactionReference per unique planned step kind, all sharing
the same transaction signature. Deduplicates step kinds defensively."
```

---

## Task 4: Refactor `reconcileExecution()` — Signature Dedup

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts` (lines 48-91)
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts`

- [ ] **Step 12: Write the signature dedup test**

Add this test to the existing `describe('reconcileExecution classification', ...)` block:

```typescript
it('deduplicates signature status lookups for shared-signature references', async () => {
  const mockRpc = makeMockRpc({
    'shared-sig': { confirmationStatus: 'confirmed' },
  });
  const adapter = makeAdapter(mockRpc);

  const result = await adapter.reconcileExecution([
    makeRef('shared-sig', 'remove-liquidity'),
    makeRef('shared-sig', 'collect-fees'),
    makeRef('shared-sig', 'swap-assets'),
  ]);

  expect(result.finalState).toEqual({ kind: 'confirmed' });
  expect(result.confirmedSteps).toEqual(['remove-liquidity', 'collect-fees', 'swap-assets']);
  // The critical assertion: getSignatureStatuses called once, not three times
  expect(mockRpc.getSignatureStatuses).toHaveBeenCalledTimes(1);
});

it('handles mixed signatures correctly — each checked once', async () => {
  const mockRpc = makeMockRpc({
    'sig-a': { confirmationStatus: 'confirmed' },
    'sig-b': { err: { err: 'failed' } },
  });
  const adapter = makeAdapter(mockRpc);

  const result = await adapter.reconcileExecution([
    makeRef('sig-a', 'remove-liquidity'),
    makeRef('sig-a', 'collect-fees'),
    makeRef('sig-b', 'swap-assets'),
  ]);

  expect(result.finalState).toEqual({ kind: 'partial' });
  expect(result.confirmedSteps).toEqual(['remove-liquidity', 'collect-fees']);
  expect(mockRpc.getSignatureStatuses).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 13: Run the dedup tests to verify they fail**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts -t "dedup"`

Expected: FAIL — the current implementation calls `getSignatureStatuses` once per reference, so 3 references with the same signature results in 3 calls.

- [ ] **Step 14: Implement signature dedup in `reconcileExecution()`**

Replace the entire `reconcileExecution` method in `SolanaExecutionSubmissionAdapter.ts`:

```typescript
async reconcileExecution(references: TransactionReference[]): Promise<{
  confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'>;
  finalState: ExecutionLifecycleState | null;
}> {
  const rpc = this.getRpc();

  // Dedupe: collect unique signatures, fetch statuses once
  const uniqueSignatures = [...new Set(references.map((r) => r.signature))];
  const signatureStatusMap = new Map<string, 'confirmed' | 'failed' | 'pending'>();

  for (const sig of uniqueSignatures) {
    try {
      const status = await rpc
        .getSignatureStatuses(
          [sig as unknown as Signature],
          { searchTransactionHistory: true },
        )
        .send();
      const sigStatus = status.value[0];

      if (sigStatus?.err) {
        signatureStatusMap.set(sig, 'failed');
      } else if (
        sigStatus?.confirmationStatus === 'confirmed' ||
        sigStatus?.confirmationStatus === 'finalized'
      ) {
        signatureStatusMap.set(sig, 'confirmed');
      } else {
        signatureStatusMap.set(sig, 'pending');
      }
    } catch {
      signatureStatusMap.set(sig, 'failed');
    }
  }

  // Project signature status onto step references
  const confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'> = [];
  let failedCount = 0;

  for (const ref of references) {
    const status = signatureStatusMap.get(ref.signature) ?? 'pending';
    if (status === 'confirmed') {
      confirmedSteps.push(ref.stepKind);
    } else if (status === 'failed') {
      failedCount++;
    }
  }

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

  return { confirmedSteps, finalState };
}
```

- [ ] **Step 15: Run all adapter tests**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts`

Expected: ALL tests PASS — existing reconciliation tests still pass, new dedup tests pass.

- [ ] **Step 16: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.test.ts
git commit -m "fix(adapters): deduplicate signature status lookups in reconcileExecution

Builds a signature→status map from unique signatures before iterating
references. Three references sharing one signature now produce one
RPC call instead of three."
```

---

## Task 5: Update Call Site — `submitExecutionAttempt()`

**Files:**
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`
- Modify: `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts`

- [ ] **Step 17: Write the preview-based step kind recovery test**

Add this test to the existing `describe('SubmitExecutionAttempt', ...)` block in `SubmitExecutionAttempt.test.ts`:

```typescript
it('passes planned step kinds from preview to submitExecution', async () => {
  const clock = new FakeClockPort();
  const ids = new FakeIdGeneratorPort();
  const executionRepo = new FakeExecutionRepository();
  const submissionPort = new FakeExecutionSubmissionPort();
  const historyRepo = new FakeExecutionHistoryRepository();
  const submitSpy = vi.spyOn(submissionPort, 'submitExecution');

  // Save a preview with a 3-step plan
  const { previewId } = await executionRepo.savePreview(
    FIXTURE_POSITION_ID,
    {
      plan: {
        steps: [
          { kind: 'remove-liquidity' },
          { kind: 'collect-fees' },
          { kind: 'swap-assets', instruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: 'test' } },
        ],
        postExitPosture: { kind: 'exit-to-usdc' },
        swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: 'test' },
      },
      freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
      estimatedAt: Date.now(),
    },
    LOWER_BOUND_BREACH,
  );

  const attempt: StoredExecutionAttempt = {
    attemptId: 'attempt-with-preview',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
    previewId,
  };
  await executionRepo.saveAttempt(attempt);

  await submitExecutionAttempt({
    attemptId: 'attempt-with-preview',
    signedPayload: new Uint8Array([1, 2, 3]),
    executionRepo,
    submissionPort,
    historyRepo,
    clock,
    ids,
  });

  expect(submitSpy).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    ['remove-liquidity', 'collect-fees', 'swap-assets'],
  );
});

it('falls back to swap-assets when attempt has no previewId', async () => {
  const clock = new FakeClockPort();
  const ids = new FakeIdGeneratorPort();
  const executionRepo = new FakeExecutionRepository();
  const submissionPort = new FakeExecutionSubmissionPort();
  const historyRepo = new FakeExecutionHistoryRepository();
  const submitSpy = vi.spyOn(submissionPort, 'submitExecution');

  const attempt: StoredExecutionAttempt = {
    attemptId: 'attempt-no-preview',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
    // No previewId
  };
  await executionRepo.saveAttempt(attempt);

  await submitExecutionAttempt({
    attemptId: 'attempt-no-preview',
    signedPayload: new Uint8Array([1, 2, 3]),
    executionRepo,
    submissionPort,
    historyRepo,
    clock,
    ids,
  });

  expect(submitSpy).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    ['swap-assets'],
  );
});
```

- [ ] **Step 18: Run the new tests to verify they fail**

Run: `cd packages/application && npx vitest run src/use-cases/execution/SubmitExecutionAttempt.test.ts -t "planned step kinds"`

Expected: FAIL — `submitExecution` is currently called with only one argument.

- [ ] **Step 19: Implement step kind recovery in `submitExecutionAttempt()`**

In `packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts`, add `ExecutionStep` to the domain import:

```typescript
import type { TransactionReference, ExecutionStep } from '@clmm/domain';
```

Then change the submission call (around line 50). Replace:

```typescript
const { references } = await submissionPort.submitExecution(signedPayload);
```

With:

```typescript
// Recover planned step kinds from the preview, fall back to swap-assets
let plannedStepKinds: ReadonlyArray<ExecutionStep['kind']> = ['swap-assets'];
if (attempt.previewId) {
  const previewRecord = await executionRepo.getPreview(attempt.previewId);
  if (previewRecord) {
    plannedStepKinds = previewRecord.preview.plan.steps.map((s) => s.kind);
  } else {
    console.warn(
      `submitExecutionAttempt: preview ${attempt.previewId} not found for attempt ${attemptId}, falling back to swap-assets`,
    );
  }
}

const { references } = await submissionPort.submitExecution(signedPayload, plannedStepKinds);
```

- [ ] **Step 20: Run all SubmitExecutionAttempt tests**

Run: `cd packages/application && npx vitest run src/use-cases/execution/SubmitExecutionAttempt.test.ts`

Expected: ALL tests PASS — existing tests continue to work (they create attempts without `previewId`, so they hit the fallback path), new tests pass.

- [ ] **Step 21: Typecheck the full application package**

Run: `cd packages/application && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors.

- [ ] **Step 22: Run full test suite**

Run: `cd packages/application && npx vitest run && cd ../adapters && npx vitest run && cd ../testing && npx vitest run`

Expected: ALL tests PASS across all packages.

- [ ] **Step 23: Commit**

```bash
git add packages/application/src/use-cases/execution/SubmitExecutionAttempt.ts packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts
git commit -m "fix(application): recover planned step kinds from preview for submission

submitExecutionAttempt now looks up the execution plan from the stored
preview and passes step kinds to submitExecution. Falls back to
swap-assets when no preview is available (legacy/edge case)."
```
