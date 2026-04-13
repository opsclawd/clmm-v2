# Design: walletId Contamination Fix in `fetchPositionData()`

**Date:** 2026-04-13
**Status:** Draft

---

## Problem

In `SolanaExecutionPreparationAdapter.fetchPositionData()` at line 145:

```typescript
walletId: position.positionMint.toString() as WalletId,
```

The returned `LiquidityPosition.walletId` is set to the position mint address, not the actual wallet address. The position mint is a token mint that identifies the position NFT — it is not a wallet. The field is typed as `WalletId` (a branded string), so the `as WalletId` cast silently launders incorrect data into the domain model.

This is a domain contamination bug in money-adjacent code. The `LiquidityPosition` object is passed to downstream logic that may trust `walletId` to be a real wallet address for ownership verification, history correlation, or execution authorization.

## Root Cause

`fetchPositionData()` fetches a position by its mint address. The Orca position account data contains the position's tick bounds, whirlpool reference, and position mint — but it does not directly contain "which wallet owns this." The method needed a `walletId` to populate the `LiquidityPosition` struct, did not have one, and fabricated it from the mint.

Meanwhile, `prepareExecution()` — the only caller — already has the real `walletId` as a parameter:

```typescript
async prepareExecution(params: {
  plan: ExecutionPlan;
  walletId: WalletId;    // ← the real wallet ID is right here
  positionId: PositionId;
})
```

It just never passes it through to `fetchPositionData()`.

## Goals

- Eliminate the data contamination: `LiquidityPosition.walletId` must contain the actual wallet address, not the position mint.
- Minimal patch: fix the bug in the smallest possible diff, independent of any broader refactor.

## Non-Goals

- Extracting `fetchPositionData()` into a shared module (that is part of the Solana read path efficiency design and happens in a subsequent commit).
- Adding ownership verification to `fetchPositionData()` (that is also part of the shared position snapshot reader design).
- Changing the `ExecutionPreparationPort` interface.

---

## Design

### Fix

Three lines changed:

**1. Add `walletId` parameter to `fetchPositionData()`:**

```typescript
// Before:
private async fetchPositionData(
  rpc: ReturnType<typeof createSolanaRpc>,
  positionId: PositionId,
): Promise<LiquidityPosition | null>

// After:
private async fetchPositionData(
  rpc: ReturnType<typeof createSolanaRpc>,
  positionId: PositionId,
  walletId: WalletId,
): Promise<LiquidityPosition | null>
```

**2. Use the real `walletId` in the returned object:**

```typescript
// Before (line 145):
walletId: position.positionMint.toString() as WalletId,

// After:
walletId,
```

**3. Update the call site in `prepareExecution()`:**

```typescript
// Before (line 77):
const positionData = await this.fetchPositionData(rpc, positionId);

// After:
const positionData = await this.fetchPositionData(rpc, positionId, walletId);
```

### Scope Boundary

This fix is deliberately minimal. It does not:

- Extract `fetchPositionData()` into a shared module.
- Add ownership verification.
- Change any port interface.
- Touch any other adapter or caller.

The extraction into `SolanaPositionSnapshotReader` happens in the Solana read path efficiency work. This patch lands first as its own commit so the correctness bug is fixed immediately and independently. Blocking a money-related correctness bug on a broader extraction is the wrong sequencing.

---

## Error Handling

No change. The method's existing error handling (try/catch returning `null`) is unaffected.

## Testing

- Update `SolanaExecutionPreparationAdapter.test.ts`: verify that the `LiquidityPosition` returned through `prepareExecution()` has `walletId` equal to the wallet address passed in, not the position mint address.
- Add an explicit assertion: `expect(result.walletId).toBe(testWalletId)` and `expect(result.walletId).not.toBe(positionMint)`.

## Risk

Extremely low. Three lines changed. Fully backward-compatible. The only caller already has the correct value. No interface changes. No behavioral changes except the `walletId` field now contains the right data.

## Sequencing

This patch lands as its own commit before the Solana read path efficiency refactor. The subsequent refactor (extracting `fetchPositionData()` into `SolanaPositionSnapshotReader`) consumes the corrected method and lifts it out. Two commits, one-layer-per-commit discipline, clean diffs.
