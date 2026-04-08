# Code Review Fixes: Preview Freshness, Partial Reconciliation, Payload Freshness, and Durable History

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four adapter-path defects where the system makes approval, history, and reconciliation decisions from stale or incomplete state.

**Architecture:** Four independent fixes ordered by risk and dependency. Fixes 1 (preview freshness) and 4 (payload freshness) tighten approval/submit guards in the application and controller layers. Fix 3 (partial reconciliation) corrects the Solana adapter's aggregate classification. Fix 2 (durable history) adds a wallet-position ownership projection so history survives position closure. All changes follow TDD with the existing Vitest + fake-based test infrastructure.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM (pg), NestJS controllers, @solana/kit

**Spec:** `docs/superpowers/specs/2026-04-06-review-fixes-preview-freshness-history-partial-reconciliation-design.md`
**Story:** `docs/superpowers/stories/2026-04-06-code-review-fixes-preview-freshness-history-partial-reconciliation.md`

---

## Task 1: Preview Freshness Revalidation at Approval Time

**Summary:** `RequestWalletSignature` trusts the stored `preview.freshness.kind` and only separately checks hard expiry. A preview can be approved during the 30-60s stale window. Fix: recompute freshness from `estimatedAt` and `clock.now()` before approval.

**Files:**
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.ts:72-79`
- Test: `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`
- Read (reference only): `packages/domain/src/execution/PreviewFreshnessPolicy.ts`

### Context for the implementer

The domain already has `evaluatePreviewFreshness(estimatedAt, now)` in `packages/domain/src/execution/PreviewFreshnessPolicy.ts` which returns `{ kind: 'fresh' | 'stale' | 'expired' }`. The current code at lines 72-79 of `RequestWalletSignature.ts` checks stored freshness kind and separately checks clock time against `expiresAt`. The fix replaces both checks with a single recomputation using the domain function.

The `ExecutionPreview` type stores `estimatedAt` on the preview. The preview record accessible via `previewRecord.preview` has shape `{ plan, freshness, estimatedAt }`. You need `previewRecord.preview.estimatedAt` for the recomputation.

### Steps

- [ ] **Step 1: Write the failing test for stale-window approval rejection**

Add this test to `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts` after the existing test `'throws PreviewApprovalNotAllowedError when a fresh preview is past expiresAt by clock time'`:

```typescript
it('throws PreviewApprovalNotAllowedError when clock time puts preview in the stale window even though stored freshness is fresh', async () => {
  // Advance clock by 35 seconds — past PREVIEW_STALE_AFTER_MS (30s) but before PREVIEW_TTL_MS (60s)
  // The stored preview still says { kind: 'fresh' } because it was created at t=1_000_000
  clock.advance(35_000);

  await expect(requestWalletSignature({
    previewId,
    walletId: FIXTURE_WALLET_ID,
    executionRepo,
    prepPort,
    historyRepo,
    clock,
    ids,
  })).rejects.toThrow(PreviewApprovalNotAllowedError);
  expect(executionRepo.attempts.size).toBe(0);
  expect(executionRepo.preparedPayloads.size).toBe(0);
  expect(historyRepo.events).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/application test -- --run RequestWalletSignature`
Expected: FAIL — the test passes through the stale window because the stored freshness is still `fresh` and clock time (1_035_000) is within `expiresAt` (1_060_000).

- [ ] **Step 3: Implement freshness recomputation**

In `packages/application/src/use-cases/execution/RequestWalletSignature.ts`, add the import and replace the freshness check block:

Add import at top:
```typescript
import { evaluatePreviewFreshness } from '@clmm/domain';
```

Replace lines 72-79 (the two freshness checks) with:
```typescript
  const now = clock.now();
  const liveFreshness = evaluatePreviewFreshness(previewRecord.preview.estimatedAt, now);
  if (liveFreshness.kind !== 'fresh') {
    throw new PreviewApprovalNotAllowedError(`preview ${previewId} is ${liveFreshness.kind}`);
  }
```

Also remove the now-redundant `const now = clock.now();` on the original line 76 (it's moved up into the replacement block).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/application test -- --run RequestWalletSignature`
Expected: All tests PASS, including the new stale-window test and existing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/execution/RequestWalletSignature.ts packages/application/src/use-cases/execution/RequestWalletSignature.test.ts
git commit -m "fix: recompute preview freshness at approval time instead of trusting stored state"
```

---

## Task 2: Prepared Payload Freshness Enforcement (Remove payloadVersion Bypass)

**Summary:** `ExecutionController.submitExecution()` only validates the stored prepared payload when `body.payloadVersion` is present. Callers can omit it to bypass freshness checks. Fix: always load and validate the prepared payload when one exists.

**Files:**
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts:334-345`
- Test: `packages/adapters/src/inbound/http/ExecutionController.test.ts`

### Context for the implementer

The current code at lines 334-345 of `ExecutionController.ts` wraps the prepared payload validation in `if (body.payloadVersion) { ... }`. The fix removes that conditional gate: always load the prepared payload for the attempt, and if one exists, require `body.payloadVersion` to match. The test at line 526 (`'submits without payloadVersion for the legacy awaiting-signature path'`) currently passes and demonstrates the bypass — that test needs to be changed to expect rejection.

The `FakeExecutionRepository` stores prepared payloads in a `preparedPayloads` Map keyed by `attemptId`. The method `getPreparedPayload(attemptId)` returns the stored payload or `undefined`.

### Steps

- [ ] **Step 1: Write the failing test for missing payloadVersion rejection**

Add this test to `packages/adapters/src/inbound/http/ExecutionController.test.ts`:

```typescript
it('rejects submit when payloadVersion is omitted but a prepared payload exists', async () => {
  await saveAttempt({
    attemptId: 'attempt-missing-version',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });
  await executionRepo.savePreparedPayload({
    payloadId: 'payload-missing-version',
    attemptId: 'attempt-missing-version',
    unsignedPayload: new Uint8Array([1, 2]),
    payloadVersion: 'stored-version',
    expiresAt: makeClockTimestamp(1_100_000),
    createdAt: makeClockTimestamp(1_000_000),
  });

  await expect(
    controller.submitExecution('attempt-missing-version', {
      signedPayload: Buffer.from([1, 2]).toString('base64'),
    }),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(submissionPort.submittedPayloads).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- --run ExecutionController`
Expected: FAIL — the submit succeeds because `body.payloadVersion` is undefined, skipping the validation block.

- [ ] **Step 3: Implement unconditional prepared payload validation**

In `packages/adapters/src/inbound/http/ExecutionController.ts`, replace lines 334-345 (the `if (body.payloadVersion) { ... }` block) with:

```typescript
    const preparedPayload = await this.executionRepo.getPreparedPayload(attemptId);
    if (preparedPayload) {
      if (!body.payloadVersion) {
        throw new ConflictException(
          `Attempt ${attemptId} has a prepared payload; payloadVersion is required`,
        );
      }
      if (preparedPayload.payloadVersion !== body.payloadVersion) {
        throw new ConflictException(`Attempt ${attemptId} payloadVersion does not match`);
      }
      if (preparedPayload.expiresAt <= this.clock.now()) {
        throw new GoneException(`Prepared payload expired for attempt ${attemptId}`);
      }
    }
```

- [ ] **Step 4: Update the legacy bypass test to expect rejection**

In `ExecutionController.test.ts`, find the test `'submits without payloadVersion for the legacy awaiting-signature path'` (line 526). This test now represents an invalid path. Replace it:

```typescript
it('submits without payloadVersion when no prepared payload exists (legacy path)', async () => {
  await saveAttempt({
    attemptId: 'attempt-legacy-submit',
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });
  // No prepared payload saved — legacy path still works

  const result = await controller.submitExecution('attempt-legacy-submit', {
    signedPayload: Buffer.from([3, 2, 1]).toString('base64'),
  });

  expect(result.result).toBe('confirmed');
  expect(submissionPort.submittedPayloads).toHaveLength(1);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- --run ExecutionController`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/ExecutionController.ts packages/adapters/src/inbound/http/ExecutionController.test.ts
git commit -m "fix: enforce prepared payload freshness validation regardless of payloadVersion presence"
```

---

## Task 3: Partial Reconciliation Classification

**Summary:** `SolanaExecutionSubmissionAdapter.reconcileExecution()` returns `confirmed` when any reference confirms and `failed` when none do. Multi-reference mixed outcomes should return `partial`. Fix: classify by counting confirmed, failed, and unresolved references.

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts:48-78`
- Modify: `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts:21-34`
- Test: `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`

### Context for the implementer

The current adapter at lines 70-72 does `confirmedSteps.length > 0 ? { kind: 'confirmed' } : { kind: 'failed' }`. This collapses partial outcomes. The fix needs to track three categories: confirmed, failed (explicit RPC error), and unresolved (missing/pending status). Then aggregate per the spec's classification table.

The `FakeExecutionSubmissionPort` also needs updating — currently it returns `confirmed` for 3 steps and `partial` for 1-2 steps, but it has no concept of `failed`. Add a `setFailedSteps` method or change the approach to accept a total reference count so the fake can distinguish partial from confirmed.

The `ReconcileExecutionAttempt` use case and its tests already handle the `partial` kind correctly — they just never receive it from the real adapter today.

### Steps

- [ ] **Step 1: Write the failing test for mixed confirmed/unresolved reconciliation**

Add to `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`:

```typescript
it('returns failed when submission port reports all-failed', async () => {
  submissionPort.setConfirmedSteps([]);
  submissionPort.setAllFailed(true);
  const result = await reconcileExecutionAttempt({
    attemptId: 'attempt-1',
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

- [ ] **Step 2: Update FakeExecutionSubmissionPort to support `failed` state**

In `packages/testing/src/fakes/FakeExecutionSubmissionPort.ts`, replace the `reconcileExecution` method:

```typescript
export class FakeExecutionSubmissionPort implements ExecutionSubmissionPort {
  private _confirmedSteps: ExecutionStep['kind'][] = [];
  private _allFailed = false;

  setConfirmedSteps(steps: ExecutionStep['kind'][]): void {
    this._confirmedSteps = steps;
  }

  setAllFailed(value: boolean): void {
    this._allFailed = value;
  }

  async submitExecution(
    _payload: Uint8Array,
  ): Promise<{ references: TransactionReference[]; submittedAt: ClockTimestamp }> {
    return {
      references: [{ signature: 'fake-sig-1', stepKind: 'remove-liquidity' }],
      submittedAt: makeClockTimestamp(Date.now()),
    };
  }

  async reconcileExecution(
    _refs: TransactionReference[],
  ): Promise<{
    confirmedSteps: Array<ExecutionStep['kind']>;
    finalState: ExecutionLifecycleState | null;
  }> {
    if (this._confirmedSteps.length === 3) {
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
}
```

- [ ] **Step 3: Run test to verify the new `failed` test passes with the updated fake**

Run: `pnpm --filter @clmm/application test -- --run ReconcileExecutionAttempt`
Expected: All tests PASS (this validates the fake update and the failed path).

- [ ] **Step 4: Fix the real adapter — classify reconciliation accurately**

In `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`, replace the `reconcileExecution` method (lines 48-78):

```typescript
  async reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'>;
    finalState: ExecutionLifecycleState | null;
  }> {
    const rpc = this.getRpc();

    const confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'> = [];
    let failedCount = 0;

    for (const ref of references) {
      try {
        const status = await rpc.getSignatureStatuses([ref.signature as unknown as Signature], { searchTransactionHistory: true }).send();
        const sigStatus = status.value[0];

        if (sigStatus?.confirmationStatus === 'confirmed' || sigStatus?.confirmationStatus === 'finalized') {
          confirmedSteps.push(ref.stepKind);
        } else if (sigStatus?.err) {
          failedCount++;
        }
        // else: unresolved (missing, pending, or unknown status)
      } catch {
        failedCount++;
      }
    }

    const unresolvedCount = references.length - confirmedSteps.length - failedCount;

    let finalState: ExecutionLifecycleState | null;
    if (confirmedSteps.length === references.length) {
      finalState = { kind: 'confirmed' };
    } else if (confirmedSteps.length > 0) {
      finalState = { kind: 'partial' };
    } else if (unresolvedCount > 0) {
      finalState = null; // still pending
    } else {
      finalState = { kind: 'failed' };
    }

    return { confirmedSteps, finalState };
  }
```

- [ ] **Step 5: Run all tests**

Run: `pnpm --filter @clmm/application test -- --run ReconcileExecutionAttempt && pnpm --filter @clmm/adapters test -- --run ExecutionController`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts packages/testing/src/fakes/FakeExecutionSubmissionPort.ts packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts
git commit -m "fix: classify mixed reconciliation outcomes as partial instead of confirmed"
```

---

## Task 4: Durable Wallet-Position Ownership Projection for History

**Summary:** `OffChainHistoryStorageAdapter.getWalletHistory()` derives scope from `listSupportedPositions(walletId)`. When a user exits all positions, history disappears. Fix: maintain a durable wallet-position ownership table that survives position closure.

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/wallet-position-ownership.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
- Test: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`
- Modify: `packages/testing/src/fakes/FakeExecutionHistoryRepository.ts`
- Test: `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`

### Context for the implementer

The `OffChainHistoryStorageAdapter` constructor takes `(db: Db, positionReadPort: SupportedPositionReadPort)`. The fix adds a new schema table `wallet_position_ownership` and changes `getWalletHistory` to query that table instead of `positionReadPort.listSupportedPositions()`. The adapter also needs a new method to record wallet-position ownership observations, called when events are appended.

The `FakeExecutionHistoryRepository` already has an `assignWalletToPosition(walletId, positionId)` method and a `walletPositions` Map — it already models durable ownership. The fake is already correct for the target behavior. The real adapter needs to catch up.

The `SupportedPositionReadPort` dependency can remain on the constructor for now (it may still be used by other methods or callers), but `getWalletHistory` must not use it.

### Steps

- [ ] **Step 1: Create the wallet-position ownership schema**

Create `packages/adapters/src/outbound/storage/schema/wallet-position-ownership.ts`:

```typescript
import { pgTable, text, bigint, unique } from 'drizzle-orm/pg-core';

export const walletPositionOwnership = pgTable('wallet_position_ownership', {
  walletId: text('wallet_id').notNull(),
  positionId: text('position_id').notNull(),
  firstSeenAt: bigint('first_seen_at', { mode: 'number' }).notNull(),
  lastSeenAt: bigint('last_seen_at', { mode: 'number' }).notNull(),
}, (table) => [
  unique('wallet_position_ownership_wallet_position_unique').on(table.walletId, table.positionId),
]);
```

- [ ] **Step 2: Export the new schema from the index**

In `packages/adapters/src/outbound/storage/schema/index.ts`, add:

```typescript
export * from './wallet-position-ownership.js';
```

- [ ] **Step 3: Write the failing test for durable history after position closure**

Add to `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`:

```typescript
it('returns wallet history from durable ownership projection even when no live positions exist', async () => {
  const ownershipSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([
        { walletId: FIXTURE_WALLET_ID, positionId: FIXTURE_POSITION_ID, firstSeenAt: 900, lastSeenAt: 1000 },
      ]),
    }),
  });
  const historySelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue([
          {
            eventId: 'evt-durable-1',
            positionId: FIXTURE_POSITION_ID,
            eventType: 'confirmed',
            directionKind: 'lower-bound-breach',
            occurredAt: 1000,
            lifecycleStateKind: 'confirmed',
            transactionRefJson: null,
          },
        ]),
      }),
    }),
  });

  // First call is for ownership lookup, second is for history events
  const selectMock = vi.fn()
    .mockReturnValueOnce(ownershipSelect())
    .mockReturnValueOnce(historySelect());

  const db = { select: selectMock } as unknown as Db;
  // Return empty positions — simulates all positions closed
  const positionReadPort: SupportedPositionReadPort = {
    listSupportedPositions: vi.fn().mockResolvedValue([]),
    getPosition: vi.fn().mockResolvedValue(null),
  };
  const adapter = new OffChainHistoryStorageAdapter(db, positionReadPort);

  const history = await adapter.getWalletHistory(FIXTURE_WALLET_ID);

  expect(history).toHaveLength(1);
  expect(history[0]?.eventId).toBe('evt-durable-1');
  // positionReadPort.listSupportedPositions should NOT be called
  expect(positionReadPort.listSupportedPositions).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- --run OffChainHistoryStorageAdapter`
Expected: FAIL — the adapter still calls `listSupportedPositions` and returns `[]`.

- [ ] **Step 5: Add `recordWalletPositionOwnership` method and update `getWalletHistory`**

In `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`:

Add import for the new schema table:
```typescript
import { walletPositionOwnership } from './schema/index.js';
```

Add the ownership recording method to the class:
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

Replace `getWalletHistory` (lines 66-80) with:
```typescript
  async getWalletHistory(walletId: WalletId): Promise<readonly HistoryEvent[]> {
    const ownershipRows = await this.db
      .select()
      .from(walletPositionOwnership)
      .where(eq(walletPositionOwnership.walletId, walletId));

    const positionIds = ownershipRows.map((row) => row.positionId);
    if (positionIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(historyEvents)
      .where(inArray(historyEvents.positionId, positionIds))
      .orderBy(historyEvents.occurredAt, historyEvents.eventId);

    return rows.map(mapHistoryEventRow);
  }
```

- [ ] **Step 6: Run adapter tests**

Run: `pnpm --filter @clmm/adapters test -- --run OffChainHistoryStorageAdapter`
Expected: PASS (you may need to adjust the mock setup in the existing test to account for the new DB query pattern — the existing test that mocks `listSupportedPositions` will need updating since that method is no longer called by `getWalletHistory`).

- [ ] **Step 7: Update the existing adapter test to reflect new query pattern**

The first test in `OffChainHistoryStorageAdapter.test.ts` (`'derives wallet history from wallet-owned positions...'`) needs to mock the ownership table query instead of `listSupportedPositions`. Update it to mock two `select()` calls — one for ownership, one for history events — similar to the new test in step 3.

- [ ] **Step 8: Add durable history test to `GetWalletExecutionHistory.test.ts`**

Add to `packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts`:

```typescript
it('returns history for a wallet whose positions were previously assigned even if no new events exist', async () => {
  // assignWalletToPosition persists the ownership — simulates durable projection
  const closedPositionId = makePositionId('closed-position');
  historyRepo.assignWalletToPosition(FIXTURE_WALLET_ID, closedPositionId);
  await historyRepo.appendEvent({
    eventId: 'evt-closed-pos',
    positionId: closedPositionId,
    eventType: 'confirmed',
    breachDirection: LOWER_BOUND_BREACH,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'confirmed' },
  });

  const result = await getWalletExecutionHistory({
    walletId: FIXTURE_WALLET_ID,
    historyRepo,
  });

  // Should include events from both the current and the closed position
  expect(result.history).toHaveLength(2);
  const closedPosEvent = result.history.find((e) => e.positionId === closedPositionId);
  expect(closedPosEvent?.eventType).toBe('confirmed');
});
```

- [ ] **Step 9: Run all application and adapter tests**

Run: `pnpm --filter @clmm/application test -- --run GetWalletExecutionHistory && pnpm --filter @clmm/adapters test -- --run OffChainHistoryStorageAdapter`
Expected: All PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/wallet-position-ownership.ts packages/adapters/src/outbound/storage/schema/index.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts packages/application/src/use-cases/execution/GetWalletExecutionHistory.test.ts
git commit -m "feat: add durable wallet-position ownership projection for history queries"
```

---

## Task 5: Full Suite Verification and Final Commit

**Summary:** Run the full test suite across all packages to ensure no regressions.

**Files:**
- None (verification only)

### Steps

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: All packages PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm build`
Expected: Clean build with no type errors.

- [ ] **Step 3: Run lint**

Run: `pnpm lint` (if available, otherwise skip)
Expected: No new lint errors.

---

## Implementation Order and Rationale

| Order | Task | Risk | Dependency |
|-------|------|------|------------|
| 1 | Preview Freshness Revalidation | Low — pure application logic | None |
| 2 | Prepared Payload Freshness | Low — controller guard change | None |
| 3 | Partial Reconciliation | Low — adapter + fake update | None |
| 4 | Durable Wallet History | Medium — new schema table | None (independent) |
| 5 | Full Verification | None | Tasks 1-4 |

Tasks 1-3 are independent and can be parallelized. Task 4 is also independent but is listed last because it has the most moving parts (schema addition). Task 5 is a final verification gate.
