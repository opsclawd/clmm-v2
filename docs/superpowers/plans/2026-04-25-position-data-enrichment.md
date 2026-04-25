# Position Data Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich position list and detail views with token pair labels, human-readable prices, unclaimed fees/rewards in USD, pool data, and range distance percentages.

**Architecture:** Application-layer orchestration with a new `PricePort` in the application layer. Adapters return raw on-chain data; use cases call `PricePort` and compute USD values. Graceful degradation when prices are unavailable.

**Tech Stack:** `@solana/kit`, `@orca-so/whirlpools-client`, Jupiter Price API v6, NestJS DI

**Design doc:** `docs/superpowers/specs/2026-04-25-position-data-enrichment-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/domain/src/positions/enrichment.ts` | Computed-value pure functions: `priceFromSqrtPrice`, `tickToPrice`, `rangeDistancePercent`, `tokenAmountToUsd` |
| `packages/domain/src/positions/enrichment.test.ts` | Unit tests for computed-value functions |
| `packages/adapters/src/outbound/price/JupiterPriceAdapter.ts` | Jupiter Price API v6 adapter with TTL cache |
| `packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts` | Adapter tests with recorded responses |
| `packages/adapters/src/outbound/price/known-tokens.ts` | Static `KNOWN_TOKENS` map (SOL/USDC mints, symbols, decimals) |
| `packages/testing/src/fakes/FakePricePort.ts` | Fake `PricePort` for testing |

### Modified files

| File | Change |
|------|--------|
| `packages/domain/src/positions/index.ts` | Add `TokenPair`, `PoolData`, `PositionFees`, `PositionRewardInfo`, `PositionDetail`, `PriceQuote` type exports |
| `packages/domain/src/shared/index.ts` | Add `makePoolId` use (already exported); no changes needed |
| `packages/domain/src/index.ts` | Re-export new types from `positions/enrichment.js` |
| `packages/application/src/ports/index.ts` | Add `PricePort` interface; extend `SupportedPositionReadPort` with `getPositionDetail` and `getPoolData` |
| `packages/application/src/dto/index.ts` | Extend `PositionSummaryDto` and `PositionDetailDto`; add `TokenAmountValue`, `RewardAmountValue` |
| `packages/application/src/use-cases/positions/ListSupportedPositions.ts` | Add `pricePort` param; enrich with pool data, prices, range distances |
| `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts` | Update tests for enriched use case |
| `packages/application/src/use-cases/positions/GetPositionDetail.ts` | Add `pricePort` param; enrich with fees, rewards, USD values |
| `packages/application/src/use-cases/positions/GetPositionDetail.test.ts` | Update tests for enriched use case |
| `packages/application/src/index.ts` | Re-export `PricePort` |
| `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts` | Extend `fetchWhirlpoolsBatched` return type to include full `WhirlpoolData`; add `fetchPositionDetail` method |
| `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts` | Add `getPoolData` and `getPositionDetail` methods |
| `packages/adapters/src/index.ts` | Export `JupiterPriceAdapter` |
| `packages/adapters/src/inbound/http/tokens.ts` | Add `PRICE_PORT` token |
| `packages/adapters/src/inbound/http/AppModule.ts` | Wire `JupiterPriceAdapter` to `PRICE_PORT` |
| `packages/adapters/src/composition/AdaptersModule.ts` | Wire `JupiterPriceAdapter` to `PRICE_PORT` |
| `packages/adapters/src/inbound/http/PositionController.ts` | Inject `PricePort`; update `toPositionSummaryDto` / `toPositionDetailDto` mappers; pass `pricePort` to use cases |
| `packages/ui/src/view-models/PositionListViewModel.ts` | Use enriched DTO fields; update `buildPositionListViewModel` |
| `packages/ui/src/view-models/PositionDetailViewModel.ts` | Use enriched DTO fields; update `buildPositionDetailViewModel` |
| `packages/ui/src/view-models/PositionDetailViewModel.test.ts` | Update tests for enriched view model |
| `packages/ui/src/components/PositionCard.tsx` | Render new view model fields (price, fees, pool label) |
| `packages/testing/src/fakes/FakeSupportedPositionReadPort.ts` | Add `getPositionDetail` and `getPoolData` methods |
| `packages/testing/src/fixtures/positions.ts` | Add fixture pool data, fees, and price quotes |
| `packages/testing/src/contracts/PositionReadPortContract.ts` | Add contract tests for new port methods |
| `packages/testing/src/index.ts` | Export `FakePricePort` |

---

### Task 1: Domain computed-value functions

**Files:**
- Create: `packages/domain/src/positions/enrichment.ts`
- Create: `packages/domain/src/positions/enrichment.test.ts`
- Modify: `packages/domain/src/positions/index.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write the failing tests for computed-value functions**

```typescript
// packages/domain/src/positions/enrichment.test.ts
import { describe, it, expect } from 'vitest';
import {
  priceFromSqrtPrice,
  tickToPrice,
  rangeDistancePercent,
  tokenAmountToUsd,
} from './enrichment.js';

describe('priceFromSqrtPrice', () => {
  it('converts a known sqrtPrice X64 to human-readable price', () => {
    // SOL/USDC pool: if sqrtPrice represents $150 per SOL
    // price = (sqrtPrice / 2^64)^2 * 10^(decimalsA - decimalsB)
    // For SOL (9 decimals) / USDC (6 decimals): exponent = 9 - 6 = 3
    // $150 => sqrtPrice = sqrt(150) * 2^64 * 10^(-3/2)
    const targetPrice = 150;
    const decimalsA = 9;
    const decimalsB = 6;
    // sqrtPrice = sqrt(targetPrice * 10^(decimalsB - decimalsA)) * 2^64
    const sqrtPriceX64 = BigInt(Math.round(Math.sqrt(targetPrice * 10 ** (decimalsB - decimalsA)) * (2 ** 64)));
    const result = priceFromSqrtPrice(sqrtPriceX64, decimalsA, decimalsB);
    expect(result).toBeCloseTo(targetPrice, 1);
  });

  it('returns 0 for zero sqrtPrice', () => {
    expect(priceFromSqrtPrice(0n, 9, 6)).toBe(0);
  });

  it('handles inverted decimals (decimalsA < decimalsB)', () => {
    const targetPrice = 0.00667;
    const decimalsA = 6;
    const decimalsB = 9;
    const sqrtPriceX64 = BigInt(Math.round(Math.sqrt(targetPrice * 10 ** (decimalsB - decimalsA)) * (2 ** 64)));
    const result = priceFromSqrtPrice(sqrtPriceX64, decimalsA, decimalsB);
    expect(result).toBeCloseTo(targetPrice, 4);
  });
});

describe('tickToPrice', () => {
  it('converts tick index 0 to price 1.0 with equal decimals', () => {
    expect(tickToPrice(0, 9, 9)).toBeCloseTo(1.0, 6);
  });

  it('converts positive tick to price > 1', () => {
    // tick 100 => 1.0001^100 ≈ 1.01005
    const result = tickToPrice(100, 9, 9);
    expect(result).toBeCloseTo(1.0001 ** 100, 4);
  });

  it('converts negative tick to price < 1', () => {
    // tick -100 => 1.0001^-100 ≈ 0.99005
    const result = tickToPrice(-100, 9, 9);
    expect(result).toBeCloseTo(1.0001 ** (-100), 4);
  });

  it('adjusts for decimal difference', () => {
    // With decimalsA=9, decimalsB=6: multiply by 10^3
    const result = tickToPrice(0, 9, 6);
    expect(result).toBeCloseTo(1000, 1);
  });
});

describe('rangeDistancePercent', () => {
  it('returns 0 for both when in range', () => {
    const result = rangeDistancePercent(150, 100, 200);
    expect(result.belowLowerPercent).toBe(0);
    expect(result.aboveUpperPercent).toBe(0);
  });

  it('returns positive belowLowerPercent when below lower bound', () => {
    const result = rangeDistancePercent(80, 100, 200);
    expect(result.belowLowerPercent).toBeGreaterThan(0);
    expect(result.aboveUpperPercent).toBe(0);
  });

  it('returns positive aboveUpperPercent when above upper bound', () => {
    const result = rangeDistancePercent(250, 100, 200);
    expect(result.aboveUpperPercent).toBeGreaterThan(0);
    expect(result.belowLowerPercent).toBe(0);
  });

  it('computes correct percentage below lower bound', () => {
    // current tick 80, lower bound 100: 20 ticks below / 100 = 20%
    const result = rangeDistancePercent(80, 100, 200);
    expect(result.belowLowerPercent).toBeCloseTo(20, 1);
  });

  it('computes correct percentage above upper bound', () => {
    // current tick 250, upper bound 200: 50 ticks above / 200 = 25%
    const result = rangeDistancePercent(250, 100, 200);
    expect(result.aboveUpperPercent).toBeCloseTo(25, 1);
  });
});

describe('tokenAmountToUsd', () => {
  it('converts raw token amount with decimals to USD', () => {
    // 1.5 SOL = 1_500_000_000 raw (9 decimals) at $150/SOL = $225
    const result = tokenAmountToUsd(1_500_000_000n, 9, 150);
    expect(result).toBeCloseTo(225, 2);
  });

  it('converts USDC amount to USD directly', () => {
    // 50 USDC = 50_000_000 raw (6 decimals) at $1/USDC = $50
    const result = tokenAmountToUsd(50_000_000n, 6, 1);
    expect(result).toBeCloseTo(50, 2);
  });

  it('returns 0 for zero amount', () => {
    expect(tokenAmountToUsd(0n, 9, 150)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test --filter @clmm/domain -- --reporter=verbose --run packages/domain/src/positions/enrichment.test.ts`
Expected: FAIL — `enrichment.js` does not exist

- [ ] **Step 3: Write the implementation**

```typescript
// packages/domain/src/positions/enrichment.ts
export function priceFromSqrtPrice(
  sqrtPriceX64: bigint,
  decimalsA: number,
  decimalsB: number,
): number {
  if (sqrtPriceX64 === 0n) return 0;

  const Q64 = 2n ** 64n;
  const ratio = Number(sqrtPriceX64) / Number(Q64);
  const price = ratio * ratio * 10 ** (decimalsA - decimalsB);
  return price;
}

export function tickToPrice(
  tickIndex: number,
  decimalsA: number,
  decimalsB: number,
): number {
  const price = Math.pow(1.0001, tickIndex) * 10 ** (decimalsA - decimalsB);
  return price;
}

export function rangeDistancePercent(
  currentTick: number,
  lowerTick: number,
  upperTick: number,
): { belowLowerPercent: number; aboveUpperPercent: number } {
  if (currentTick < lowerTick) {
    return {
      belowLowerPercent: Math.abs(currentTick - lowerTick) / Math.abs(lowerTick) * 100,
      aboveUpperPercent: 0,
    };
  }

  if (currentTick > upperTick) {
    return {
      belowLowerPercent: 0,
      aboveUpperPercent: Math.abs(currentTick - upperTick) / Math.abs(upperTick) * 100,
    };
  }

  return { belowLowerPercent: 0, aboveUpperPercent: 0 };
}

export function tokenAmountToUsd(
  amount: bigint,
  decimals: number,
  usdPrice: number,
): number {
  if (amount === 0n) return 0;
  const humanReadable = Number(amount) / 10 ** decimals;
  return humanReadable * usdPrice;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test --filter @clmm/domain -- --reporter=verbose --run packages/domain/src/positions/enrichment.test.ts`
Expected: PASS

- [ ] **Step 5: Export from barrel files**

Add to `packages/domain/src/positions/index.ts`:

```typescript
export type TokenPair = {
  readonly mintA: string;
  readonly mintB: string;
  readonly symbolA: string;
  readonly symbolB: string;
  readonly decimalsA: number;
  readonly decimalsB: number;
};

export type PoolData = {
  readonly poolId: PoolId;
  readonly tokenPair: TokenPair;
  readonly sqrtPrice: bigint;
  readonly feeRate: number;
  readonly tickSpacing: number;
  readonly liquidity: bigint;
  readonly tickCurrentIndex: number;
};

export type PositionFees = {
  readonly feeOwedA: bigint;
  readonly feeOwedB: bigint;
  readonly rewardInfos: readonly PositionRewardInfo[];
};

export type PositionRewardInfo = {
  readonly mint: string;
  readonly amountOwed: bigint;
  readonly decimals: number;
};

export type PositionDetail = {
  readonly position: LiquidityPosition;
  readonly poolData: PoolData;
  readonly fees: PositionFees;
  readonly positionLiquidity: bigint;
};

export type PriceQuote = {
  readonly tokenMint: string;
  readonly usdValue: number;
  readonly symbol: string;
  readonly quotedAt: ClockTimestamp;
};

export {
  priceFromSqrtPrice,
  tickToPrice,
  rangeDistancePercent,
  tokenAmountToUsd,
} from './enrichment.js';
```

Update the import at top of `packages/domain/src/positions/index.ts` to include `ClockTimestamp`:

```typescript
import type { PositionId, WalletId, PoolId, ClockTimestamp } from '../shared/index.js';
```

Add to `packages/domain/src/index.ts`:

```typescript
export {
  priceFromSqrtPrice,
  tickToPrice,
  rangeDistancePercent,
  tokenAmountToUsd,
  TokenPair,
  PoolData,
  PositionFees,
  PositionRewardInfo,
  PositionDetail,
  PriceQuote,
} from './positions/index.js';
```

- [ ] **Step 6: Run domain build + typecheck**

Run: `pnpm build --filter @clmm/domain && pnpm typecheck --filter @clmm/domain`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/positions/enrichment.ts packages/domain/src/positions/enrichment.test.ts packages/domain/src/positions/index.ts packages/domain/src/index.ts
git commit -m "feat(domain): add position enrichment types and computed-value functions"
```

---

### Task 2: Application-layer PricePort and extended SupportedPositionReadPort

**Files:**
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/application/src/dto/index.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Add PricePort interface to ports**

Add to `packages/application/src/ports/index.ts`, after the `// --- Position read ports ---` section and before the existing `SupportedPositionReadPort`:

```typescript
// --- Price ports ---

export interface PricePort {
  getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]>;
}
```

Import `PriceQuote` from `@clmm/domain` by adding it to the existing import statement at the top of the file:

```typescript
import type {
  LiquidityPosition,
  PriceQuote,
} from '@clmm/domain';
```

- [ ] **Step 2: Extend SupportedPositionReadPort**

Add `getPositionDetail` and `getPoolData` methods to the `SupportedPositionReadPort` interface. Import `PoolData` and `PositionDetail` from `@clmm/domain`:

```typescript
import type {
  LiquidityPosition,
  PriceQuote,
  PoolData,
  PositionDetail,
} from '@clmm/domain';
```

Then update the interface:

```typescript
export interface SupportedPositionReadPort {
  listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]>;
  getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null>;
  getPositionDetail(walletId: WalletId, positionId: PositionId): Promise<PositionDetail | null>;
  getPoolData(poolId: PoolId): Promise<PoolData | null>;
}
```

- [ ] **Step 3: Extend DTOs**

In `packages/application/src/dto/index.ts`, import the new domain types:

```typescript
import type {
  PositionId,
  PoolId,
  BreachDirection,
  PostExitAssetPosture,
  AssetSymbol,
  BreachEpisodeId,
  ClockTimestamp,
} from '@clmm/domain';
```

(No new imports needed — `PositionId`, `PoolId` are already imported.)

Replace `PositionSummaryDto` with the enriched version:

```typescript
export type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  feeRateLabel: string;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  rangeDistance: {
    belowLowerPercent: number;
    aboveUpperPercent: number;
  };
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};
```

Replace `PositionDetailDto` with the enriched version:

```typescript
export type TokenAmountValue = {
  raw: bigint;
  decimals: number;
  symbol: string;
  usdValue: number;
};

export type RewardAmountValue = {
  mint: string;
  amount: bigint;
  decimals: number;
  symbol: string;
  usdValue: number;
};

export type PositionDetailDto = PositionSummaryDto & {
  lowerBound: number;
  upperBound: number;
  currentPrice: number;
  sqrtPrice: bigint;
  unclaimedFees: {
    feeOwedA: TokenAmountValue;
    feeOwedB: TokenAmountValue;
    totalUsd: number;
  };
  unclaimedRewards: {
    rewards: RewardAmountValue[];
    totalUsd: number;
  };
  positionLiquidity: bigint;
  poolLiquidity: bigint;
  poolDepthLabel: string;
  triggerId?: ExitTriggerId;
  breachDirection?: BreachDirection;
  srLevels?: SrLevelsBlock;
};
```

- [ ] **Step 4: Run application build + typecheck**

Run: `pnpm build --filter @clmm/application && pnpm typecheck --filter @clmm/application`
Expected: FAIL at this point (use cases don't match yet — that's OK, we're just checking the port/DTO definitions compile)

If the build fails because existing use cases don't yet pass the new `pricePort` param, that's expected — we'll fix those in Task 5. If it fails for port/DTO type reasons, fix those now.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/ports/index.ts packages/application/src/dto/index.ts packages/application/src/index.ts
git commit -m "feat(application): add PricePort, extend SupportedPositionReadPort and DTOs"
```

---

### Task 3: Known tokens map and JupiterPriceAdapter

**Files:**
- Create: `packages/adapters/src/outbound/price/known-tokens.ts`
- Create: `packages/adapters/src/outbound/price/JupiterPriceAdapter.ts`
- Create: `packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts`
- Modify: `packages/adapters/src/index.ts`

- [ ] **Step 1: Create known-tokens map**

```typescript
// packages/adapters/src/outbound/price/known-tokens.ts
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  [SOL_MINT]: { symbol: 'SOL', decimals: 9 },
  [USDC_MINT]: { symbol: 'USDC', decimals: 6 },
};
```

- [ ] **Step 2: Write the failing test for JupiterPriceAdapter**

```typescript
// packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JupiterPriceAdapter } from './JupiterPriceAdapter.js';
import { SOL_MINT, USDC_MINT } from './known-tokens.js';

describe('JupiterPriceAdapter', () => {
  let adapter: JupiterPriceAdapter;

  beforeEach(() => {
    adapter = new JupiterPriceAdapter({ cacheTtlMs: 30000 });
  });

  it('fetches prices for known token mints', async () => {
    const mockResponse = {
      data: {
        [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
        [USDC_MINT]: { id: USDC_MINT, symbol: 'USDC', price: 1.0 },
      },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const quotes = await adapter.getPrices([SOL_MINT, USDC_MINT]);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]?.usdValue).toBe(150.5);
    expect(quotes[0]?.symbol).toBe('SOL');
    expect(quotes[1]?.usdValue).toBe(1.0);
    expect(quotes[1]?.symbol).toBe('USDC');

    vi.restoreAllMocks();
  });

  it('uses cache on second call within TTL', async () => {
    const mockResponse = {
      data: {
        [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    vi.stubGlobal('fetch', fetchMock);

    await adapter.getPrices([SOL_MINT]);
    await adapter.getPrices([SOL_MINT]);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('throws when API returns non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    }));

    await expect(adapter.getPrices([SOL_MINT])).rejects.toThrow();

    vi.restoreAllMocks();
  });

  it('fetches only uncached mints on partial cache miss', async () => {
    const mockResponseSOL = {
      data: {
        [SOL_MINT]: { id: SOL_MINT, symbol: 'SOL', price: 150.5 },
      },
    };
    const mockResponseUSDC = {
      data: {
        [USDC_MINT]: { id: USDC_MINT, symbol: 'USDC', price: 1.0 },
      },
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponseSOL),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponseUSDC),
      });

    vi.stubGlobal('fetch', fetchMock);

    await adapter.getPrices([SOL_MINT]);
    await adapter.getPrices([SOL_MINT, USDC_MINT]);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test --filter @clmm/adapters -- --reporter=verbose --run packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts`
Expected: FAIL — `JupiterPriceAdapter.js` does not exist

- [ ] **Step 4: Write the JupiterPriceAdapter implementation**

```typescript
// packages/adapters/src/outbound/price/JupiterPriceAdapter.ts
import type { PricePort } from '@clmm/application';
import type { PriceQuote } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

const JUPITER_PRICE_API_BASE = 'https://price-api.jup.ag/v6';

type CachedPrice = {
  price: number;
  symbol: string;
  fetchedAt: number;
};

export class JupiterPriceAdapter implements PricePort {
  private readonly cache = new Map<string, CachedPrice>();
  private readonly cacheTtlMs: number;
  private readonly apiKey: string | undefined;

  constructor(config: { apiKey?: string; cacheTtlMs?: number } = {}) {
    this.apiKey = config.apiKey ?? (process.env as Record<string, string | undefined>)['JUPITER_API_KEY'];
    this.cacheTtlMs = config.cacheTtlMs ?? 30000;
  }

  async getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]> {
    const now = Date.now();
    const results: PriceQuote[] = [];
    const uncached: string[] = [];

    for (const mint of tokenMints) {
      const cached = this.cache.get(mint);
      if (cached && (now - cached.fetchedAt) < this.cacheTtlMs) {
        results.push({
          tokenMint: mint,
          usdValue: cached.price,
          symbol: cached.symbol,
          quotedAt: makeClockTimestamp(cached.fetchedAt),
        });
      } else {
        uncached.push(mint);
      }
    }

    if (uncached.length > 0) {
      const freshQuotes = await this.fetchFromApi(uncached, now);
      results.push(...freshQuotes);
    }

    return results;
  }

  private async fetchFromApi(mints: string[], now: number): Promise<PriceQuote[]> {
    const ids = mints.join(',');
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const url = `${JUPITER_PRICE_API_BASE}/price?ids=${ids}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`JupiterPriceAdapter: Price API error ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data: Record<string, { id: string; symbol?: string; price: number }>;
    };

    const quotes: PriceQuote[] = [];
    for (const mint of mints) {
      const tokenData = data.data[mint];
      if (tokenData) {
        const symbol = tokenData.symbol ?? mint;
        this.cache.set(mint, { price: tokenData.price, symbol, fetchedAt: now });
        quotes.push({
          tokenMint: mint,
          usdValue: tokenData.price,
          symbol,
          quotedAt: makeClockTimestamp(now),
        });
      }
    }

    return quotes;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test --filter @clmm/adapters -- --reporter=verbose --run packages/adapters/src/outbound/price/JupiterPriceAdapter.test.ts`
Expected: PASS

- [ ] **Step 6: Export from adapters barrel**

Add to `packages/adapters/src/index.ts`:

```typescript
export { JupiterPriceAdapter } from './outbound/price/JupiterPriceAdapter';
```

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/outbound/price/ packages/adapters/src/index.ts
git commit -m "feat(adapters): add JupiterPriceAdapter with TTL cache"
```

---

### Task 4: Extend SolanaPositionSnapshotReader and OrcaPositionReadAdapter

**Files:**
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.test.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`

- [ ] **Step 1: Extend `fetchWhirlpoolsBatched` return type**

In `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`, add the `WhirlpoolData` type and update `fetchWhirlpoolsBatched`:

```typescript
export type WhirlpoolData = {
  tickCurrentIndex: number;
  sqrtPrice: bigint;
  tokenMintA: string;
  tokenMintB: string;
  feeRate: number;
  tickSpacing: number;
  liquidity: bigint;
};
```

Update the method signature:

```typescript
async fetchWhirlpoolsBatched(
  rpc: ReturnType<typeof createSolanaRpc>,
  whirlpoolAddresses: string[],
): Promise<Map<string, WhirlpoolData>>
```

And update the inner extraction (line 109):

```typescript
results.set(addr, {
  tickCurrentIndex: whirlpoolAccount.data.tickCurrentIndex,
  sqrtPrice: whirlpoolAccount.data.sqrtPrice,
  tokenMintA: whirlpoolAccount.data.tokenMintA.toString(),
  tokenMintB: whirlpoolAccount.data.tokenMintB.toString(),
  feeRate: whirlpoolAccount.data.feeRate,
  tickSpacing: whirlpoolAccount.data.tickSpacing,
  liquidity: whirlpoolAccount.data.liquidity,
});
```

Update the empty results initialization:

```typescript
const results = new Map<string, WhirlpoolData>();
```

- [ ] **Step 2: Add `fetchPositionDetail` method to SolanaPositionSnapshotReader**

Add a new method that reads full position account data including fees:

```typescript
async fetchPositionDetail(
  rpc: ReturnType<typeof createSolanaRpc>,
  positionId: PositionId,
  walletId: WalletId,
): Promise<{
  position: LiquidityPosition;
  poolData: import('@clmm/domain').PoolData;
  fees: import('@clmm/domain').PositionFees;
  positionLiquidity: bigint;
} | null> {
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

    const { KNOWN_TOKENS } = await import('../price/known-tokens.js');

    const mintA = whirlpool.tokenMintA.toString();
    const mintB = whirlpool.tokenMintB.toString();
    const knownA = KNOWN_TOKENS[mintA];
    const knownB = KNOWN_TOKENS[mintB];

    return {
      position: {
        positionId,
        walletId,
        poolId: makePoolId(whirlpoolAddress.toString()),
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      },
      poolData: {
        poolId: makePoolId(whirlpoolAddress.toString()),
        tokenPair: {
          mintA,
          mintB,
          symbolA: knownA?.symbol ?? mintA,
          symbolB: knownB?.symbol ?? mintB,
          decimalsA: knownA?.decimals ?? 0,
          decimalsB: knownB?.decimals ?? 0,
        },
        sqrtPrice: whirlpool.sqrtPrice,
        feeRate: whirlpool.feeRate,
        tickSpacing: whirlpool.tickSpacing,
        liquidity: whirlpool.liquidity,
        tickCurrentIndex: whirlpool.tickCurrentIndex,
      },
      fees: {
        feeOwedA: position.feeOwedA ?? 0n,
        feeOwedB: position.feeOwedB ?? 0n,
        rewardInfos: (position.rewardInfos ?? []).map((r: { mint: unknown; amountOwed: unknown; decimals?: unknown }) => ({
          mint: r.mint?.toString() ?? '',
          amountOwed: typeof r.amountOwed === 'bigint' ? r.amountOwed : BigInt(r.amountOwed ?? 0),
          decimals: typeof r.decimals === 'number' ? r.decimals : 0,
        })),
      },
      positionLiquidity: position.liquidity,
    };
  } catch {
    return null;
  }
}
```

Add the required imports at the top of the file:

```typescript
import type { PoolData, PositionFees } from '@clmm/domain';
```

- [ ] **Step 3: Add `getPoolData` and `getPositionDetail` to OrcaPositionReadAdapter**

In `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`, update imports:

```typescript
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId, PoolData, PositionDetail } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';
```

Add the two new methods to the class:

```typescript
async getPoolData(poolId: PoolId): Promise<PoolData | null> {
  const rpc = this.getRpc();
  const { fetchWhirlpool } = await import('@orca-so/whirlpools-client');
  const { KNOWN_TOKENS } = await import('../price/known-tokens.js');

  try {
    const whirlpoolAccount = await fetchWhirlpool(rpc, address(poolId));
    const w = whirlpoolAccount.data;

    const mintA = w.tokenMintA.toString();
    const mintB = w.tokenMintB.toString();
    const knownA = KNOWN_TOKENS[mintA];
    const knownB = KNOWN_TOKENS[mintB];

    return {
      poolId,
      tokenPair: {
        mintA,
        mintB,
        symbolA: knownA?.symbol ?? mintA,
        symbolB: knownB?.symbol ?? mintB,
        decimalsA: knownA?.decimals ?? 0,
        decimalsB: knownB?.decimals ?? 0,
      },
      sqrtPrice: w.sqrtPrice,
      feeRate: w.feeRate,
      tickSpacing: w.tickSpacing,
      liquidity: w.liquidity,
      tickCurrentIndex: w.tickCurrentIndex,
    };
  } catch {
    return null;
  }
}

async getPositionDetail(walletId: WalletId, positionId: PositionId): Promise<PositionDetail | null> {
  const rpc = this.getRpc();
  const detail = await this.snapshotReader.fetchPositionDetail(rpc, positionId, walletId);
  if (!detail) return null;

  const now = Date.now();
  await this.db
    .insert(walletPositionOwnership)
    .values({
      walletId,
      positionId,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
      set: { lastSeenAt: now },
    });

  return detail;
}
```

Add `address` to the import from `@solana/kit`:

```typescript
import { createSolanaRpc, address } from '@solana/kit';
```

- [ ] **Step 4: Update the `listSupportedPositions` method to use `WhirlpoolData`**

In `OrcaPositionReadAdapter.ts`, the existing loop at line 137 already accesses `whirlpoolData.tickCurrentIndex`. Since `fetchWhirlpoolsBatched` now returns `WhirlpoolData` (which still has `tickCurrentIndex`), the existing code continues to work. No changes needed in the loop body.

- [ ] **Step 5: Run adapter build + typecheck**

Run: `pnpm build --filter @clmm/adapters && pnpm typecheck --filter @clmm/adapters`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts
git commit -m "feat(adapters): extend whirlpool data extraction and add position detail read"
```

---

### Task 5: Update application use cases for enrichment

**Files:**
- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.ts`
- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts`
- Modify: `packages/application/src/use-cases/positions/GetPositionDetail.ts`
- Modify: `packages/application/src/use-cases/positions/GetPositionDetail.test.ts`

- [ ] **Step 1: Rewrite `ListSupportedPositions` use case**

```typescript
// packages/application/src/use-cases/positions/ListSupportedPositions.ts
import type { SupportedPositionReadPort, PricePort } from '../../ports/index.js';
import type { WalletId, LiquidityPosition, PoolId } from '@clmm/domain';
import type { PositionSummaryDto } from '../../dto/index.js';
import {
  priceFromSqrtPrice,
  rangeDistancePercent,
} from '@clmm/domain';

export type ListSupportedPositionsResult = {
  positions: LiquidityPosition[];
  summaryDtos: PositionSummaryDto[];
};

export async function listSupportedPositions(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
  pricePort: PricePort;
}): Promise<ListSupportedPositionsResult> {
  const positions = await params.positionReadPort.listSupportedPositions(params.walletId);

  const uniquePoolIds = [...new Set(positions.map((p) => p.poolId))];
  const poolDataMap = new Map<PoolId, Awaited<ReturnType<SupportedPositionReadPort['getPoolData']>>>();

  await Promise.all(uniquePoolIds.map(async (poolId) => {
    const poolData = await params.positionReadPort.getPoolData(poolId);
    if (poolData) poolDataMap.set(poolId, poolData);
  }));

  let priceMap = new Map<string, { usdValue: number; symbol: string }>();
  try {
    const allMints = [...poolDataMap.values()].flatMap((pd) =>
      pd ? [pd.tokenPair.mintA, pd.tokenPair.mintB] : [],
    );
    if (allMints.length > 0) {
      const quotes = await params.pricePort.getPrices([...new Set(allMints)]);
      for (const q of quotes) {
        priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
      }
    }
  } catch {
    // Price fetch failed — degrade gracefully, no USD values
  }

  const summaryDtos: PositionSummaryDto[] = positions.map((p) => {
    const poolData = poolDataMap.get(p.poolId);
    const currentPrice = poolData
      ? priceFromSqrtPrice(poolData.sqrtPrice, poolData.tokenPair.decimalsA, poolData.tokenPair.decimalsB)
      : p.rangeState.currentPrice;

    const distance = rangeDistancePercent(
      p.rangeState.currentPrice,
      p.bounds.lowerBound,
      p.bounds.upperBound,
    );

    return {
      positionId: p.positionId,
      poolId: p.poolId,
      tokenPairLabel: poolData ? `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}` : `Pool ${p.poolId}`,
      currentPrice,
      currentPriceLabel: poolData ? `$${currentPrice.toFixed(2)}` : `tick: ${p.rangeState.currentPrice}`,
      feeRateLabel: poolData ? `${poolData.feeRate} bps` : '',
      rangeState: p.rangeState.kind,
      rangeDistance: {
        belowLowerPercent: distance.belowLowerPercent,
        aboveUpperPercent: distance.aboveUpperPercent,
      },
      hasActionableTrigger: false,
      monitoringStatus: p.monitoringReadiness.kind,
    };
  });

  return { positions, summaryDtos };
}
```

- [ ] **Step 2: Update `ListSupportedPositions` tests**

```typescript
// packages/application/src/use-cases/positions/ListSupportedPositions.test.ts
import { describe, it, expect } from 'vitest';
import { listSupportedPositions } from './ListSupportedPositions.js';
import {
  FakeSupportedPositionReadPort,
  FakePricePort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POOL_DATA,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import type { PricePort } from '@clmm/application';
import type { PriceQuote } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

describe('ListSupportedPositions', () => {
  it('returns enriched summaries with pool data and prices', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.tokenPairLabel).toContain('SOL');
  });

  it('degrades gracefully when price fetch fails', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );
    const pricePort: PricePort = {
      getPrices: async () => { throw new Error('price unavailable'); },
    };

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.currentPriceLabel).toContain('tick:');
  });

  it('returns empty list when wallet has no positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const pricePort = new FakePricePort([]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.positions).toHaveLength(0);
    expect(result.summaryDtos).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rewrite `GetPositionDetail` use case**

```typescript
// packages/application/src/use-cases/positions/GetPositionDetail.ts
import type { SupportedPositionReadPort, PricePort } from '../../ports/index.js';
import type { PositionId, WalletId } from '@clmm/domain';
import type { PositionDetailDto, TokenAmountValue, RewardAmountValue } from '../../dto/index.js';
import {
  priceFromSqrtPrice,
  rangeDistancePercent,
  tokenAmountToUsd,
} from '@clmm/domain';

export type GetPositionDetailResult =
  | { kind: 'found'; position: import('@clmm/domain').LiquidityPosition; detailDto: PositionDetailDto }
  | { kind: 'not-found' };

export async function getPositionDetail(params: {
  walletId: WalletId;
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
  pricePort: PricePort;
}): Promise<GetPositionDetailResult> {
  const detail = await params.positionReadPort.getPositionDetail(params.walletId, params.positionId);
  if (!detail) return { kind: 'not-found' };

  const { position, poolData, fees, positionLiquidity } = detail;

  let priceMap = new Map<string, { usdValue: number; symbol: string }>();
  try {
    const mints = [poolData.tokenPair.mintA, poolData.tokenPair.mintB];
    const rewardMints = fees.rewardInfos.map((r) => r.mint).filter((m) => !mints.includes(m));
    const allMints = [...mints, ...rewardMints];
    const quotes = await params.pricePort.getPrices([...new Set(allMints)]);
    for (const q of quotes) {
      priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
    }
  } catch {
    // Price fetch failed — degrade gracefully
  }

  const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, poolData.tokenPair.decimalsA, poolData.tokenPair.decimalsB);
  const distance = rangeDistancePercent(
    position.rangeState.currentPrice,
    position.bounds.lowerBound,
    position.bounds.upperBound,
  );

  const priceA = priceMap.get(poolData.tokenPair.mintA);
  const priceB = priceMap.get(poolData.tokenPair.mintB);

  const feeOwedA: TokenAmountValue = {
    raw: fees.feeOwedA,
    decimals: poolData.tokenPair.decimalsA,
    symbol: poolData.tokenPair.symbolA,
    usdValue: priceA ? tokenAmountToUsd(fees.feeOwedA, poolData.tokenPair.decimalsA, priceA.usdValue) : 0,
  };

  const feeOwedB: TokenAmountValue = {
    raw: fees.feeOwedB,
    decimals: poolData.tokenPair.decimalsB,
    symbol: poolData.tokenPair.symbolB,
    usdValue: priceB ? tokenAmountToUsd(fees.feeOwedB, poolData.tokenPair.decimalsB, priceB.usdValue) : 0,
  };

  const totalFeesUsd = feeOwedA.usdValue + feeOwedB.usdValue;

  const rewardValues: RewardAmountValue[] = fees.rewardInfos.map((r) => {
    const rPrice = priceMap.get(r.mint);
    return {
      mint: r.mint,
      amount: r.amountOwed,
      decimals: r.decimals,
      symbol: rPrice?.symbol ?? r.mint,
      usdValue: rPrice ? tokenAmountToUsd(r.amountOwed, r.decimals, rPrice.usdValue) : 0,
    };
  });

  const totalRewardsUsd = rewardValues.reduce((sum, r) => sum + r.usdValue, 0);

  const poolDepthUsd = priceB
    ? tokenAmountToUsd(poolData.liquidity, poolData.tokenPair.decimalsB, priceB.usdValue)
    : 0;
  const poolDepthLabel = poolDepthUsd > 0
    ? `$${(poolDepthUsd / 1_000_000).toFixed(1)}M pool depth`
    : 'depth unavailable';

  const detailDto: PositionDetailDto = {
    positionId: position.positionId,
    poolId: position.poolId,
    tokenPairLabel: `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}`,
    currentPrice,
    currentPriceLabel: `$${currentPrice.toFixed(2)}`,
    feeRateLabel: `${poolData.feeRate} bps`,
    rangeState: position.rangeState.kind,
    rangeDistance: {
      belowLowerPercent: distance.belowLowerPercent,
      aboveUpperPercent: distance.aboveUpperPercent,
    },
    hasActionableTrigger: false,
    monitoringStatus: position.monitoringReadiness.kind,
    lowerBound: position.bounds.lowerBound,
    upperBound: position.bounds.upperBound,
    sqrtPrice: poolData.sqrtPrice,
    unclaimedFees: {
      feeOwedA,
      feeOwedB,
      totalUsd: totalFeesUsd,
    },
    unclaimedRewards: {
      rewards: rewardValues,
      totalUsd: totalRewardsUsd,
    },
    positionLiquidity,
    poolLiquidity: poolData.liquidity,
    poolDepthLabel,
  };

  return { kind: 'found', position, detailDto };
}
```

- [ ] **Step 4: Update `GetPositionDetail` tests**

```typescript
// packages/application/src/use-cases/positions/GetPositionDetail.test.ts
import { describe, it, expect } from 'vitest';
import { getPositionDetail } from './GetPositionDetail.js';
import {
  FakeSupportedPositionReadPort,
  FakePricePort,
  FIXTURE_POSITION_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_WALLET_ID,
  FIXTURE_POOL_DATA,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import { makePositionId, makeWalletId } from '@clmm/domain';
import type { PricePort } from '@clmm/application';

describe('GetPositionDetail', () => {
  it('returns enriched detail with fees and USD values', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.detailDto.tokenPairLabel).toContain('SOL');
      expect(result.detailDto.unclaimedFees).toBeDefined();
    }
  });

  it('degrades gracefully when price fetch fails', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    const pricePort: PricePort = {
      getPrices: async () => { throw new Error('price unavailable'); },
    };

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.detailDto.unclaimedFees.totalUsd).toBe(0);
    }
  });

  it('returns not-found when position does not exist', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const pricePort = new FakePricePort([]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: makePositionId('nonexistent'),
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('not-found');
  });
});
```

- [ ] **Step 5: Run application tests**

Run: `pnpm test --filter @clmm/application -- --reporter=verbose --run`
Expected: PASS (tests will need the fakes from Task 6 first — run after Task 6)

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/positions/ListSupportedPositions.ts packages/application/src/use-cases/positions/ListSupportedPositions.test.ts packages/application/src/use-cases/positions/GetPositionDetail.ts packages/application/src/use-cases/positions/GetPositionDetail.test.ts
git commit -m "feat(application): enrich position use cases with pool data, prices, and USD values"
```

---

### Task 6: Update testing fakes and fixtures

**Files:**
- Create: `packages/testing/src/fakes/FakePricePort.ts`
- Modify: `packages/testing/src/fakes/FakeSupportedPositionReadPort.ts`
- Modify: `packages/testing/src/fixtures/positions.ts`
- Modify: `packages/testing/src/contracts/PositionReadPortContract.ts`
- Modify: `packages/testing/src/fakes/index.ts`
- Modify: `packages/testing/src/fixtures/index.ts`
- Modify: `packages/testing/src/index.ts`

- [ ] **Step 1: Create FakePricePort**

```typescript
// packages/testing/src/fakes/FakePricePort.ts
import type { PricePort } from '@clmm/application';
import type { PriceQuote } from '@clmm/domain';

export class FakePricePort implements PricePort {
  constructor(private readonly quotes: PriceQuote[] = []) {}

  async getPrices(tokenMints: readonly string[]): Promise<readonly PriceQuote[]> {
    return this.quotes.filter((q) => tokenMints.includes(q.tokenMint));
  }
}
```

- [ ] **Step 2: Update FakeSupportedPositionReadPort**

```typescript
// packages/testing/src/fakes/FakeSupportedPositionReadPort.ts
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, PositionId, WalletId, PoolId, PoolData, PositionDetail } from '@clmm/domain';

export class FakeSupportedPositionReadPort implements SupportedPositionReadPort {
  constructor(
    private readonly _positions: LiquidityPosition[] = [],
    private readonly _poolDataMap: Record<string, PoolData> = {},
    private readonly _positionDetail: PositionDetail | null = null,
  ) {}

  async listSupportedPositions(_walletId: WalletId): Promise<LiquidityPosition[]> {
    return [...this._positions];
  }

  async getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null> {
    return this._positions.find((p) => p.walletId === walletId && p.positionId === positionId) ?? null;
  }

  async getPositionDetail(_walletId: WalletId, _positionId: PositionId): Promise<PositionDetail | null> {
    return this._positionDetail;
  }

  async getPoolData(poolId: PoolId): Promise<PoolData | null> {
    return this._poolDataMap[poolId] ?? null;
  }
}
```

- [ ] **Step 3: Add fixtures**

Add to `packages/testing/src/fixtures/positions.ts`:

```typescript
import type { PoolData, PositionDetail, PriceQuote } from '@clmm/domain';

export const FIXTURE_POOL_DATA: PoolData = {
  poolId: FIXTURE_POOL_ID,
  tokenPair: {
    mintA: 'So11111111111111111111111111111111111111112',
    mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbolA: 'SOL',
    symbolB: 'USDC',
    decimalsA: 9,
    decimalsB: 6,
  },
  sqrtPrice: 184467440737095516n,
  feeRate: 10,
  tickSpacing: 64,
  liquidity: 2400000000n,
  tickCurrentIndex: 150,
};

export const FIXTURE_POSITION_DETAIL: PositionDetail = {
  position: FIXTURE_POSITION_IN_RANGE,
  poolData: FIXTURE_POOL_DATA,
  fees: {
    feeOwedA: 120000000n,
    feeOwedB: 47230000n,
    rewardInfos: [],
  },
  positionLiquidity: 5000000000n,
};

export const FIXTURE_SOL_PRICE_QUOTE: PriceQuote = {
  tokenMint: 'So11111111111111111111111111111111111111112',
  usdValue: 150,
  symbol: 'SOL',
  quotedAt: makeClockTimestamp(Date.now()),
};

export const FIXTURE_USDC_PRICE_QUOTE: PriceQuote = {
  tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  usdValue: 1,
  symbol: 'USDC',
  quotedAt: makeClockTimestamp(Date.now()),
};
```

- [ ] **Step 4: Update barrel exports**

Add to `packages/testing/src/fakes/index.ts`:

```typescript
export { FakePricePort } from './FakePricePort.js';
```

Add to `packages/testing/src/fixtures/index.ts`:

```typescript
export {
  FIXTURE_POOL_DATA,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from './positions.js';
```

Update `packages/testing/src/index.ts` to re-export the new fakes and fixtures.

- [ ] **Step 5: Update contract tests**

Add to `packages/testing/src/contracts/PositionReadPortContract.ts`:

```typescript
it('implements getPositionDetail returning PositionDetail or null', async () => {
  const port = factory();
  const result = await port.getPositionDetail(makeWalletId('test-wallet'), makePositionId('test-pos'));
  expect(result === null || (typeof result === 'object' && 'position' in result && 'poolData' in result && 'fees' in result)).toBe(true);
});

it('implements getPoolData returning PoolData or null', async () => {
  const port = factory();
  const result = await port.getPoolData(makePoolId('test-pool'));
  expect(result === null || (typeof result === 'object' && 'tokenPair' in result && 'sqrtPrice' in result)).toBe(true);
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/testing/src/fakes/FakePricePort.ts packages/testing/src/fakes/FakeSupportedPositionReadPort.ts packages/testing/src/fakes/index.ts packages/testing/src/fixtures/positions.ts packages/testing/src/fixtures/index.ts packages/testing/src/contracts/PositionReadPortContract.ts packages/testing/src/index.ts
git commit -m "feat(testing): add FakePricePort, update fakes/fixtures for position enrichment"
```

---

### Task 7: Update PositionController and DI wiring

**Files:**
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.ts`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`

- [ ] **Step 1: Add PRICE_PORT token**

Add to `packages/adapters/src/inbound/http/tokens.ts`:

```typescript
export const PRICE_PORT = 'PRICE_PORT';
```

- [ ] **Step 2: Update PositionController**

Update `packages/adapters/src/inbound/http/PositionController.ts` to inject `PricePort` and use enriched use case results.

Replace the `toPositionSummaryDto` function:

```typescript
function toPositionSummaryDto(
  dto: PositionSummaryDto,
  hasActionableTrigger = false,
): PositionSummaryDto {
  return {
    ...dto,
    hasActionableTrigger,
  };
}
```

Replace the `toPositionDetailDto` function — it now spreads the enriched `PositionDetailDto` from the use case:

```typescript
function toPositionDetailDto(
  dto: PositionDetailDto,
  trigger: ExitTrigger | null,
): PositionDetailDto {
  return {
    ...dto,
    hasActionableTrigger: trigger !== null,
    ...(trigger
      ? {
          triggerId: trigger.triggerId,
          breachDirection: trigger.breachDirection,
        }
      : {}),
  };
}
```

Update imports to include `PricePort` and `PRICE_PORT`:

```typescript
import type {
  SupportedPositionReadPort,
  PricePort,
  TriggerRepository,
} from '@clmm/application';
import type {
  PositionSummaryDto,
  PositionDetailDto,
} from '@clmm/application';
import { PRICE_PORT, SUPPORTED_POSITION_READ_PORT, TRIGGER_REPOSITORY, CURRENT_SR_LEVELS_PORT, SR_LEVELS_POOL_ALLOWLIST } from './tokens.js';
```

Update the constructor to inject `PricePort`:

```typescript
constructor(
  @Inject(SUPPORTED_POSITION_READ_PORT)
  private readonly positionReadPort: SupportedPositionReadPort,
  @Inject(PRICE_PORT)
  private readonly pricePort: PricePort,
  @Inject(TRIGGER_REPOSITORY)
  private readonly triggerRepo: TriggerRepository,
  @Inject(CURRENT_SR_LEVELS_PORT)
  private readonly srLevelsPort: CurrentSrLevelsPort,
  @Inject(SR_LEVELS_POOL_ALLOWLIST)
  private readonly srLevelsAllowlist: Map<string, { symbol: string; source: string }>,
) {}
```

Update the `listPositions` method to use the enriched `summaryDtos`:

```typescript
@Get(':walletId')
async listPositions(@Param('walletId') walletId: string) {
  const wallet = makeWalletId(walletId);

  let summaryDtos: PositionSummaryDto[];
  try {
    const result = await listSupportedPositions({
      walletId: wallet,
      positionReadPort: this.positionReadPort,
      pricePort: this.pricePort,
    });
    summaryDtos = result.summaryDtos;
  } catch (error: unknown) {
    if (!isTransientPositionReadFailure(error)) {
      throw error;
    }
    return {
      positions: [],
      error: 'Unable to fetch positions. Position data temporarily unavailable.',
    };
  }

  let triggerPositionIds: ReadonlySet<string> = new Set();
  let triggerError: string | undefined;

  try {
    const actionableTriggers = await this.triggerRepo.listActionableTriggers(wallet);
    triggerPositionIds = new Set(actionableTriggers.map((t) => t.positionId));
  } catch (error: unknown) {
    if (!isTransientPositionReadFailure(error)) {
      throw error;
    }
    triggerError = 'Unable to fetch trigger data. Trigger status may be incomplete.';
  }

  return {
    positions: summaryDtos.map((dto) => toPositionSummaryDto(dto, triggerPositionIds.has(dto.positionId))),
    ...(triggerError ? { error: triggerError } : {}),
  };
}
```

Update the `getPosition` (detail) method to use enriched `detailDto`:

```typescript
@Get(':walletId/:positionId')
async getPosition(
  @Param('walletId') walletId: string,
  @Param('positionId') positionId: string,
) {
  const wallet = makeWalletId(walletId);
  const result = await getPositionDetail({
    walletId: wallet,
    positionId: makePositionId(positionId),
    positionReadPort: this.positionReadPort,
    pricePort: this.pricePort,
  });

  if (result.kind === 'not-found') {
    throw new NotFoundException(`Position not found: ${positionId}`);
  }

  if (result.position.walletId !== wallet) {
    throw new NotFoundException(`Position not found: ${positionId}`);
  }

  let trigger: import('@clmm/domain').ExitTrigger | null = null;
  let triggerError: string | undefined;
  let srLevels: DtoSrLevelsBlock | undefined;

  const allowlistEntry = this.srLevelsAllowlist.get(result.position.poolId);

  if (allowlistEntry) {
    const [triggerResult, srResult] = await Promise.all([
      this.triggerRepo.listActionableTriggers(wallet).then(
        (triggers) => ({ ok: true as const, triggers }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
      this.srLevelsPort.fetchCurrent(allowlistEntry.symbol, allowlistEntry.source).then(
        (block) => block,
        () => null,
      ),
    ]);

    if (triggerResult.ok) {
      trigger = triggerResult.triggers.find((c) => c.positionId === result.position.positionId) ?? null;
    } else if (isTransientPositionReadFailure(triggerResult.error)) {
      triggerError = 'Unable to fetch trigger data. Position data temporarily unavailable.';
    } else {
      throw triggerResult.error;
    }

    if (srResult) {
      srLevels = srResult;
    }
  } else {
    try {
      const actionableTriggers = await this.triggerRepo.listActionableTriggers(wallet);
      trigger =
        actionableTriggers.find((candidate) => candidate.positionId === result.position.positionId) ?? null;
    } catch (error: unknown) {
      if (!isTransientPositionReadFailure(error)) {
        throw error;
      }
      triggerError = 'Unable to fetch trigger data. Position data temporarily unavailable.';
    }
  }

  return {
    position: {
      ...toPositionDetailDto(result.detailDto, trigger),
      ...(srLevels ? { srLevels } : {}),
    },
    ...(triggerError ? { error: triggerError } : {}),
  };
}
```

- [ ] **Step 3: Wire JupiterPriceAdapter in AppModule**

In `packages/adapters/src/inbound/http/AppModule.ts`, add imports and wiring:

```typescript
import { JupiterPriceAdapter } from '../../outbound/price/JupiterPriceAdapter.js';
```

Add to the `tokens.js` import:

```typescript
import {
  // ... existing tokens
  PRICE_PORT,
} from './tokens.js';
```

Create the adapter instance:

```typescript
const jupiterPrice = new JupiterPriceAdapter();
```

Add to the providers array:

```typescript
{ provide: PRICE_PORT, useValue: jupiterPrice },
```

- [ ] **Step 4: Wire JupiterPriceAdapter in AdaptersModule**

In `packages/adapters/src/composition/AdaptersModule.ts`, add the same wiring:

```typescript
import { JupiterPriceAdapter } from '../outbound/price/JupiterPriceAdapter.js';
```

Add `PRICE_PORT` to the tokens import from `'../inbound/jobs/tokens.js'`.

Create the instance and add to `sharedProviders`:

```typescript
const jupiterPrice = new JupiterPriceAdapter();
```

```typescript
{ provide: PRICE_PORT, useValue: jupiterPrice },
```

- [ ] **Step 5: Run build + typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts packages/adapters/src/inbound/http/PositionController.ts packages/adapters/src/inbound/http/AppModule.ts packages/adapters/src/composition/AdaptersModule.ts
git commit -m "feat(adapters): wire PricePort and update PositionController for enriched data"
```

---

### Task 8: Update UI view models and components

**Files:**
- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.ts`
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.test.ts`
- Modify: `packages/ui/src/components/PositionCard.tsx`

- [ ] **Step 1: Update PositionListViewModel**

```typescript
// packages/ui/src/view-models/PositionListViewModel.ts
import type { PositionSummaryDto } from '@clmm/application/public';

export type PositionListItemViewModel = {
  positionId: string;
  poolLabel: string;
  currentPriceLabel: string;
  feeRateLabel: string;
  rangeStatusLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  rangeDistanceLabel: string;
  hasAlert: boolean;
  monitoringLabel: string;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

function rangeStateLabel(kind: string): string {
  switch (kind) {
    case 'in-range': return 'In Range';
    case 'below-range': return 'Below Range';
    case 'above-range': return 'Above Range';
    default: return 'Unknown';
  }
}

function monitoringLabel(status: string): string {
  switch (status) {
    case 'active': return 'Monitoring Active';
    case 'degraded': return 'Monitoring Degraded';
    case 'inactive': return 'Monitoring Inactive';
    default: return 'Unknown';
  }
}

function rangeDistanceLabel(distance: { belowLowerPercent: number; aboveUpperPercent: number }): string {
  if (distance.belowLowerPercent > 0) {
    return `${distance.belowLowerPercent.toFixed(1)}% below lower`;
  }
  if (distance.aboveUpperPercent > 0) {
    return `${distance.aboveUpperPercent.toFixed(1)}% above upper`;
  }
  return 'In range';
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolLabel: p.tokenPairLabel,
    currentPriceLabel: p.currentPriceLabel,
    feeRateLabel: p.feeRateLabel,
    rangeStatusLabel: rangeStateLabel(p.rangeState),
    rangeStatusKind: p.rangeState,
    rangeDistanceLabel: rangeDistanceLabel(p.rangeDistance),
    hasAlert: p.hasActionableTrigger,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
  }));

  return { items, isEmpty: items.length === 0 };
}
```

- [ ] **Step 2: Update PositionDetailViewModel**

```typescript
// packages/ui/src/view-models/PositionDetailViewModel.ts
import type { PositionDetailDto } from '@clmm/application/public';
import { getRangeStatusBadgeProps } from '../components/RangeStatusBadgeUtils.js';

export type SrLevelsViewModelBlock = {
  supportsSorted: Array<{ priceLabel: string; rankLabel?: string }>;
  resistancesSorted: Array<{ priceLabel: string; rankLabel?: string }>;
  freshnessLabel: string;
  isStale: boolean;
};

export type PositionDetailViewModel = {
  positionId: string;
  poolLabel: string;
  currentPriceLabel: string;
  feeRateLabel: string;
  rangeBoundsLabel: string;
  rangeStatusLabel: string;
  rangeStatusColorKey: string;
  rangeDistanceLabel: string;
  unclaimedFeesLabel: string;
  unclaimedFeesBreakdown: {
    feeA: string;
    feeB: string;
  };
  unclaimedRewardsLabel: string;
  positionSizeLabel: string;
  poolDepthLabel: string;
  hasAlert: boolean;
  alertLabel: string;
  breachDirectionLabel?: string;
  srLevels?: SrLevelsViewModelBlock;
};

function computeFreshness(capturedAtUnixMs: number, now: number): { freshnessLabel: string; isStale: boolean } {
  const ageMs = now - capturedAtUnixMs;
  if (ageMs < 3600000) {
    const minutes = Math.max(1, Math.round(ageMs / 60000));
    return { freshnessLabel: `captured ${minutes}m ago`, isStale: false };
  }
  const hours = Math.round(ageMs / 3600000);
  if (ageMs < 172800000) {
    return { freshnessLabel: `captured ${hours}h ago`, isStale: false };
  }
  return { freshnessLabel: `captured ${hours}h ago · stale`, isStale: true };
}

function toSrLevelsViewModelBlock(
  block: NonNullable<PositionDetailDto['srLevels']>,
  now: number,
): SrLevelsViewModelBlock {
  const { freshnessLabel, isStale } = computeFreshness(block.capturedAtUnixMs, now);

  const supportsSorted = [...block.supports]
    .sort((a, b) => a.price - b.price)
    .map((s) => ({
      priceLabel: `$${s.price.toFixed(2)}`,
      ...(s.rank ? { rankLabel: s.rank } : {}),
    }));

  const resistancesSorted = [...block.resistances]
    .sort((a, b) => a.price - b.price)
    .map((r) => ({
      priceLabel: `$${r.price.toFixed(2)}`,
      ...(r.rank ? { rankLabel: r.rank } : {}),
    }));

  return { supportsSorted, resistancesSorted, freshnessLabel, isStale };
}

function formatTokenAmount(raw: bigint, decimals: number, symbol: string): string {
  const humanReadable = Number(raw) / 10 ** decimals;
  return `${humanReadable.toFixed(decimals > 2 ? 4 : 2)} ${symbol}`;
}

function rangeDistanceLabel(distance: { belowLowerPercent: number; aboveUpperPercent: number }): string {
  if (distance.belowLowerPercent > 0) {
    return `${distance.belowLowerPercent.toFixed(1)}% below lower bound`;
  }
  if (distance.aboveUpperPercent > 0) {
    return `${distance.aboveUpperPercent.toFixed(1)}% above upper bound`;
  }
  return 'In range';
}

export function buildPositionDetailViewModel(dto: PositionDetailDto, now: number): PositionDetailViewModel {
  const badge = getRangeStatusBadgeProps(dto.rangeState);

  const unclaimedFeesLabel = dto.unclaimedFees.totalUsd > 0
    ? `$${dto.unclaimedFees.totalUsd.toFixed(2)} in unclaimed fees`
    : `${formatTokenAmount(dto.unclaimedFees.feeOwedA.raw, dto.unclaimedFees.feeOwedA.decimals, dto.unclaimedFees.feeOwedA.symbol)} + ${formatTokenAmount(dto.unclaimedFees.feeOwedB.raw, dto.unclaimedFees.feeOwedB.decimals, dto.unclaimedFees.feeOwedB.symbol)} unclaimed`;

  const unclaimedRewardsLabel = dto.unclaimedRewards.totalUsd > 0
    ? `$${dto.unclaimedRewards.totalUsd.toFixed(2)} in rewards`
    : dto.unclaimedRewards.rewards.length > 0
      ? dto.unclaimedRewards.rewards.map((r) => formatTokenAmount(r.amount, r.decimals, r.symbol)).join(', ') + ' rewards'
      : 'No rewards';

  const base = {
    positionId: dto.positionId,
    poolLabel: dto.tokenPairLabel,
    currentPriceLabel: dto.currentPriceLabel,
    feeRateLabel: dto.feeRateLabel,
    rangeBoundsLabel: `$${dto.lowerBound} — $${dto.upperBound}`,
    rangeStatusLabel: badge.label,
    rangeStatusColorKey: badge.colorKey,
    rangeDistanceLabel: rangeDistanceLabel(dto.rangeDistance),
    unclaimedFeesLabel,
    unclaimedFeesBreakdown: {
      feeA: formatTokenAmount(dto.unclaimedFees.feeOwedA.raw, dto.unclaimedFees.feeOwedA.decimals, dto.unclaimedFees.feeOwedA.symbol),
      feeB: formatTokenAmount(dto.unclaimedFees.feeOwedB.raw, dto.unclaimedFees.feeOwedB.decimals, dto.unclaimedFees.feeOwedB.symbol),
    },
    unclaimedRewardsLabel,
    positionSizeLabel: `${dto.positionLiquidity.toString()} liquidity units`,
    poolDepthLabel: dto.poolDepthLabel,
    hasAlert: dto.hasActionableTrigger,
    alertLabel: dto.hasActionableTrigger ? 'Action Required' : 'No Alerts',
  };

  const srLevelsVm = dto.srLevels
    ? toSrLevelsViewModelBlock(dto.srLevels, now)
    : undefined;

  if (dto.breachDirection) {
    return {
      ...base,
      breachDirectionLabel: dto.breachDirection.kind === 'lower-bound-breach'
        ? 'Price dropped below lower bound'
        : 'Price rose above upper bound',
      ...(srLevelsVm ? { srLevels: srLevelsVm } : {}),
    };
  }

  return { ...base, ...(srLevelsVm ? { srLevels: srLevelsVm } : {}) };
}
```

- [ ] **Step 3: Update PositionDetailViewModel tests**

Update `packages/ui/src/view-models/PositionDetailViewModel.test.ts` to use the enriched DTO structure. The test data needs to match the new `PositionDetailDto` shape with `tokenPairLabel`, `currentPriceLabel`, `feeRateLabel`, `rangeDistance`, and the nested `unclaimedFees`/`unclaimedRewards` structures.

- [ ] **Step 4: Update PositionCard component**

Update `packages/ui/src/components/PositionCard.tsx` to render the new view model fields (`currentPriceLabel`, `feeRateLabel`, `rangeDistanceLabel`) instead of the old minimal fields.

- [ ] **Step 5: Run UI tests + typecheck**

Run: `pnpm test --filter @clmm/ui -- --reporter=verbose --run && pnpm typecheck --filter @clmm/ui`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts packages/ui/src/view-models/PositionDetailViewModel.ts packages/ui/src/view-models/PositionDetailViewModel.test.ts packages/ui/src/components/PositionCard.tsx
git commit -m "feat(ui): update view models and components for enriched position display"
```

---

### Task 9: Full repo validation

**Files:** None (verification only)

- [ ] **Step 1: Run full repo checks**

Run: `pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test`
Expected: All PASS

- [ ] **Step 2: Fix any failures**

Address type errors, lint issues, boundary violations, or test failures.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve validation issues from position data enrichment"
```