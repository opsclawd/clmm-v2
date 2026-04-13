# walletId Contamination Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `SolanaExecutionPreparationAdapter.fetchPositionData()` to use the real wallet address instead of fabricating one from the position mint.

**Architecture:** Thread the `walletId` parameter from `prepareExecution()` (which already has it) into `fetchPositionData()` (which currently fabricates a fake one from `position.positionMint`). Three-line patch, one test update, one commit.

**Tech Stack:** TypeScript, Vitest, @solana/kit, @orca-so/whirlpools-client

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts` | Modify (lines 77, 124, 145) | Thread `walletId` through `fetchPositionData()` |
| `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts` | Modify | Add test verifying `walletId` correctness |

---

## Task 1: Add a Regression Test for the walletId Bug

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to the existing `describe('SolanaExecutionPreparationAdapter', ...)` block in `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts`:

```typescript
it('fetchPositionData returns the real walletId, not the position mint', async () => {
  const adapter = new SolanaExecutionPreparationAdapter('https://api.mainnet-beta.solana.com');
  const internal = adapter as unknown as {
    fetchPositionData: (
      rpc: unknown,
      positionId: string,
      walletId: WalletId,
    ) => Promise<{ walletId: string } | null>;
  };

  // Mock the RPC calls inside fetchPositionData
  const mockPositionMint = 'PositionMint111111111111111111111111111111111';
  const mockWhirlpoolAddress = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
  const mockRpc = {} as unknown;

  // Stub getPositionAddress — it's a module-level import, so we mock the module
  const whirlpoolsClient = await import('@orca-so/whirlpools-client');
  vi.spyOn(whirlpoolsClient, 'getPositionAddress').mockResolvedValue([
    'DerivedPositionPDA11111111111111111111111111' as unknown as Parameters<typeof whirlpoolsClient.getPositionAddress>[0],
    0,
  ] as unknown as Awaited<ReturnType<typeof whirlpoolsClient.getPositionAddress>>);

  vi.spyOn(whirlpoolsClient, 'fetchPosition').mockResolvedValue({
    address: 'DerivedPositionPDA11111111111111111111111111',
    data: {
      whirlpool: mockWhirlpoolAddress,
      tickLowerIndex: -100,
      tickUpperIndex: 100,
      positionMint: mockPositionMint,
    },
  } as unknown as Awaited<ReturnType<typeof whirlpoolsClient.fetchPosition>>);

  vi.spyOn(whirlpoolsClient, 'fetchWhirlpool').mockResolvedValue({
    data: {
      tickCurrentIndex: 50,
    },
  } as unknown as Awaited<ReturnType<typeof whirlpoolsClient.fetchWhirlpool>>);

  const result = await internal.fetchPositionData(mockRpc, mockPositionMint, MOCK_WALLET);

  expect(result).not.toBeNull();
  // The critical assertion: walletId must be the real wallet, not the position mint
  expect(result!.walletId).toBe(MOCK_WALLET);
  expect(result!.walletId).not.toBe(mockPositionMint);
});
```

You will also need to add `import type { WalletId } from '@clmm/domain';` at the top if not already imported (it is already imported on line 3).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts -t "fetchPositionData returns the real walletId"`

Expected: FAIL — the current implementation ignores the `walletId` parameter (it doesn't even accept one) and returns `position.positionMint.toString()` as the walletId. The test will fail because `fetchPositionData` currently only takes 2 arguments, so the third argument is ignored, and the returned `walletId` will equal `mockPositionMint` instead of `MOCK_WALLET`.

Note: If the test fails with a different error (e.g., TypeScript compile error because `fetchPositionData` doesn't accept 3 args), that is also a valid failure that confirms the bug — proceed to the fix.

---

## Task 2: Fix the Bug

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts` (lines 77, 124, 145)

- [ ] **Step 3: Add `walletId` parameter to `fetchPositionData()`**

In `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts`, change the method signature at line 124:

```typescript
// Before (line 124):
private async fetchPositionData(rpc: ReturnType<typeof createSolanaRpc>, positionId: PositionId): Promise<LiquidityPosition | null> {

// After:
private async fetchPositionData(rpc: ReturnType<typeof createSolanaRpc>, positionId: PositionId, walletId: WalletId): Promise<LiquidityPosition | null> {
```

- [ ] **Step 4: Use the real `walletId` in the returned object**

In the same file, change line 145:

```typescript
// Before (line 145):
        walletId: position.positionMint.toString() as WalletId,

// After:
        walletId,
```

- [ ] **Step 5: Update the call site in `prepareExecution()`**

In the same file, change line 77:

```typescript
// Before (line 77):
    const positionData = await this.fetchPositionData(rpc, positionId);

// After:
    const positionData = await this.fetchPositionData(rpc, positionId, walletId);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts`

Expected: ALL tests PASS. The new test should now pass because `fetchPositionData` uses the real `walletId` parameter instead of fabricating one from the position mint. The existing Jupiter fallback test should also still pass (it tests `buildSwapInstructions`, not `fetchPositionData`).

- [ ] **Step 7: Run the full adapter test suite**

Run: `cd packages/adapters && npx vitest run`

Expected: ALL tests PASS. This change is fully backward-compatible — no other code calls `fetchPositionData` (it is a private method), and the only caller (`prepareExecution`) already has the `walletId` value.

- [ ] **Step 8: Typecheck**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors. The `walletId` variable is already typed as `WalletId` in `prepareExecution` (destructured from `params` at line 67), so passing it to `fetchPositionData` is type-safe.

- [ ] **Step 9: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
git commit -m "fix(adapters): thread real walletId into fetchPositionData instead of using position mint

The returned LiquidityPosition.walletId was set to position.positionMint (the NFT
mint address), not the actual wallet address. prepareExecution() already has the
real walletId — this patch threads it through."
```
