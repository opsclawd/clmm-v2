# Fix: Reconciliation Classification and Dead Dependency Injection

**Goal:** Fix two implementation defects from the epic review:
1. `SolanaExecutionSubmissionAdapter.reconcileExecution()` classifies "failed + unresolved" as `null` instead of `failed`
2. `OffChainHistoryStorageAdapter` still injects unused `SupportedPositionReadPort`

**Spec:** `docs/superpowers/specs/2026-04-06-review-fixes-preview-freshness-history-partial-reconciliation-design.md`

---

## Task 1: Fix Reconciliation Classification Bug

**Summary:** Line 79 of `SolanaExecutionSubmissionAdapter.ts` returns `null` when `unresolvedCount > 0` regardless of whether there are explicit failures. The spec requires `null` only when there are unresolved but **no explicit failures**.

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts:79-80`

### Steps

- [ ] **Step 1: Fix the classification logic**

In `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`, replace lines 79-80:

```typescript
// BEFORE (wrong):
} else if (unresolvedCount > 0) {
  finalState = null;

// AFTER (correct per spec):
} else if (failedCount === 0 && unresolvedCount > 0) {
  finalState = null; // pending — no hard failure signal
```

The `else` branch at line 82 (`finalState = { kind: 'failed' }`) correctly handles the case where `confirmedSteps.length === 0` and `failedCount > 0`.

- [ ] **Step 2: Add regression test for failed+unresolved case**

Add to `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts` after the mixed confirmed/failed test:

```typescript
it('marks as failed when some references fail and others are unresolved with zero confirmed', async () => {
  await executionRepo.saveAttempt({
    attemptId: 'attempt-failed-unresolved',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    lifecycleState: { kind: 'submitted' },
    completedSteps: [],
    transactionReferences: [
      { signature: 'sig-fail-1', stepKind: 'remove-liquidity' },
      { signature: 'sig-fail-2', stepKind: 'collect-fees' },
      { signature: 'sig-pending', stepKind: 'swap-assets' },
    ],
  });

  submissionPort.setTotalReferenceCount(3);
  submissionPort.setConfirmedSteps([]);
  submissionPort.setAllFailed(true);

  const result = await reconcileExecutionAttempt({
    attemptId: 'attempt-failed-unresolved',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    executionRepo,
    submissionPort,
    historyRepo,
    clock,
    ids,
  });

  expect(result.kind).toBe('failed');
});
```

Note: The existing `setAllFailed` flag drives the fake to return `{ kind: 'failed' }` regardless of `unresolvedCount`, which is the correct behavior for this test. The real adapter fix ensures the same outcome.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @clmm/application test -- --run ReconcileExecutionAttempt`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts
git commit -m "fix: return failed not null when references have explicit failures plus unresolved"
```

---

## Task 2: Remove Dead SupportedPositionReadPort Injection

**Summary:** `OffChainHistoryStorageAdapter` still injects `SupportedPositionReadPort` in its constructor even though `getWalletHistory()` no longer uses it. Remove the dead dependency.

**Files:**
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts:46-50`
- Modify: `packages/adapters/src/composition/` (NestJS module wiring — find where adapter is instantiated)

### Steps

- [ ] **Step 1: Find where the adapter is wired in NestJS composition**

Search for where `OffChainHistoryStorageAdapter` is instantiated to update the module wiring.

```bash
rg "OffChainHistoryStorageAdapter" --type ts -g "packages/adapters/src/composition"
```

Expected: a NestJS module file that passes `SupportedPositionReadPort` as the second constructor arg.

- [ ] **Step 2: Remove dead injection from constructor**

In `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`, replace lines 46-50:

```typescript
// BEFORE:
export class OffChainHistoryStorageAdapter implements ExecutionHistoryRepository {
  constructor(
    private readonly db: Db,
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

// AFTER:
export class OffChainHistoryStorageAdapter implements ExecutionHistoryRepository {
  constructor(
    private readonly db: Db,
  ) {}
```

- [ ] **Step 3: Update NestJS module wiring**

In the composition file found in Step 1, remove `SupportedPositionReadPort` from the `OffChainHistoryStorageAdapter` instantiation.

- [ ] **Step 4: Run build to verify no type errors**

Run: `pnpm build 2>&1 | head -40`
Expected: Clean build. Any caller that was passing the unused port will now be a type error — fix those too.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/adapters/src/composition/...
git commit -m "chore: remove dead SupportedPositionReadPort injection from OffChainHistoryStorageAdapter"
```

---

## Task 3: Final Verification

### Steps

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All PASS.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: Clean build with no type errors.

---

## Implementation Order

| Order | Task | What |
|-------|------|-------|
| 1 | Reconciliation fix | Classification logic + regression test |
| 2 | Dead injection removal | Constructor + NestJS wiring update |
| 3 | Final verification | Full suite green |
