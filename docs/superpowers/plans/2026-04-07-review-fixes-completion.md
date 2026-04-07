# Review Fixes Completion: Ownership Write Path and Missing Regression Test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete two gaps left by the initial implementation: restore the `recordWalletPositionOwnership` write method (deleted as "dead code") and wire it into the approval flow so the `wallet_position_ownership` table is actually populated in production, and add the missing mixed confirmed/failed reconciliation regression test from the spec.

**Architecture:** The ownership write path belongs on the `ExecutionHistoryRepository` port interface so it flows through the same dependency injection path as `appendEvent`. The natural call site is `RequestWalletSignature` — the moment a wallet approves execution on a position is when ownership should be recorded. The fake already has `assignWalletToPosition` which serves the same purpose. The reconciliation test gap is a simple addition to the existing test file.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM (pg)

**Branch:** `fix/review-fixes-preview-freshness-history-partial-reconciliation` (worktree at `.worktrees/review-fixes`)

**Parent plan:** `docs/superpowers/plans/2026-04-07-review-fixes-preview-freshness-history-partial-reconciliation.md`

**IMPORTANT:** The `recordWalletPositionOwnership` method was deliberately deleted in commit `58db703` with the rationale "the write path was never called." This was incorrect — it is forward infrastructure required by the plan and spec. Do NOT treat it as dead code. It must be restored and wired.

---

## Task 1: Add `recordWalletPositionOwnership` to the Port Interface

**Summary:** The `ExecutionHistoryRepository` port interface needs a method for recording wallet-position ownership. Without it, the adapter method cannot be called from the application layer.

**Files:**
- Modify: `packages/application/src/ports/index.ts:194-199`

### Steps

- [ ] **Step 1: Add the method to the interface**

In `packages/application/src/ports/index.ts`, add `recordWalletPositionOwnership` to the `ExecutionHistoryRepository` interface:

```typescript
export interface ExecutionHistoryRepository {
  appendEvent(event: HistoryEvent): Promise<void>;
  recordWalletPositionOwnership(walletId: WalletId, positionId: PositionId, observedAt: number): Promise<void>;
  getWalletHistory(walletId: WalletId): Promise<readonly HistoryEvent[]>;
  getTimeline(positionId: PositionId): Promise<HistoryTimeline>;
  getOutcomeSummary(positionId: PositionId): Promise<ExecutionOutcomeSummary | null>;
}
```

- [ ] **Step 2: Run typecheck to see what breaks**

Run: `pnpm build 2>&1 | head -40`
Expected: Type errors in `OffChainHistoryStorageAdapter` (missing method) and `FakeExecutionHistoryRepository` (missing method). These are fixed in Tasks 2 and 3.

---

## Task 2: Restore `recordWalletPositionOwnership` on the Real Adapter

**Summary:** Re-add the method that was deleted in commit `58db703`. This is the production write path for the `wallet_position_ownership` table.

**Files:**
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`

### Steps

- [ ] **Step 1: Add the method to the adapter class**

In `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`, add this method to `OffChainHistoryStorageAdapter` after `appendEvent`:

```typescript
  async recordWalletPositionOwnership(
    walletId: WalletId,
    positionId: PositionId,
    observedAt: number,
  ): Promise<void> {
    await this.db
      .insert(walletPositionOwnership)
      .values({
        walletId,
        positionId,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .onConflictDoUpdate({
        target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
        set: { lastSeenAt: observedAt },
      });
  }
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @clmm/adapters build`
Expected: Passes (adapter now satisfies the interface). `FakeExecutionHistoryRepository` will still fail — fixed in Task 3.

---

## Task 3: Add `recordWalletPositionOwnership` to the Fake

**Summary:** The `FakeExecutionHistoryRepository` already has `assignWalletToPosition(walletId, positionId)`. Add `recordWalletPositionOwnership` that delegates to it so the fake satisfies the updated interface.

**Files:**
- Modify: `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`

### Steps

- [ ] **Step 1: Add the method to the fake**

In `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`, add this method to the class:

```typescript
  async recordWalletPositionOwnership(
    walletId: WalletId,
    positionId: PositionId,
    _observedAt: number,
  ): Promise<void> {
    this.assignWalletToPosition(walletId, positionId);
  }
```

Note: `PositionId` is already imported. `WalletId` is already imported. The `_observedAt` parameter is unused in the fake since the fake's `walletPositions` Map doesn't track timestamps.

- [ ] **Step 2: Run full typecheck**

Run: `pnpm build`
Expected: Clean build, no type errors across all packages.

- [ ] **Step 3: Run existing tests to confirm no regressions**

Run: `pnpm test`
Expected: All 405 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/ports/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/testing/src/fakes/FakeExecutionHistoryRepository.ts
git commit -m "feat: restore recordWalletPositionOwnership on port, adapter, and fake"
```

---

## Task 4: Wire Ownership Recording into `RequestWalletSignature`

**Summary:** The approval flow in `RequestWalletSignature` is the natural call site — it has both `walletId` and `positionId` in scope. Record ownership when a wallet approves execution on a position.

**Files:**
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.ts:105-112`
- Test: `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Add this test to `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts` after the happy-path test:

```typescript
it('records wallet-position ownership when approving a preview', async () => {
  await requestWalletSignature({
    previewId,
    episodeId: FIXTURE_BREACH_EPISODE_ID,
    isTriggerDerivedApproval: true,
    walletId: FIXTURE_WALLET_ID,
    executionRepo,
    prepPort,
    historyRepo,
    clock,
    ids,
  });

  // The fake's assignWalletToPosition is called via recordWalletPositionOwnership,
  // so getWalletHistory should now return events for this position
  const history = await historyRepo.getWalletHistory(FIXTURE_WALLET_ID);
  expect(history.length).toBeGreaterThanOrEqual(1);
  expect(history.some((e) => e.positionId === FIXTURE_POSITION_ID)).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/application test -- --run RequestWalletSignature`
Expected: FAIL — `getWalletHistory` returns `[]` because `recordWalletPositionOwnership` is not called yet, so no wallet-position mapping exists.

- [ ] **Step 3: Wire the call into RequestWalletSignature**

In `packages/application/src/use-cases/execution/RequestWalletSignature.ts`, add the ownership recording call just before the `appendEvent` call (around line 105):

```typescript
  await historyRepo.recordWalletPositionOwnership(
    walletId,
    previewRecord.positionId,
    now,
  );

  await historyRepo.appendEvent({
```

This goes after `savePreparedPayload` and before `appendEvent`. The `walletId`, `previewRecord.positionId`, and `now` are all already in scope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/application test -- --run RequestWalletSignature`
Expected: All tests PASS including the new ownership test.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/RequestWalletSignature.test.ts
git commit -m "feat: record wallet-position ownership at approval time"
```

---

## Task 5: Add Mixed Confirmed/Failed Reconciliation Regression Test

**Summary:** The spec's testing strategy requires coverage for "one confirmed, one failed → partial." The current tests cover all-confirmed, some-confirmed (partial), all-failed, and all-unresolved, but not the mixed confirmed+failed case. The `FakeExecutionSubmissionPort` needs a small enhancement to express this scenario.

**Files:**
- Modify: `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts`
- Test: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`

### Steps

- [ ] **Step 1: Add `setTotalReferenceCount` to the fake**

The current fake always returns either `confirmed`, `partial`, `null`, or `failed` based on `_confirmedSteps.length` and `_allFailed`. To express "1 confirmed + 1 failed = partial", the fake needs to know the total reference count so it can distinguish "1 of 3 confirmed" (partial) from "1 of 1 confirmed" (confirmed).

In `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts`, add a `_totalReferences` field and setter:

```typescript
export class FakeExecutionSubmissionPort implements ExecutionSubmissionPort {
  private _confirmedSteps: ExecutionStep['kind'][] = [];
  private _allFailed = false;
  private _totalReferences = 3;

  setConfirmedSteps(steps: ExecutionStep['kind'][]): void {
    this._confirmedSteps = steps;
  }

  setAllFailed(value: boolean): void {
    this._allFailed = value;
  }

  setTotalReferenceCount(count: number): void {
    this._totalReferences = count;
  }
```

Then update the `reconcileExecution` method to use `_totalReferences` instead of hardcoding `3`:

```typescript
  async reconcileExecution(
    _refs: TransactionReference[],
  ): Promise<{
    confirmedSteps: Array<ExecutionStep['kind']>;
    finalState: ExecutionLifecycleState | null;
  }> {
    if (this._confirmedSteps.length === this._totalReferences) {
      return { confirmedSteps: this._confirmedSteps, finalState: { kind: 'confirmed' } };
    }
    if (this._confirmedSteps.length > 0) {
      return { confirmedSteps: this._confirmedSteps, finalState: { kind: 'partial' } };
    }
    if (this._allFailed) {
      return { confirmedSteps: [], finalState: { kind: 'failed' } };
    }
    return { confirmedSteps: [], finalState: null };
  }
```

- [ ] **Step 2: Write the regression test for mixed confirmed/failed**

Add to `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts` after the existing partial test:

```typescript
it('marks as partial when one step confirms and another fails', async () => {
  await executionRepo.saveAttempt({
    attemptId: 'attempt-mixed',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    lifecycleState: { kind: 'submitted' },
    completedSteps: [],
    transactionReferences: [
      { signature: 'sig-ok', stepKind: 'remove-liquidity' },
      { signature: 'sig-fail', stepKind: 'swap-assets' },
    ],
  });

  submissionPort.setTotalReferenceCount(2);
  submissionPort.setConfirmedSteps(['remove-liquidity']);

  const result = await reconcileExecutionAttempt({
    attemptId: 'attempt-mixed',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    executionRepo,
    submissionPort,
    historyRepo,
    clock,
    ids,
  });

  expect(result.kind).toBe('partial');
  expect((await executionRepo.getAttempt('attempt-mixed'))?.completedSteps).toEqual(['remove-liquidity']);
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @clmm/application test -- --run ReconcileExecutionAttempt`
Expected: All tests PASS including the new mixed confirmed/failed test.

- [ ] **Step 4: Run full suite to verify no regressions**

Run: `pnpm test`
Expected: All tests PASS. The `_totalReferences` default of `3` preserves existing behavior for all other tests.

- [ ] **Step 5: Commit**

```bash
git add packages/testing/src/fakes/FakeExecutionSubmissionPort.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts
git commit -m "test: add mixed confirmed/failed reconciliation regression coverage"
```

---

## Task 6: Final Verification

**Files:** None (verification only)

### Steps

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All packages PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm build`
Expected: Clean build with no type errors.

---

## Implementation Order

| Order | Task | What it does |
|-------|------|-------------|
| 1 | Port interface | Adds `recordWalletPositionOwnership` to `ExecutionHistoryRepository` |
| 2 | Real adapter | Restores the upsert method on `OffChainHistoryStorageAdapter` |
| 3 | Fake + verify | Adds method to fake, confirms typecheck + all tests pass |
| 4 | Wire into approval | Calls `recordWalletPositionOwnership` from `RequestWalletSignature` |
| 5 | Reconciliation test | Adds the missing mixed confirmed/failed regression test |
| 6 | Final verification | Full suite green |

Tasks 1-3 are sequential (each depends on the previous for typecheck). Task 4 depends on 3. Task 5 is independent and can be done in parallel with 4.
