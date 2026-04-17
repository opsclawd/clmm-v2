# RPC Optimization for Breach Scan Pipeline

**Status:** Draft  
**Date:** 2026-04-17  
**Author:** G / OpenClaw  
**Related:** `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`, `WorkerLifecycle.ts`, `OrcaPositionReadAdapter.ts`, `SolanaPositionSnapshotReader.ts`

---

## Context

The breach scan pipeline runs every 5 minutes (`*/5 * * * *` via pg-boss) and is responsible for detecting when monitored liquidity positions fall outside their configured price ranges (breaches).

### Current RPC Call Pattern

For each wallet scanned per cycle:

1. **`fetchPositionsForOwner`** — 1 RPC call per wallet to enumerate all token accounts owned by the wallet
2. **`fetchWhirlpoolsBatched`** — 1 RPC call **per unique whirlpool** (batched in groups of 2 sequentially)

```typescript
// SolanaPositionSnapshotReader.ts — current batching
const WHIRLPOOL_FETCH_BATCH_SIZE = 2;
for (let i = 0; i < uniqueAddresses.length; i += WHIRLPOOL_FETCH_BATCH_SIZE) {
  const batch = uniqueAddresses.slice(i, i + WHIRLPOOL_FETCH_BATCH_SIZE);
  await Promise.all(batch.map(async (addr) => {
    const whirlpoolAccount = await fetchWhirlpool(rpc, address(addr));
    results.set(addr, { tickCurrentIndex: whirlpoolAccount.data.tickCurrentIndex });
  }));
}
```

### Problem

With many wallets each holding positions across multiple pools, the RPC call volume is high:

| Wallets | Avg Pools/Wallet | RPC Calls/Cycle |
|---|---|---|
| 10 | 5 | ~60 |
| 50 | 5 | ~300 |
| 100 | 8 | ~900 |

Solana mainnet RPC rate limits are a real constraint. This also adds latency to each 5-minute scan cycle.

### Key Observation

> **Position tick bounds (lower/upper) are immutable once the position is created.** Only `tickCurrentIndex` changes over time.

The only thing needed from a whirlpool account is `tickCurrentIndex`. This value changes constantly but all positions in the same pool share the same `tickCurrentIndex`. There is no need to re-fetch pool data per-wallet when multiple wallets share a pool.

---

## Goals

1. Reduce RPC calls per breach scan cycle by **≥80%**
2. Keep scan latency predictable (no unbounded per-wallet pool fetching)
3. Maintain correctness — breaches must never be missed
4. Avoid adding complex new infrastructure (prefer simple over clever)

---

## Proposed Solutions

### Option A — `getMultipleAccounts` Batch Fetch (Quick Win)

**Change only in `SolanaPositionSnapshotReader.ts`.**

Solana's `getMultipleAccounts` RPC method can fetch up to 100 accounts in a single call. Replace the current sequential batch-of-2 pattern with:

```typescript
async fetchWhirlpoolsBatched(
  rpc: ReturnType<typeof createSolRpc>,
  whirlpoolAddresses: string[],
): Promise<Map<string, { tickCurrentIndex: number }>> {
  const uniqueAddresses = [...new Set(whirlpoolAddresses)];
  const results = new Map<string, { tickCurrentIndex: number }>();

  if (uniqueAddresses.length === 0) return results;

  // Solana limits to 100 accounts per getMultipleAccounts call
  const BATCH_SIZE = 100;

  for (let i = 0; i < uniqueAddresses.length; i += BATCH_SIZE) {
    const batch = uniqueAddresses.slice(i, i + BATCH_SIZE);
    const accounts = await rpc.getMultipleAccounts(
      batch.map((addr) => address(addr)),
      { encoding: 'jsonParsed' },
    ).send();

    for (let j = 0; j < accounts.value.length; j++) {
      const account = accounts.value[j];
      if (account) {
        const data = account.data.parsed?.info;
        if (data?.tickCurrentIndex !== undefined) {
          results.set(batch[j], { tickCurrentIndex: data.tickCurrentIndex });
        }
      }
    }
  }

  return results;
}
```

**Impact:** N unique pools → `ceil(N / 100)` RPC calls instead of N calls. For 100 pools across wallets, goes from 100 calls to 1.

**Tradeoffs:**
- ✅ Simple, single-file change
- ✅ No architectural changes
- ✅ Works with the current per-wallet loop in `OrcaPositionReadAdapter`
- ❌ Still fetches each pool multiple times if multiple wallets share it (once per wallet's adapter call)

---

### Option B — Cross-Wallet Tick Cache (Recommended)

**Architectural change: introduce a `WhirlpoolTickCache`.**

The core insight is that **all wallets sharing a pool see the same `tickCurrentIndex`**. Instead of fetching the same pool's tick data once per wallet that holds a position in it, fetch it once per scan cycle and reuse it.

#### New Port

```typescript
// packages/application/src/ports/index.ts (or new file)

export interface WhirlpoolTickCachePort {
  /**
   * Fetch tickCurrentIndex for a set of whirlpool addresses.
   * Returns a map of poolAddress -> tickCurrentIndex.
   * Implementations may use caching, batch RPC, or both.
   */
  getTicks(poolAddresses: PoolId[]): Promise<Map<PoolId, number>>;
}
```

#### Cache Behavior

| Scenario | Behavior |
|---|---|
| First call in cycle | Fetch via `getMultipleAccounts` (1 RPC per 100 pools) |
| Subsequent calls in same cycle | Return cached values (in-memory) |
| Cycle boundary (next 5-min scan) | Cache invalidated, fresh fetch |

Since the cache is scoped to a single `BreachScanJobHandler.handle()` call, it naturally expires at the end of each scan cycle. No TTL needed.

#### Data Flow (Option B)

```
breach-scan job fires
  │
  ├─ listActiveWallers()          → List<{ walletId, lastScannedAt }>
  │
  ├─ TickCache.getTicks(allPoolIds) → Map<PoolId, tickCurrentIndex>
  │     (1 getMultipleAccounts call for all distinct pools across all wallets)
  │
  └─ For each wallet:
       ├─ fetchPositionsForOwner(walletId)   → position mint + pool refs
       │
       └─ For each position:
            ├─ Get tickCurrentIndex from cache (no RPC)
            ├─ Evaluate range state using cached tick + DB-stored bounds
            └─ recordInRange / recordOutOfRange as appropriate
```

#### Key Properties

- **Single RPC call per distinct pool per scan cycle**, regardless of how many wallets hold positions in it
- Position discovery (`fetchPositionsForOwner`) still happens per-wallet — this is unavoidable since wallet ownership must be verified on-chain
- Cache is a simple `Map<PoolId, number>` maintained as a module-level or instance-level variable within the scan cycle
- `evaluateRangeState(bounds, tickCurrentIndex)` is pure and deterministic — safe to call with cached values

#### Example Cache Implementation

```typescript
// packages/adapters/src/outbound/solana-position-reads/WhirlpoolTickCache.ts

export class WhirlpoolTickCache {
  private cache = new Map<string, number>();
  private rpc: ReturnType<typeof createSolanaRpc>;

  constructor(private readonly rpcUrl: string) {
    this.rpc = createSolanaRpc(rpcUrl);
  }

  async getTicks(poolAddresses: PoolId[]): Promise<Map<PoolId, number>> {
    const uniquePools = [...new Set(poolAddresses)];
    const results = new Map<PoolId, number>();

    // Serve from cache
    for (const pool of uniquePools) {
      if (this.cache.has(pool)) {
        results.set(pool, this.cache.get(pool)!);
      }
    }

    // Fetch uncached pools
    const uncached = uniquePools.filter((p) => !this.cache.has(p));
    if (uncached.length === 0) return results;

    const BATCH_SIZE = 100;
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      const batch = uncached.slice(i, i + BATCH_SIZE);
      const accounts = await this.rpc
        .getMultipleAccounts(batch.map((addr) => address(addr)), { encoding: 'jsonParsed' })
        .send();

      for (let j = 0; j < accounts.value.length; j++) {
        const account = accounts.value[j];
        if (account?.data.parsed?.info?.tickCurrentIndex !== undefined) {
          const tick = account.data.parsed.info.tickCurrentIndex;
          this.cache.set(batch[j], tick);
          results.set(batch[j], tick);
        }
      }
    }

    return results;
  }

  clear(): void {
    this.cache.clear();
  }
}
```

#### Modified `BreachScanJobHandler`

```typescript
// Pseudocode — actual implementation details depend on DI setup

async handle(): Promise<void> {
  const wallets = await this.monitoredWalletRepo.listActiveWallers();
  const tickCache = new WhirlpoolTickCache(this.rpcUrl);

  // Collect all pool IDs upfront (before per-wallet iteration)
  const allPoolIds: PoolId[] = [];
  const walletPositions = new Map<WalletId, LiquidityPosition[]>();

  for (const wallet of wallets) {
    const positions = await this.positionReadPort.listSupportedPositions(wallet.walletId);
    walletPositions.set(wallet.walletId, positions);
    for (const pos of positions) {
      allPoolIds.push(pos.poolId);
    }
  }

  // Single batch fetch for all pools
  const ticks = await tickCache.getTicks(allPoolIds);

  // Evaluate breaches using cached ticks
  for (const wallet of wallets) {
    const positions = walletPositions.get(wallet.walletId)!;
    for (const position of positions) {
      const tickCurrentIndex = ticks.get(position.poolId);
      if (tickCurrentIndex === undefined) continue; // pool fetch failed

      const rangeState = evaluateRangeState(position.bounds, tickCurrentIndex);
      // ... rest of breach detection logic
    }
  }
}
```

> **Note:** `listSupportedPositions` in `OrcaPositionReadAdapter` currently calls `fetchWhirlpoolsBatched` internally. In Option B, we would refactor `OrcaPositionReadAdapter` to accept tick data from the caller (via the cache) rather than fetching it itself. This avoids double-fetching.

---

### Option C — Hybrid (Position Discovery + Tick Cache Separation)

This is the most aggressive approach:

1. **Position discovery** runs on a slower cadence (e.g., every 30 min) — this is the expensive per-wallet `fetchPositionsForOwner` call that also detects new/closed positions
2. **Breach detection** runs every 5 minutes but uses only the tick cache + DB-stored position bounds

This reduces RPC calls from `N×(1+K)` per cycle to `ceil(M/100)` per cycle for breach detection (M = distinct pools), with position discovery running 1/6 as often.

**Tradeoffs:**
- ✅ Most efficient
- ❌ Significant complexity: needs to persist position data in DB between discovery cycles
- ❌ Must handle edge cases: position closed, position transferred, new position added mid-cycle
- ❌ Higher implementation risk

**Recommended to start with Option A or B before considering Option C.**

---

## Comparison

| | Option A | Option B | Option C |
|---|---|---|---|
| **RPC Reduction** | ~50-90% | ~80-95% | ~95%+ |
| **Complexity** | Low | Medium | High |
| **Implementation Risk** | None | Low | Medium-High |
| **Change Scope** | 1 file | 2-3 files | 5+ files |
| **Time to Ship** | 1 day | 1-2 days | 1 week |
| **Correctness Risk** | None | None | Edge cases |
| **Recommended** | ✅ Start here | ✅ Core solution | Future |

---

## Correctness Considerations

### Must Not Break

1. **Breach detection must never miss a real breach.** The cache returns `tickCurrentIndex` — if the on-chain tick crosses the position bound between the cache fetch and the evaluation, the next cycle will catch it (5-min max delay). This is acceptable since the current system also has up to 5-min delay between scans.

2. **Position recovery detection must still work.** When a position returns to `in-range`, `recordInRange` is called. This uses `episodeRepo` only — no RPC needed. Correct.

3. **New positions must be picked up within one scan cycle.** `listSupportedPositions` runs every cycle — unchanged.

4. **Closed/transferred positions must be detected.** `listSupportedPositions` runs every cycle — unchanged.

### Cache Invalidation

The cache is intentionally scoped to a single `handle()` call. No cross-cycle persistence. This is safe because:
- `tickCurrentIndex` is only used for breach evaluation (not for executing trades)
- A 5-min staleness window is already the scan interval
- The `BreachScanJobHandler` is not stateful between cycles

---

## Testing Plan

1. **Unit test `WhirlpoolTickCache`** with mocked RPC responses
2. **Unit test `scanPositionsForBreaches`** passing cached tick data through a test adapter
3. **Integration test** with a local Solana validator — verify breach observations are emitted at correct tick boundaries
4. **Load test** — simulate N wallets × M pools, verify RPC call count matches expectation

---

## Rollout Plan

1. **Phase 1:** Implement Option A (`getMultipleAccounts` in `SolanaPositionSnapshotReader`). Ship quickly, validate no regressions.
2. **Phase 2:** Implement Option B (cross-wallet tick cache). This replaces the per-wallet `fetchWhirlpoolsBatched` call entirely.
3. **Phase 3 (optional):** Consider Option C if RPC costs remain problematic at scale.

---

## Open Questions

1. Should the tick cache also be used by `getPosition()` in `OrcaPositionReadAdapter` (single-position reads), or only in the bulk scan path?
2. Should failed pool fetches be retried within the same cycle, or just excluded with a degraded flag?
3. Do we need observability (logged metrics) for cache hit/miss rates?
