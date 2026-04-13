# Solana Read Path Efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate redundant sequential Solana RPC calls by extracting a shared `SolanaPositionSnapshotReader`, making `getPosition()` a direct 2-3 RPC fetch instead of a full wallet scan, batching whirlpool fetches in `listSupportedPositions()`, making `listActionableTriggers()` a pure DB operation, and writing ownership records at scan time.

**Architecture:** Extract `SolanaPositionSnapshotReader` with `fetchSinglePosition()` (direct position lookup with ownership verification) and `fetchWhirlpoolsBatched()` (deduplicated concurrent whirlpool fetcher). Refactor `OrcaPositionReadAdapter` to use the reader. Refactor `OperationalStorageAdapter.listActionableTriggers()` to query `wallet_position_ownership` instead of hitting the chain. Add scan-time ownership writes. Extract `SolanaExecutionPreparationAdapter.fetchPositionData()` to use the shared reader (after Issue 3 walletId patch lands). Update `AdaptersModule.ts` wiring.

**Tech Stack:** TypeScript, Vitest, @solana/kit v6, @orca-so/whirlpools-client, @orca-so/whirlpools, Drizzle ORM (pg), NestJS DI

**Prerequisite:** Issue 3 (walletId contamination fix) must be merged before Task 6. Tasks 1-5 can proceed independently.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts` | Create | Shared reader: `fetchSinglePosition()` and `fetchWhirlpoolsBatched()` |
| `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts` | Create | Unit tests for the shared reader |
| `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts` | Modify | Refactor `getPosition()` and `listSupportedPositions()` to use the reader |
| `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts` | Modify | Update tests for new behavior |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | Modify (lines 1-3, 36-43, 320-353) | Remove `positionReadPort`, use `wallet_position_ownership` for trigger listing |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.test.ts` | Modify | Update tests for DB-only trigger listing |
| `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts` | Modify (add method) | Add scan-time `wallet_position_ownership` writes in `listSupportedPositions()` |
| `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts` | Modify (lines 124-156) | Replace `fetchPositionData()` with shared reader call |
| `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts` | Modify | Update tests for shared reader consumption |
| `packages/adapters/src/composition/AdaptersModule.ts` | Modify (lines 49-57) | Rewire dependencies |
| `packages/adapters/src/index.ts` | Modify | Export `SolanaPositionSnapshotReader` |

---

## Task 1: Create `SolanaPositionSnapshotReader` with `fetchSinglePosition()`

**Files:**
- Create: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
- Create: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

- [ ] **Step 1: Write failing tests for `fetchSinglePosition()`**

Create `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WalletId, PositionId } from '@clmm/domain';

vi.mock('@orca-so/whirlpools-client', () => ({
  getPositionAddress: vi.fn(),
  fetchPosition: vi.fn(),
  fetchWhirlpool: vi.fn(),
}));

vi.mock('@solana/kit', () => ({
  createSolanaRpc: vi.fn(() => ({})),
  address: vi.fn((s: string) => s),
}));

const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION_MINT = '2Wgh4mq6rp1q6H1G6K3ZsR3LBdqT5qVJb5KfF3U7Y2hX';
const MOCK_WHIRLPOOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
const MOCK_POSITION_PDA = 'DerivedPositionPDA11111111111111111111111111';

describe('SolanaPositionSnapshotReader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchSinglePosition', () => {
    it('returns a LiquidityPosition with the real walletId when ownership is confirmed', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');

      vi.mocked(getPositionAddress).mockResolvedValue([MOCK_POSITION_PDA, 0] as never);

      vi.mocked(fetchPosition).mockResolvedValue({
        address: MOCK_POSITION_PDA,
        data: {
          whirlpool: MOCK_WHIRLPOOL,
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: MOCK_POSITION_MINT,
        },
      } as never);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: {
          tickCurrentIndex: -18130,
        },
      } as never);

      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');

      // Mock the ownership verification — the reader checks that the wallet holds the position mint
      const mockRpc = reader['getRpc']();
      vi.spyOn(reader as any, 'verifyOwnership').mockResolvedValue(true);

      const result = await reader.fetchSinglePosition(
        mockRpc,
        MOCK_POSITION_MINT as PositionId,
        MOCK_WALLET,
      );

      expect(result).not.toBeNull();
      expect(result!.walletId).toBe(MOCK_WALLET);
      expect(result!.positionId).toBe(MOCK_POSITION_MINT);
      expect(result!.rangeState.kind).toBe('in-range');
      expect(result!.bounds.lowerBound).toBe(-18304);
      expect(result!.bounds.upperBound).toBe(-17956);
    });

    it('returns null when ownership verification fails', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');

      vi.mocked(getPositionAddress).mockResolvedValue([MOCK_POSITION_PDA, 0] as never);

      vi.mocked(fetchPosition).mockResolvedValue({
        address: MOCK_POSITION_PDA,
        data: {
          whirlpool: MOCK_WHIRLPOOL,
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: MOCK_POSITION_MINT,
        },
      } as never);

      vi.mocked(fetchWhirlpool).mockResolvedValue({
        data: { tickCurrentIndex: -18130 },
      } as never);

      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
      vi.spyOn(reader as any, 'verifyOwnership').mockResolvedValue(false);

      const result = await reader.fetchSinglePosition(
        reader['getRpc'](),
        MOCK_POSITION_MINT as PositionId,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
    });

    it('returns null when position is not found', async () => {
      const { getPositionAddress, fetchPosition } = await import('@orca-so/whirlpools-client');
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');

      vi.mocked(getPositionAddress).mockResolvedValue([MOCK_POSITION_PDA, 0] as never);
      vi.mocked(fetchPosition).mockRejectedValue(new Error('Account not found'));

      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');

      const result = await reader.fetchSinglePosition(
        reader['getRpc'](),
        MOCK_POSITION_MINT as PositionId,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
    });

    it('returns null when whirlpool fetch fails', async () => {
      const { getPositionAddress, fetchPosition, fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');

      vi.mocked(getPositionAddress).mockResolvedValue([MOCK_POSITION_PDA, 0] as never);

      vi.mocked(fetchPosition).mockResolvedValue({
        address: MOCK_POSITION_PDA,
        data: {
          whirlpool: MOCK_WHIRLPOOL,
          tickLowerIndex: -18304,
          tickUpperIndex: -17956,
          positionMint: MOCK_POSITION_MINT,
        },
      } as never);

      vi.mocked(fetchWhirlpool).mockRejectedValue(new Error('Network error'));

      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');

      const result = await reader.fetchSinglePosition(
        reader['getRpc'](),
        MOCK_POSITION_MINT as PositionId,
        MOCK_WALLET,
      );

      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/adapters && npx vitest run src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

Expected: FAIL — `SolanaPositionSnapshotReader` does not exist yet. The import will fail with a module-not-found error.

- [ ] **Step 3: Implement `SolanaPositionSnapshotReader` with `fetchSinglePosition()`**

Create `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`:

```typescript
import { createSolanaRpc, address } from '@solana/kit';
import { getPositionAddress, fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';

import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import { makePositionId, makePoolId, makeClockTimestamp, evaluateRangeState } from '@clmm/domain';

export class SolanaPositionSnapshotReader {
  constructor(private readonly rpcUrl: string) {}

  getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async fetchSinglePosition(
    rpc: ReturnType<typeof createSolanaRpc>,
    positionId: PositionId,
    walletId: WalletId,
  ): Promise<LiquidityPosition | null> {
    try {
      const positionMint = address(positionId);
      const [positionAddress] = await getPositionAddress(positionMint);
      const positionAccount = await fetchPosition(rpc, positionAddress);
      const position = positionAccount.data;

      const isOwner = await this.verifyOwnership(rpc, walletId, positionId);
      if (!isOwner) {
        return null;
      }

      const whirlpoolAddress = position.whirlpool;
      const whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
      const whirlpool = whirlpoolAccount.data;

      const bounds = {
        lowerBound: position.tickLowerIndex,
        upperBound: position.tickUpperIndex,
      };

      const currentTick = whirlpool.tickCurrentIndex;
      const rangeState = evaluateRangeState(bounds, currentTick);

      return {
        positionId,
        walletId,
        poolId: makePoolId(whirlpoolAddress.toString()),
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      };
    } catch {
      return null;
    }
  }

  /**
   * Verifies that `walletId` owns the position mint NFT by checking
   * the wallet's token accounts for the position mint.
   *
   * Uses `getTokenAccountsByOwner` filtered by the position mint.
   * Returns true if at least one token account exists with a non-zero balance.
   * Cost: 1 RPC call.
   */
  async verifyOwnership(
    rpc: ReturnType<typeof createSolanaRpc>,
    walletId: WalletId,
    positionId: PositionId,
  ): Promise<boolean> {
    try {
      const ownerAddress = address(walletId);
      const mintAddress = address(positionId);

      const response = await rpc
        .getTokenAccountsByOwner(
          ownerAddress,
          { mint: mintAddress },
          { encoding: 'jsonParsed' },
        )
        .send();

      return response.value.length > 0;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

Expected: ALL 4 tests PASS.

- [ ] **Step 5: Typecheck**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
git commit -m "feat(adapters): add SolanaPositionSnapshotReader with fetchSinglePosition

Shared server-side position read primitive. Direct single-position fetch
with explicit ownership verification via getTokenAccountsByOwner. Cost:
2-3 RPC calls instead of 1+N full wallet scan."
```

---

## Task 2: Add `fetchWhirlpoolsBatched()` to `SolanaPositionSnapshotReader`

**Files:**
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

- [ ] **Step 7: Write failing tests for `fetchWhirlpoolsBatched()`**

Add to the existing `describe('SolanaPositionSnapshotReader', ...)` block in `SolanaPositionSnapshotReader.test.ts`:

```typescript
  describe('fetchWhirlpoolsBatched', () => {
    it('deduplicates whirlpool addresses and fetches each once', async () => {
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');

      const pool1 = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
      const pool2 = '9w7A9sXjC8eGdxzpcM8f7mPy8tLQGvY1z9WnK3m2LcQa';

      vi.mocked(fetchWhirlpool).mockImplementation(async (_rpc, addr) => {
        const addrStr = addr.toString();
        return {
          data: {
            tickCurrentIndex: addrStr === pool1 ? -18130 : 500,
          },
        } as never;
      });

      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
      const rpc = reader.getRpc();

      // Pass 5 addresses with only 2 unique
      const result = await reader.fetchWhirlpoolsBatched(rpc, [
        pool1, pool1, pool2, pool1, pool2,
      ]);

      expect(result.size).toBe(2);
      expect(result.get(pool1)!.tickCurrentIndex).toBe(-18130);
      expect(result.get(pool2)!.tickCurrentIndex).toBe(500);

      // fetchWhirlpool should have been called exactly 2 times (deduped)
      expect(fetchWhirlpool).toHaveBeenCalledTimes(2);
    });

    it('omits whirlpools that fail to fetch', async () => {
      const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');

      const pool1 = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm';
      const pool2 = '9w7A9sXjC8eGdxzpcM8f7mPy8tLQGvY1z9WnK3m2LcQa';

      vi.mocked(fetchWhirlpool).mockImplementation(async (_rpc, addr) => {
        if (addr.toString() === pool2) {
          throw new Error('Network error');
        }
        return {
          data: { tickCurrentIndex: -18130 },
        } as never;
      });

      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
      const rpc = reader.getRpc();

      const result = await reader.fetchWhirlpoolsBatched(rpc, [pool1, pool2]);

      expect(result.size).toBe(1);
      expect(result.has(pool1)).toBe(true);
      expect(result.has(pool2)).toBe(false);
    });

    it('returns empty map for empty input', async () => {
      const { SolanaPositionSnapshotReader } = await import('./SolanaPositionSnapshotReader');
      const reader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
      const rpc = reader.getRpc();

      const result = await reader.fetchWhirlpoolsBatched(rpc, []);

      expect(result.size).toBe(0);
    });
  });
```

- [ ] **Step 8: Run the tests to verify the new tests fail**

Run: `cd packages/adapters && npx vitest run src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

Expected: FAIL — `fetchWhirlpoolsBatched` does not exist on `SolanaPositionSnapshotReader`.

- [ ] **Step 9: Implement `fetchWhirlpoolsBatched()`**

Add this method to the `SolanaPositionSnapshotReader` class in `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`:

```typescript
  async fetchWhirlpoolsBatched(
    rpc: ReturnType<typeof createSolanaRpc>,
    whirlpoolAddresses: string[],
  ): Promise<Map<string, { tickCurrentIndex: number }>> {
    const uniqueAddresses = [...new Set(whirlpoolAddresses)];
    const results = new Map<string, { tickCurrentIndex: number }>();

    if (uniqueAddresses.length === 0) {
      return results;
    }

    const fetches = uniqueAddresses.map(async (addr) => {
      try {
        const whirlpoolAccount = await fetchWhirlpool(rpc, address(addr));
        results.set(addr, { tickCurrentIndex: whirlpoolAccount.data.tickCurrentIndex });
      } catch {
        // Skip failed fetches — positions referencing this pool will be excluded
      }
    });

    await Promise.all(fetches);
    return results;
  }
```

- [ ] **Step 10: Run all reader tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`

Expected: ALL 7 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts
git commit -m "feat(adapters): add fetchWhirlpoolsBatched to SolanaPositionSnapshotReader

Deduplicates whirlpool addresses and fetches all unique pools concurrently
via Promise.all. Partial failures are silently skipped. Reduces wallet-wide
scan from O(N) sequential to O(unique pools) concurrent RPC calls."
```

---

## Task 3: Refactor `OrcaPositionReadAdapter` to Use the Shared Reader

**Files:**
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts` (lines 101-149)
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`

- [ ] **Step 12: Add `SolanaPositionSnapshotReader` dependency to `OrcaPositionReadAdapter`**

In `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`, change the constructor:

```typescript
// Before (line 25):
export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  constructor(private readonly rpcUrl: string) {}

// After:
export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
  ) {}
```

Add the import at the top of the file (after the existing imports):

```typescript
import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader.js';
```

- [ ] **Step 13: Refactor `getPosition()` to use `fetchSinglePosition()`**

In the same file, replace the `getPosition` method (lines 146-149):

```typescript
// Before:
  async getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null> {
    const positions = await this.listSupportedPositions(walletId);
    return positions.find((position) => position.positionId === positionId) ?? null;
  }

// After:
  async getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null> {
    const rpc = this.getRpc();
    return this.snapshotReader.fetchSinglePosition(rpc, positionId, walletId);
  }
```

- [ ] **Step 14: Refactor `listSupportedPositions()` to use `fetchWhirlpoolsBatched()`**

In the same file, replace the `listSupportedPositions` method body (lines 101-144):

```typescript
  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    const rpc = this.getRpc();
    const ownerAddress = this.walletIdToAddress(walletId);

    const positions = await fetchPositionsForOwner(rpc, ownerAddress);

    const allEntries: Array<{
      whirlpool: string;
      tickLowerIndex: number;
      tickUpperIndex: number;
      positionMint: string;
    }> = [];

    for (const positionData of positions) {
      for (const entry of this.getOwnedPositionEntries(positionData)) {
        allEntries.push({
          whirlpool: entry.whirlpool.toString(),
          tickLowerIndex: entry.tickLowerIndex,
          tickUpperIndex: entry.tickUpperIndex,
          positionMint: entry.positionMint.toString(),
        });
      }
    }

    const whirlpoolAddresses = allEntries.map((e) => e.whirlpool);
    const whirlpoolMap = await this.snapshotReader.fetchWhirlpoolsBatched(rpc, whirlpoolAddresses);

    const liquidityPositions: LiquidityPosition[] = [];

    for (const entry of allEntries) {
      const whirlpoolData = whirlpoolMap.get(entry.whirlpool);
      if (!whirlpoolData) {
        continue;
      }

      const poolId = makePoolId(entry.whirlpool);
      const positionId = makePositionId(entry.positionMint);

      const bounds = {
        lowerBound: entry.tickLowerIndex,
        upperBound: entry.tickUpperIndex,
      };

      const currentTick = whirlpoolData.tickCurrentIndex;
      const rangeState = evaluateRangeState(bounds, currentTick);

      liquidityPositions.push({
        positionId,
        walletId,
        poolId,
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      });
    }

    return liquidityPositions;
  }
```

- [ ] **Step 15: Update the `OrcaPositionReadAdapter` tests**

In `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`, update the test file to provide a `SolanaPositionSnapshotReader` instance to the constructor and update the `getPosition` tests.

Add a mock for the snapshot reader module at the top (after existing mocks):

```typescript
vi.mock('./SolanaPositionSnapshotReader', () => {
  return {
    SolanaPositionSnapshotReader: vi.fn().mockImplementation(() => ({
      fetchSinglePosition: vi.fn(),
      fetchWhirlpoolsBatched: vi.fn(),
      getRpc: vi.fn(() => ({})),
    })),
  };
});
```

Add the import:

```typescript
import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader';
```

Change every `new OrcaPositionReadAdapter(mockRpcUrl)` in the `listSupportedPositions` tests to pass a mock reader:

```typescript
const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
```

For the `listSupportedPositions` tests, the mock reader's `fetchWhirlpoolsBatched` must return the whirlpool data. Update the mock before each `listSupportedPositions` test:

```typescript
vi.mocked(mockReader.fetchWhirlpoolsBatched).mockResolvedValue(
  new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
);
const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader);
```

For the `getPosition` tests, replace the existing tests with:

```typescript
  describe('getPosition', () => {
    it('delegates to fetchSinglePosition on the snapshot reader', async () => {
      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      vi.mocked(mockReader.fetchSinglePosition).mockResolvedValue({
        positionId: makePositionId(MOCK_POSITION_MINT),
        walletId: MOCK_WALLET,
        poolId: MOCK_WHIRLPOOL as any,
        bounds: { lowerBound: -18304, upperBound: -17956 },
        lastObservedAt: 1_000_000 as any,
        rangeState: { kind: 'in-range', currentPrice: -18130 },
        monitoringReadiness: { kind: 'active' },
      });

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader);
      const result = await adapter.getPosition(MOCK_WALLET, makePositionId(MOCK_POSITION_MINT));

      expect(result).not.toBeNull();
      expect(result?.walletId).toBe(MOCK_WALLET);
      expect(mockReader.fetchSinglePosition).toHaveBeenCalledOnce();
    });

    it('returns null when fetchSinglePosition returns null', async () => {
      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      vi.mocked(mockReader.fetchSinglePosition).mockResolvedValue(null);

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader);
      const result = await adapter.getPosition(
        MOCK_WALLET,
        makePositionId('9w7A9sXjC8eGdxzpcM8f7mPy8tLQGvY1z9WnK3m2LcQa'),
      );

      expect(result).toBeNull();
    });
  });
```

- [ ] **Step 16: Run all adapter tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/solana-position-reads/`

Expected: ALL tests PASS across both test files.

- [ ] **Step 17: Typecheck**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: Type errors only for `AdaptersModule.ts` (because `OrcaPositionReadAdapter` constructor now requires a second argument). This is expected and will be fixed in Task 7.

- [ ] **Step 18: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts
git commit -m "refactor(adapters): OrcaPositionReadAdapter uses SolanaPositionSnapshotReader

getPosition() now calls fetchSinglePosition (2-3 RPC) instead of
listSupportedPositions + filter (1+N RPC). listSupportedPositions()
uses fetchWhirlpoolsBatched for concurrent deduped whirlpool fetches."
```

---

## Task 4: Refactor `OperationalStorageAdapter.listActionableTriggers()` to Use DB-Only Lookup

**Files:**
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` (lines 1-3, 36-43, 320-353)
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.test.ts`

- [ ] **Step 19: Write failing tests for the DB-only trigger listing**

In `packages/adapters/src/outbound/storage/OperationalStorageAdapter.test.ts`, add new tests and update the mock DB to support `wallet_position_ownership` queries:

Replace the `WalletScopedPositionReadPort` class and `makeDbWithTriggerRows` function, and update the tests. The key change: instead of passing a `SupportedPositionReadPort`, the adapter now queries `wallet_position_ownership` directly.

First, update the import to remove `SupportedPositionReadPort`:

```typescript
// Before:
import type { SupportedPositionReadPort } from '@clmm/application';

// After: (remove this import entirely)
```

Replace the `WalletScopedPositionReadPort` class (lines 11-24) with nothing — delete it entirely.

Replace `makeDbWithTriggerRows` to also support `wallet_position_ownership` queries:

```typescript
function makeDbWithTriggerRows(params: {
  ownershipRows: Array<{ walletId: string; positionId: string; firstSeenAt: number; lastSeenAt: number }>;
  triggerRows: Array<{
    triggerId: string;
    positionId: string;
    episodeId: string;
    directionKind: string;
    triggeredAt: number;
    confirmationEvaluatedAt: number;
    episodeStatus?: string;
  }>;
}): Db {
  function predicateReferencesOpenEpisodeFilter(value: unknown): boolean {
    const visited = new WeakSet<object>();
    function walk(node: unknown): boolean {
      if (node == null) return false;
      if (typeof node === 'string') {
        return node === 'open';
      }
      if (typeof node !== 'object') return false;
      if (visited.has(node)) return false;
      visited.add(node);

      const record = node as Record<string, unknown>;
      const table = record['table'];
      const name = record['name'];
      if (
        typeof name === 'string' &&
        name === 'status' &&
        typeof table === 'object' &&
        table != null &&
        (table as { name?: unknown }).name === 'breach_episodes'
      ) {
        return true;
      }

      const queryChunks = record['queryChunks'];
      if (Array.isArray(queryChunks) && queryChunks.some((chunk) => walk(chunk))) {
        return true;
      }

      return Object.values(record).some((entry) => walk(entry));
    }

    return walk(value);
  }

  let selectCallCount = 0;

  return {
    select() {
      selectCallCount++;
      return {
        from(table: unknown) {
          const tableName = (table as { name?: string })?.name ??
            ((table as Record<string, unknown>)[Symbol.for('drizzle:Name')] as string | undefined) ?? '';

          // First select call in listActionableTriggers queries wallet_position_ownership
          if (selectCallCount === 1 || tableName === 'wallet_position_ownership') {
            return {
              where: async () => params.ownershipRows,
            };
          }

          // Second select call queries exit_triggers joined with breach_episodes
          return {
            innerJoin: () => ({
              where: async (predicate: unknown) => (
                predicateReferencesOpenEpisodeFilter(predicate)
                  ? params.triggerRows.filter((row) => row.episodeStatus === 'open')
                  : params.triggerRows
              ),
            }),
          };
        },
      };
    },
  } as unknown as Db;
}
```

Update the existing tests. Replace the first test:

```typescript
  it('scopes actionable triggers to positions owned by the requested wallet via DB lookup', async () => {
    const adapter = new OperationalStorageAdapter(
      makeDbWithTriggerRows({
        ownershipRows: [
          {
            walletId: FIXTURE_WALLET_ID,
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            firstSeenAt: 1_000_000,
            lastSeenAt: 1_000_000,
          },
        ],
        triggerRows: [
          {
            triggerId: 'trigger-owned',
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            episodeId: 'episode-owned',
            directionKind: 'lower-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_000),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
            episodeStatus: 'open',
          },
          {
            triggerId: 'trigger-leaked',
            positionId: leakedPositionId,
            episodeId: 'episode-leaked',
            directionKind: 'upper-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_002),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_003),
            episodeStatus: 'open',
          },
        ],
      }),
      new FakeIdGeneratorPort('storage'),
    );

    const triggers = await adapter.listActionableTriggers(FIXTURE_WALLET_ID);

    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.triggerId).toBe('trigger-owned');
    expect(triggers[0]?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
  });
```

Update the second test similarly (remove `positionReadPort`), and update the `makeDbForFinalizeQualification` usages to remove the third constructor argument.

Also add:

```typescript
  it('returns empty array when no ownership rows exist for the wallet', async () => {
    const adapter = new OperationalStorageAdapter(
      makeDbWithTriggerRows({
        ownershipRows: [],
        triggerRows: [
          {
            triggerId: 'trigger-orphan',
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            episodeId: 'episode-orphan',
            directionKind: 'lower-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_000),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
            episodeStatus: 'open',
          },
        ],
      }),
      new FakeIdGeneratorPort('storage'),
    );

    const triggers = await adapter.listActionableTriggers(FIXTURE_WALLET_ID);

    expect(triggers).toHaveLength(0);
  });
```

- [ ] **Step 20: Run the tests to verify they fail**

Run: `cd packages/adapters && npx vitest run src/outbound/storage/OperationalStorageAdapter.test.ts`

Expected: FAIL — `OperationalStorageAdapter` constructor still requires 3 arguments (including `positionReadPort`).

- [ ] **Step 21: Implement the DB-only `listActionableTriggers()` refactor**

In `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`:

**Remove the `SupportedPositionReadPort` import** from line 13:

```typescript
// Before:
import type {
  BreachEpisodeRepository,
  EpisodeTransition,
  FinalizationResult,
  TriggerRepository,
  ExecutionRepository,
  ExecutionSessionRepository,
  IdGeneratorPort,
  SupportedPositionReadPort,
  StoredExecutionAttempt,
} from '@clmm/application';

// After:
import type {
  BreachEpisodeRepository,
  EpisodeTransition,
  FinalizationResult,
  TriggerRepository,
  ExecutionRepository,
  ExecutionSessionRepository,
  IdGeneratorPort,
  StoredExecutionAttempt,
} from '@clmm/application';
```

**Add the `walletPositionOwnership` import** to the schema imports (line 3):

```typescript
// Before:
import { breachEpisodes, exitTriggers, executionAttempts, executionSessions, executionPreviews, preparedPayloads } from './schema/index.js';

// After:
import { breachEpisodes, exitTriggers, executionAttempts, executionSessions, executionPreviews, preparedPayloads, walletPositionOwnership } from './schema/index.js';
```

**Remove `positionReadPort` from the constructor** (lines 39-43):

```typescript
// Before:
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

// After:
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
  ) {}
```

**Replace `listActionableTriggers()`** (lines 320-353):

```typescript
  async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    const ownershipRows = await this.db
      .select()
      .from(walletPositionOwnership)
      .where(eq(walletPositionOwnership.walletId, walletId));

    const positionIds = ownershipRows.map((row) => row.positionId);
    if (positionIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select({
        triggerId: exitTriggers.triggerId,
        positionId: exitTriggers.positionId,
        episodeId: exitTriggers.episodeId,
        directionKind: exitTriggers.directionKind,
        triggeredAt: exitTriggers.triggeredAt,
        confirmationEvaluatedAt: exitTriggers.confirmationEvaluatedAt,
      })
      .from(exitTriggers)
      .innerJoin(breachEpisodes, eq(exitTriggers.episodeId, breachEpisodes.episodeId))
      .where(and(
        inArray(exitTriggers.positionId, positionIds),
        eq(breachEpisodes.status, 'open'),
      ));

    const ownedPositionIds = new Set(positionIds);
    return rows.map((row) => ({
      triggerId: row.triggerId as ExitTriggerId,
      positionId: row.positionId as PositionId,
      episodeId: row.episodeId as BreachEpisodeId,
      breachDirection: directionFromKind(row.directionKind),
      triggeredAt: makeClockTimestamp(row.triggeredAt),
      confirmationEvaluatedAt: makeClockTimestamp(row.confirmationEvaluatedAt),
      confirmationPassed: true as const,
    })).filter((trigger) => ownedPositionIds.has(trigger.positionId));
  }
```

- [ ] **Step 22: Run the tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/storage/OperationalStorageAdapter.test.ts`

Expected: ALL tests PASS.

- [ ] **Step 23: Commit**

```bash
git add packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts packages/adapters/src/outbound/storage/OperationalStorageAdapter.test.ts
git commit -m "refactor(adapters): listActionableTriggers uses wallet_position_ownership, not on-chain reads

Removes SupportedPositionReadPort dependency from OperationalStorageAdapter.
Trigger listing is now a pure DB operation: query wallet_position_ownership
for position IDs, then query exit_triggers. Zero RPC calls."
```

---

## Task 5: Add Scan-Time Ownership Writes to `listSupportedPositions()`

**Files:**
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`

- [ ] **Step 24: Add `Db` dependency to `OrcaPositionReadAdapter` for ownership writes**

In `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`, change the constructor to also accept a `Db` instance and the `walletPositionOwnership` schema:

```typescript
// Before:
import type { SupportedPositionReadPort } from '@clmm/application';

// After:
import type { SupportedPositionReadPort } from '@clmm/application';
import type { Db } from '../storage/db.js';
import { walletPositionOwnership } from '../storage/schema/index.js';
```

Update the constructor:

```typescript
// Before:
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
  ) {}

// After:
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
    private readonly db: Db,
  ) {}
```

- [ ] **Step 25: Add scan-time ownership upsert to `listSupportedPositions()`**

At the end of `listSupportedPositions()`, after building `liquidityPositions`, add ownership upsert logic before the return statement:

```typescript
    // Upsert wallet_position_ownership for every position found in this scan
    const now = Date.now();
    for (const position of liquidityPositions) {
      await this.db
        .insert(walletPositionOwnership)
        .values({
          walletId,
          positionId: position.positionId,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
          set: { lastSeenAt: now },
        });
    }

    return liquidityPositions;
```

- [ ] **Step 26: Add a test for scan-time ownership writes**

In `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`, add a new test:

```typescript
  describe('scan-time ownership writes', () => {
    it('upserts wallet_position_ownership for each position found during listSupportedPositions', async () => {
      const { fetchPositionsForOwner } = await import('@orca-so/whirlpools');

      vi.mocked(fetchPositionsForOwner).mockResolvedValue([
        {
          address: 'PositionAddress123456789012345678901234',
          isPositionBundle: false,
          data: {
            whirlpool: MOCK_WHIRLPOOL,
            tickLowerIndex: -18304,
            tickUpperIndex: -17956,
            positionMint: MOCK_POSITION_MINT,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);

      const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
      vi.mocked(mockReader.fetchWhirlpoolsBatched).mockResolvedValue(
        new Map([[MOCK_WHIRLPOOL, { tickCurrentIndex: -18130 }]]),
      );

      const upsertedRows: Array<{ walletId: string; positionId: string }> = [];
      const mockDb = {
        insert: () => ({
          values: (row: { walletId: string; positionId: string }) => {
            upsertedRows.push(row);
            return {
              onConflictDoUpdate: () => Promise.resolve(),
            };
          },
        }),
      };

      const adapter = new OrcaPositionReadAdapter(mockRpcUrl, mockReader, mockDb as never);
      await adapter.listSupportedPositions(MOCK_WALLET);

      expect(upsertedRows).toHaveLength(1);
      expect(upsertedRows[0]!.walletId).toBe(MOCK_WALLET);
      expect(upsertedRows[0]!.positionId).toBe(MOCK_POSITION_MINT);
    });
  });
```

- [ ] **Step 27: Run tests to verify they pass**

Run: `cd packages/adapters && npx vitest run src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`

Expected: ALL tests PASS.

- [ ] **Step 28: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts
git commit -m "feat(adapters): write wallet_position_ownership at scan time in listSupportedPositions

Ensures wallet_position_ownership reflects current on-chain state from
wallet scans, not just execution approvals. Required for the DB-only
trigger listing in OperationalStorageAdapter to be reliable."
```

---

## Task 6: Extract `SolanaExecutionPreparationAdapter.fetchPositionData()` to Use Shared Reader

**Prerequisite:** Issue 3 (walletId contamination fix) must be merged first. After that patch, `fetchPositionData` accepts `(rpc, positionId, walletId)`.

**Files:**
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts` (lines 33, 52-53, 77, 124-156, 158-169)
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts`

- [ ] **Step 29: Replace `fetchPositionData()` with shared reader consumption**

In `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts`:

**Add the import** for the shared reader:

```typescript
import { SolanaPositionSnapshotReader } from '../solana-position-reads/SolanaPositionSnapshotReader.js';
```

**Remove the imports** that are no longer needed (they are now encapsulated in the reader):

```typescript
// Remove from line 33:
import { fetchPosition, fetchWhirlpool, getPositionAddress } from '@orca-so/whirlpools-client';
```

**Note:** Keep `fetchWhirlpool` because `buildOrcaInstructions` still uses it at line 184. The updated import becomes:

```typescript
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
```

**Change the constructor** to accept a `SolanaPositionSnapshotReader`:

```typescript
// Before:
export class SolanaExecutionPreparationAdapter implements ExecutionPreparationPort {
  constructor(private readonly rpcUrl: string) {}

// After:
export class SolanaExecutionPreparationAdapter implements ExecutionPreparationPort {
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
  ) {}
```

**Replace the call site** in `prepareExecution()` (line 77). After Issue 3 patch, this line reads:

```typescript
    const positionData = await this.fetchPositionData(rpc, positionId, walletId);
```

Replace with:

```typescript
    const positionData = await this.snapshotReader.fetchSinglePosition(rpc, positionId, walletId);
```

**Delete the `fetchPositionData()` method** (lines 124-156) and the `evaluateRangeState()` method (lines 158-169) entirely. Both are now handled by the shared reader.

- [ ] **Step 30: Update `SolanaExecutionPreparationAdapter.test.ts`**

Update the test file to mock the snapshot reader instead of mocking the internal `fetchPositionData()`. The existing walletId test from Issue 3 should be updated to verify the reader is called correctly:

```typescript
// Add import:
import { SolanaPositionSnapshotReader } from '../solana-position-reads/SolanaPositionSnapshotReader';

// Mock the reader module:
vi.mock('../solana-position-reads/SolanaPositionSnapshotReader', () => {
  return {
    SolanaPositionSnapshotReader: vi.fn().mockImplementation(() => ({
      fetchSinglePosition: vi.fn(),
      fetchWhirlpoolsBatched: vi.fn(),
      getRpc: vi.fn(() => ({})),
    })),
  };
});
```

Update each test that constructs `SolanaExecutionPreparationAdapter` to pass the mock reader:

```typescript
const mockReader = new SolanaPositionSnapshotReader(mockRpcUrl);
const adapter = new SolanaExecutionPreparationAdapter(mockRpcUrl, mockReader);
```

- [ ] **Step 31: Run all tests**

Run: `cd packages/adapters && npx vitest run src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts`

Expected: ALL tests PASS.

- [ ] **Step 32: Typecheck**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: Type errors only for `AdaptersModule.ts` (constructor mismatch). This is expected and fixed in Task 7.

- [ ] **Step 33: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.test.ts
git commit -m "refactor(adapters): SolanaExecutionPreparationAdapter uses shared reader

Replaces private fetchPositionData() and evaluateRangeState() with
SolanaPositionSnapshotReader.fetchSinglePosition(). Eliminates duplicated
position-reading logic between the read adapter and the prep adapter."
```

---

## Task 7: Rewire `AdaptersModule.ts` and Update Exports

**Files:**
- Modify: `packages/adapters/src/composition/AdaptersModule.ts` (lines 3, 49-57)
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 34: Update `AdaptersModule.ts` wiring**

In `packages/adapters/src/composition/AdaptersModule.ts`:

**Add the import** for the shared reader:

```typescript
import { SolanaPositionSnapshotReader } from '../outbound/solana-position-reads/SolanaPositionSnapshotReader.js';
```

**Add the reader instantiation** and update dependent constructors (replace lines 49-57):

```typescript
// Before:
const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl);
const rangeObservation = new SolanaRangeObservationAdapter(rpcUrl);
const operationalStorage = new OperationalStorageAdapter(db, systemIds, orcaPositionRead);
const historyStorage = new OffChainHistoryStorageAdapter(db);
const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
const notificationDedupStorage = new NotificationDedupStorageAdapter(db);
const solanaPreparation = new SolanaExecutionPreparationAdapter(rpcUrl);
const solanaSubmission = new SolanaExecutionSubmissionAdapter(rpcUrl);
const inAppAlert = new InAppAlertAdapter();

// After:
const snapshotReader = new SolanaPositionSnapshotReader(rpcUrl);
const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, db);
const rangeObservation = new SolanaRangeObservationAdapter(rpcUrl);
const operationalStorage = new OperationalStorageAdapter(db, systemIds);
const historyStorage = new OffChainHistoryStorageAdapter(db);
const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
const notificationDedupStorage = new NotificationDedupStorageAdapter(db);
const solanaPreparation = new SolanaExecutionPreparationAdapter(rpcUrl, snapshotReader);
const solanaSubmission = new SolanaExecutionSubmissionAdapter(rpcUrl);
const inAppAlert = new InAppAlertAdapter();
```

- [ ] **Step 35: Update `packages/adapters/src/index.ts` to export the shared reader**

Add the export after the existing `OrcaPositionReadAdapter` export (after line 11):

```typescript
export { SolanaPositionSnapshotReader } from './outbound/solana-position-reads/SolanaPositionSnapshotReader';
```

- [ ] **Step 36: Typecheck the full adapters package**

Run: `cd packages/adapters && npx tsc -p tsconfig.typecheck.json --noEmit`

Expected: No type errors. All constructor signatures should now match.

- [ ] **Step 37: Run the full adapter test suite**

Run: `cd packages/adapters && npx vitest run`

Expected: ALL tests PASS.

- [ ] **Step 38: Verify no remaining references to the old patterns**

Run these searches to confirm the old patterns are gone:

```bash
grep -r "this\.positionReadPort" packages/adapters/src/ --include="*.ts" -l
grep -r "listSupportedPositions.*filter\|getPosition.*listSupportedPositions" packages/adapters/src/ --include="*.ts" -l
```

Expected: No results. The `positionReadPort` dependency is removed from `OperationalStorageAdapter`, and `getPosition` no longer delegates through `listSupportedPositions`.

- [ ] **Step 39: Commit**

```bash
git add packages/adapters/src/composition/AdaptersModule.ts packages/adapters/src/index.ts
git commit -m "refactor(adapters): rewire AdaptersModule for shared SolanaPositionSnapshotReader

SolanaPositionSnapshotReader is constructed once and shared between
OrcaPositionReadAdapter and SolanaExecutionPreparationAdapter.
OperationalStorageAdapter no longer receives a positionReadPort."
```

---

## Summary of RPC Call Reduction

| Operation | Before | After |
|---|---|---|
| `getPosition(walletId, positionId)` | 1 + N RPC calls (full wallet scan + N sequential whirlpool fetches) | 2-3 RPC calls (position + ownership check + whirlpool) |
| `listSupportedPositions(walletId)` | 1 + N sequential RPC calls (wallet scan + per-position whirlpool) | 1 + ceil(uniquePools / batchSize) concurrent RPC calls |
| `listActionableTriggers(walletId)` | 1 + N RPC calls + 1 DB query | 0 RPC calls, 2 DB queries |
| `fetchPositionData()` (prep adapter) | 2-3 RPC calls (duplicated logic) | 2-3 RPC calls (shared reader, no duplication) |
