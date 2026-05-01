# SOL/USDC Insights Data API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose three read-only HTTP endpoints (`GET /insights/sol-usdc/pool`, `GET /insights/sol-usdc/positions/:walletId`, `GET /insights/sol-usdc/bundle/:walletId`) so the external `clmm-autopilot-pipeline` can read deterministic SOL/USDC pool, position, alert, and S/R snapshots from the existing CLMM backend without making its own Solana RPC calls.

**Architecture:** Application-layer use cases own all orchestration (pool snapshot, positions filtered to the SOL/USDC allowlist, actionable triggers, S/R, USD valuation, distance computation). A new application-layer `SrLevelsReadPort` keeps the boundary clean — `CurrentSrLevelsAdapter` will implement it. A thin `InsightsDataController` maps HTTP params to use cases and discriminated-union failure results to HTTP `503` with stable `SolUsdcInsightErrorDto` payloads. The adapter port `CurrentSrLevelsPort` (regime-engine) is unchanged so `SrLevelsController` keeps working.

**Tech Stack:** TypeScript, NestJS + Fastify (BFF, hexagonal), pnpm workspaces, Vitest. Source spec: [`docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md`](../specs/2026-05-01-sol-usdc-insights-data-api-design.md).

---

## Pre-Flight

- [ ] **Step 1: Bootstrap the worktree if needed**

Per `AGENTS.md`, fresh worktrees may need install + build before testing.

```bash
[ -d node_modules ] || pnpm install --frozen-lockfile
[ -d packages/application/dist ] || pnpm build
```

Expected: dependencies and build outputs present. Skip if the workspace is already bootstrapped.

- [ ] **Step 2: Confirm baseline is green**

Run: `pnpm typecheck && pnpm --filter @clmm/application test && pnpm --filter @clmm/adapters test`
Expected: all pass. If anything fails before any change, stop and report — the plan assumes a green baseline.

---

## Phase 1 — Application DTOs and Port

End state: `packages/application` exports the new insight DTOs and the new `SrLevelsReadPort`. No use case yet — additive only, no other code references these types.

### Task 1: Add insight DTOs to `packages/application/src/dto/index.ts`

**Files:**
- Modify: `packages/application/src/dto/index.ts`

The existing `SrLevelsBlock` type stays as-is. Append the new insight DTOs at the bottom of the file. The `pair: 'SOL/USDC'` and `source: 'orca'` literals are intentional — the API is deliberately narrow in v1. `unclaimedFeesUsd: number | null` and `unclaimedRewardsUsd: number | null` preserve the difference between known-zero and unavailable-valuation (the existing `PositionDetailDto.unclaimedFees.totalUsd` collapses both to `0`, which is wrong for the pipeline).

- [ ] **Step 1: Append the insight DTOs to `packages/application/src/dto/index.ts`**

Append (after the existing `EntryContextDto` definition):

```ts
// --- Insight DTOs (SOL/USDC v1) ---
//
// Consumed by the external clmm-autopilot-pipeline. The pair/source literals
// are intentional: this is an opinionated, single-pool read API. Adding more
// pools requires explicit DTO and allowlist work — there is no generic
// multi-pool registry in v1. See spec at
// docs/superpowers/specs/2026-05-01-sol-usdc-insights-data-api-design.md.

export type InsightDataWarning = {
  code:
    | 'sr_levels_unavailable'
    | 'actionable_triggers_unavailable'
    | 'fee_reward_usd_unavailable'
    | 'price_distance_unavailable';
  message: string;
  scope?: {
    poolId?: string;
    positionId?: string;
  };
};

export type InsightDataQualityDto = {
  partial: boolean;
  warnings: InsightDataWarning[];
};

export type SolUsdcPoolSnapshotDto = {
  poolId: string;
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  sqrtPrice: string;
  tickCurrentIndex: number;
  tickSpacing: number;
  feeRate: number;
  feeRateLabel: string;
  poolLiquidity: string;
  // priceSource is NOT cache provenance — it only describes the deterministic
  // calculation source for currentPrice.
  priceSource: 'orca_whirlpool_sqrt_price';
};

export type SolUsdcFeeAmountDto = {
  raw: string;
  decimals: number | null;
  symbol: string;
  mint?: string;
};

export type SolUsdcRewardAmountDto = {
  mint: string;
  raw: string;
  decimals: number | null;
  symbol: string;
};

export type ExternalBreachDirection =
  | 'lower-bound-breach'
  | 'upper-bound-breach';

export type SolUsdcPositionInsightDto = {
  walletId: string;
  positionId: string;
  poolId: string;
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  lowerTick: number;
  upperTick: number;
  currentTick: number;
  lowerPriceLabel: string;
  upperPriceLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  rangeDistance: {
    belowLowerTickPercent: number;
    aboveUpperTickPercent: number;
    belowLowerPricePercent?: number;
    aboveUpperPricePercent?: number;
  };
  feeRateLabel: string;
  unclaimedFees: {
    feeOwedA: SolUsdcFeeAmountDto;
    feeOwedB: SolUsdcFeeAmountDto;
  };
  unclaimedRewards: SolUsdcRewardAmountDto[];
  // null distinguishes "valuation unavailable" from a real zero. See spec
  // §"USD Valuation Flow" — do not collapse to 0.
  unclaimedFeesUsd: number | null;
  unclaimedRewardsUsd: number | null;
  positionLiquidity: string;
  poolLiquidity: string;
  hasActionableTrigger: boolean;
  triggerId?: string;
  breachDirection?: ExternalBreachDirection;
};

export type SolUsdcPositionSnapshotDto = {
  walletId: string;
  positions: SolUsdcPositionInsightDto[];
  dataQuality: InsightDataQualityDto;
};

export type SolUsdcInsightInputBundleDto = {
  pair: 'SOL/USDC';
  source: 'orca';
  observedAtUnixMs: number;
  pool: SolUsdcPoolSnapshotDto;
  // S/R lives once at the bundle top level, never copied per position.
  srLevels: SrLevelsBlock | null;
  positions: SolUsdcPositionInsightDto[];
  alerts: Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;
  dataQuality: InsightDataQualityDto;
};

export type SolUsdcInsightErrorDto = {
  code:
    | 'pool_snapshot_unavailable'
    | 'position_list_unavailable'
    | 'position_detail_unavailable';
  message: string;
  pair: 'SOL/USDC';
  poolId: string;
  walletId?: string;
  positionId?: string;
  retryable: true;
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS — no consumer touches these types yet.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/dto/index.ts
git commit -m "feat(application): add SOL/USDC insight DTOs

Adds DTOs for the new /insights/sol-usdc/* read-only API, consumed by
the external clmm-autopilot-pipeline. USD valuation uses number|null to
preserve the distinction between known-zero and unavailable valuation."
```

### Task 2: Add `SrLevelsReadPort` to `packages/application/src/ports/index.ts`

**Files:**
- Modify: `packages/application/src/ports/index.ts`

`SrLevelsBlock` already exists in application DTOs and the adapter regime-engine duplicates the same shape behind the boundary rule. The new port lives in application so insight use cases can consume S/R without importing adapter types.

- [ ] **Step 1: Add the port and the SrLevelsBlock import to the ports file**

Modify the top of `packages/application/src/ports/index.ts`. Find the existing import block:

```ts
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
} from '@clmm/domain';
```

Add the following import directly under it:

```ts
import type { SrLevelsBlock } from '../dto/index.js';
```

Then append the new port at the end of the file (after `IdGeneratorPort`):

```ts
// --- S/R levels read port (application-owned; CurrentSrLevelsAdapter implements) ---

export interface SrLevelsReadPort {
  fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat(application): add SrLevelsReadPort

New application-layer port for the SOL/USDC insights use cases.
CurrentSrLevelsAdapter (in adapters) will implement this port so the
insight use cases can read S/R without crossing the boundary."
```

---

## Phase 2 — Application Use Cases

End state: three exported insight use cases (`getSolUsdcInsightPoolSnapshot`, `getSolUsdcInsightPositions`, `getSolUsdcInsightBundle`) with discriminated-union results, full unit test coverage, and exported from `@clmm/application`. The position-building path is shared between the positions use case and the bundle use case.

### Task 3: Create insight use-case directory + helper module

**Files:**
- Create: `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts`
- Create: `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts`

The position insight builder is the shared core for both `/positions/:walletId` and `/bundle/:walletId`. Putting it in its own module makes the shared shape explicit and lets the bundle/positions use cases stay short.

This builder takes detail-backed data (a single `PositionDetail`), the priced token map, and the observation timestamp, and returns one `SolUsdcPositionInsightDto`. It does NOT call any port — port orchestration lives in the use cases. It does NOT decide trigger enrichment — the caller sets `hasActionableTrigger`, `triggerId`, `breachDirection` after the build.

- [ ] **Step 1: Write the failing test**

Create `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSolUsdcPositionInsight } from './buildSolUsdcPositionInsight.js';
import {
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';

describe('buildSolUsdcPositionInsight', () => {
  it('returns a SOL/USDC position insight DTO with raw fee fields and tick distances', () => {
    const result = buildSolUsdcPositionInsight({
      detail: FIXTURE_POSITION_DETAIL,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        ['So11111111111111111111111111111111111111112', { usdValue: 150, symbol: 'SOL' }],
        ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { usdValue: 1, symbol: 'USDC' }],
      ]),
    });

    expect(result.insight.pair).toBe('SOL/USDC');
    expect(result.insight.source).toBe('orca');
    expect(result.insight.walletId).toBe(FIXTURE_POSITION_IN_RANGE.walletId);
    expect(result.insight.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.insight.lowerTick).toBe(100);
    expect(result.insight.upperTick).toBe(200);
    expect(result.insight.unclaimedFees.feeOwedA.raw).toBe('120000000');
    expect(result.insight.unclaimedFees.feeOwedA.decimals).toBe(9);
    expect(result.insight.unclaimedFees.feeOwedA.symbol).toBe('SOL');
    expect(result.insight.unclaimedFees.feeOwedB.raw).toBe('47230000');
    expect(result.insight.unclaimedFees.feeOwedB.symbol).toBe('USDC');
    expect(result.insight.unclaimedFeesUsd).not.toBeNull();
    expect(result.insight.unclaimedFeesUsd).toBeGreaterThan(0);
    expect(result.insight.unclaimedRewardsUsd).toBe(0);
    expect(result.insight.hasActionableTrigger).toBe(false);
    expect(result.insight.triggerId).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('returns null fee USD and a warning when fee prices are missing, and 0 rewards USD when there are no rewards', () => {
    const result = buildSolUsdcPositionInsight({
      detail: FIXTURE_POSITION_DETAIL,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map(), // no quotes
    });

    expect(result.insight.unclaimedFeesUsd).toBeNull();
    // Fixture has no rewards, so this is a real zero — not "unavailable".
    expect(result.insight.unclaimedRewardsUsd).toBe(0);
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')).toBeDefined();
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')?.scope?.positionId)
      .toBe(FIXTURE_POSITION_IN_RANGE.positionId);
  });

  it('returns null rewards USD and a warning when a reward price is missing', () => {
    const detailWithReward = {
      ...FIXTURE_POSITION_DETAIL,
      fees: {
        ...FIXTURE_POSITION_DETAIL.fees,
        rewardInfos: [
          { mint: 'RewardMint1111111111111111111111111111111111', amountOwed: 1_000n, decimals: 6 },
        ],
      },
    };
    const result = buildSolUsdcPositionInsight({
      detail: detailWithReward,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map([
        ['So11111111111111111111111111111111111111112', { usdValue: 150, symbol: 'SOL' }],
        ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', { usdValue: 1, symbol: 'USDC' }],
        // Reward mint price intentionally omitted.
      ]),
    });

    expect(result.insight.unclaimedFeesUsd).not.toBeNull();
    expect(result.insight.unclaimedRewardsUsd).toBeNull();
    expect(result.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')).toBeDefined();
  });

  it('omits price-distance fields and adds a warning when token decimals are missing', () => {
    const detailNoDecimals = {
      ...FIXTURE_POSITION_DETAIL,
      poolData: {
        ...FIXTURE_POSITION_DETAIL.poolData,
        tokenPair: {
          ...FIXTURE_POSITION_DETAIL.poolData.tokenPair,
          decimalsA: null,
          decimalsB: null,
        },
      },
    };

    const result = buildSolUsdcPositionInsight({
      detail: detailNoDecimals,
      observedAtUnixMs: 1_700_000_000_000,
      priceMap: new Map(),
    });

    expect(result.insight.rangeDistance.belowLowerPricePercent).toBeUndefined();
    expect(result.insight.rangeDistance.aboveUpperPricePercent).toBeUndefined();
    expect(result.warnings.find((w) => w.code === 'price_distance_unavailable')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/application test -- buildSolUsdcPositionInsight`
Expected: FAIL — `buildSolUsdcPositionInsight` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts`:

```ts
import type { PositionDetail } from '@clmm/domain';
import {
  priceFromSqrtPrice,
  rangeDistancePercent,
  tickToPrice,
  tokenAmountToUsd,
  formatFeeRateLabel,
} from '@clmm/domain';
import type {
  InsightDataWarning,
  SolUsdcFeeAmountDto,
  SolUsdcPositionInsightDto,
  SolUsdcRewardAmountDto,
} from '../../dto/index.js';

export type PriceMapEntry = { usdValue: number; symbol: string };

export type BuildSolUsdcPositionInsightResult = {
  insight: SolUsdcPositionInsightDto;
  warnings: InsightDataWarning[];
};

export function buildSolUsdcPositionInsight(params: {
  detail: PositionDetail;
  observedAtUnixMs: number;
  priceMap: Map<string, PriceMapEntry>;
}): BuildSolUsdcPositionInsightResult {
  const { detail, observedAtUnixMs, priceMap } = params;
  const { position, poolData, fees, positionLiquidity } = detail;
  const { decimalsA, decimalsB, mintA, mintB, symbolA, symbolB } = poolData.tokenPair;
  const decimalsKnown = decimalsA !== null && decimalsB !== null;
  const warnings: InsightDataWarning[] = [];

  const currentTick = poolData.tickCurrentIndex;
  const lowerTick = position.bounds.lowerBound;
  const upperTick = position.bounds.upperBound;

  const tickDistance = rangeDistancePercent(currentTick, lowerTick, upperTick);

  const currentPrice = decimalsKnown
    ? priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB)
    : position.rangeState.currentPrice;

  const currentPriceLabel = decimalsKnown
    ? `${symbolB} ${currentPrice.toFixed(2)}`
    : `tick: ${currentTick}`;

  const lowerPriceLabel = decimalsKnown
    ? `${symbolB} ${tickToPrice(lowerTick, decimalsA, decimalsB).toFixed(2)}`
    : `tick ${lowerTick}`;

  const upperPriceLabel = decimalsKnown
    ? `${symbolB} ${tickToPrice(upperTick, decimalsA, decimalsB).toFixed(2)}`
    : `tick ${upperTick}`;

  const rangeDistance: SolUsdcPositionInsightDto['rangeDistance'] = {
    belowLowerTickPercent: tickDistance.belowLowerPercent,
    aboveUpperTickPercent: tickDistance.aboveUpperPercent,
  };

  if (decimalsKnown) {
    const lowerPrice = tickToPrice(lowerTick, decimalsA, decimalsB);
    const upperPrice = tickToPrice(upperTick, decimalsA, decimalsB);
    const rangeWidth = upperPrice - lowerPrice;
    if (rangeWidth > 0) {
      if (currentPrice < lowerPrice) {
        rangeDistance.belowLowerPricePercent = ((lowerPrice - currentPrice) / rangeWidth) * 100;
        rangeDistance.aboveUpperPricePercent = 0;
      } else if (currentPrice > upperPrice) {
        rangeDistance.belowLowerPricePercent = 0;
        rangeDistance.aboveUpperPricePercent = ((currentPrice - upperPrice) / rangeWidth) * 100;
      } else {
        rangeDistance.belowLowerPricePercent = 0;
        rangeDistance.aboveUpperPricePercent = 0;
      }
    } else {
      warnings.push({
        code: 'price_distance_unavailable',
        message: 'Price distance unavailable: zero-width range.',
        scope: { positionId: position.positionId },
      });
    }
  } else {
    warnings.push({
      code: 'price_distance_unavailable',
      message: 'Price distance unavailable: missing token decimals.',
      scope: { positionId: position.positionId },
    });
  }

  const priceA = priceMap.get(mintA);
  const priceB = priceMap.get(mintB);

  const feeOwedA: SolUsdcFeeAmountDto = {
    raw: fees.feeOwedA.toString(),
    decimals: decimalsA,
    symbol: symbolA,
    mint: mintA,
  };

  const feeOwedB: SolUsdcFeeAmountDto = {
    raw: fees.feeOwedB.toString(),
    decimals: decimalsB,
    symbol: symbolB,
    mint: mintB,
  };

  const feeAUsdAvailable = decimalsA !== null && priceA !== undefined;
  const feeBUsdAvailable = decimalsB !== null && priceB !== undefined;
  let unclaimedFeesUsd: number | null;
  if (feeAUsdAvailable && feeBUsdAvailable) {
    const a = tokenAmountToUsd(fees.feeOwedA, decimalsA, priceA.usdValue);
    const b = tokenAmountToUsd(fees.feeOwedB, decimalsB, priceB.usdValue);
    unclaimedFeesUsd = a + b;
  } else {
    unclaimedFeesUsd = null;
    warnings.push({
      code: 'fee_reward_usd_unavailable',
      message: 'Fee USD valuation unavailable: missing price or decimals.',
      scope: { positionId: position.positionId },
    });
  }

  const rewardEntries: SolUsdcRewardAmountDto[] = fees.rewardInfos
    .filter((r) => r.mint !== '' && r.amountOwed !== 0n)
    .map((r) => {
      const rPrice = priceMap.get(r.mint);
      return {
        mint: r.mint,
        raw: r.amountOwed.toString(),
        decimals: r.decimals,
        symbol: rPrice?.symbol ?? r.mint,
      };
    });

  let unclaimedRewardsUsd: number | null;
  if (rewardEntries.length === 0) {
    unclaimedRewardsUsd = 0;
  } else {
    const allRewardsPriced = fees.rewardInfos
      .filter((r) => r.mint !== '' && r.amountOwed !== 0n)
      .every((r) => r.decimals !== null && priceMap.get(r.mint) !== undefined);
    if (allRewardsPriced) {
      unclaimedRewardsUsd = fees.rewardInfos
        .filter((r) => r.mint !== '' && r.amountOwed !== 0n)
        .reduce((sum, r) => {
          const rPrice = priceMap.get(r.mint);
          if (r.decimals === null || rPrice === undefined) return sum;
          return sum + tokenAmountToUsd(r.amountOwed, r.decimals, rPrice.usdValue);
        }, 0);
    } else {
      unclaimedRewardsUsd = null;
      const alreadyWarned = warnings.some(
        (w) => w.code === 'fee_reward_usd_unavailable' && w.scope?.positionId === position.positionId,
      );
      if (!alreadyWarned) {
        warnings.push({
          code: 'fee_reward_usd_unavailable',
          message: 'Reward USD valuation unavailable: missing price or decimals.',
          scope: { positionId: position.positionId },
        });
      }
    }
  }

  const insight: SolUsdcPositionInsightDto = {
    walletId: position.walletId,
    positionId: position.positionId,
    poolId: position.poolId,
    pair: 'SOL/USDC',
    source: 'orca',
    observedAtUnixMs,
    rangeState: position.rangeState.kind,
    lowerTick,
    upperTick,
    currentTick,
    lowerPriceLabel,
    upperPriceLabel,
    currentPrice,
    currentPriceLabel,
    rangeDistance,
    feeRateLabel: formatFeeRateLabel(poolData.feeRate),
    unclaimedFees: { feeOwedA, feeOwedB },
    unclaimedRewards: rewardEntries,
    unclaimedFeesUsd,
    unclaimedRewardsUsd,
    positionLiquidity: positionLiquidity.toString(),
    poolLiquidity: poolData.liquidity.toString(),
    hasActionableTrigger: false,
  };

  return { insight, warnings };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/application test -- buildSolUsdcPositionInsight`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.ts packages/application/src/use-cases/insights/buildSolUsdcPositionInsight.test.ts
git commit -m "feat(application): add SOL/USDC position insight builder

Shared core that turns a PositionDetail into a SolUsdcPositionInsightDto.
Used by both the positions and bundle insight use cases. Trigger
enrichment is layered on top by callers."
```

### Task 4: Implement `getSolUsdcInsightPoolSnapshot`

**Files:**
- Create: `packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.ts`
- Create: `packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.test.ts`

The pool snapshot is primary data. If the allowlisted SOL/USDC pool data is null OR lacks the required token decimals, return `pool-unavailable` — never fall back to a tick-only price for the allowlisted pool.

- [ ] **Step 1: Write the failing test**

Create `packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_POOL_DATA,
} from '@clmm/testing';
import { makePoolId } from '@clmm/domain';

const SOL_USDC_POOL_ID = makePoolId('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');

describe('getSolUsdcInsightPoolSnapshot', () => {
  it('returns ok with a populated SOL/USDC pool snapshot', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [],
      { [SOL_USDC_POOL_ID]: { ...FIXTURE_POOL_DATA, poolId: SOL_USDC_POOL_ID } },
    );
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.pool.poolId).toBe(SOL_USDC_POOL_ID);
      expect(result.pool.pair).toBe('SOL/USDC');
      expect(result.pool.source).toBe('orca');
      expect(result.pool.observedAtUnixMs).toBe(1_700_000_000_000);
      expect(result.pool.tickCurrentIndex).toBe(FIXTURE_POOL_DATA.tickCurrentIndex);
      expect(result.pool.tickSpacing).toBe(FIXTURE_POOL_DATA.tickSpacing);
      expect(result.pool.feeRate).toBe(FIXTURE_POOL_DATA.feeRate);
      expect(result.pool.sqrtPrice).toBe(FIXTURE_POOL_DATA.sqrtPrice.toString());
      expect(result.pool.poolLiquidity).toBe(FIXTURE_POOL_DATA.liquidity.toString());
      expect(result.pool.priceSource).toBe('orca_whirlpool_sqrt_price');
      expect(result.pool.currentPrice).toBeGreaterThan(0);
    }
  });

  it('returns pool-unavailable when getPoolData resolves null', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([], {});
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('returns pool-unavailable when getPoolData throws', async () => {
    const positionReadPort = {
      listSupportedPositions: async () => [],
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => { throw new Error('rpc timeout'); },
    } as unknown as FakeSupportedPositionReadPort;
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('returns pool-unavailable when token decimals are missing', async () => {
    const noDecimalsPool = {
      ...FIXTURE_POOL_DATA,
      poolId: SOL_USDC_POOL_ID,
      tokenPair: { ...FIXTURE_POOL_DATA.tokenPair, decimalsA: null, decimalsB: null },
    };
    const positionReadPort = new FakeSupportedPositionReadPort(
      [],
      { [SOL_USDC_POOL_ID]: noDecimalsPool },
    );
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });
    expect(result.kind).toBe('pool-unavailable');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/application test -- GetSolUsdcInsightPoolSnapshot`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.ts`:

```ts
import type { PoolId } from '@clmm/domain';
import { priceFromSqrtPrice, formatFeeRateLabel } from '@clmm/domain';
import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { SolUsdcPoolSnapshotDto } from '../../dto/index.js';

export type GetSolUsdcInsightPoolSnapshotResult =
  | { kind: 'ok'; pool: SolUsdcPoolSnapshotDto }
  | { kind: 'pool-unavailable' };

export async function getSolUsdcInsightPoolSnapshot(params: {
  poolId: PoolId;
  positionReadPort: SupportedPositionReadPort;
  now: () => number;
}): Promise<GetSolUsdcInsightPoolSnapshotResult> {
  let poolData;
  try {
    poolData = await params.positionReadPort.getPoolData(params.poolId);
  } catch {
    return { kind: 'pool-unavailable' };
  }
  if (!poolData) return { kind: 'pool-unavailable' };

  const { decimalsA, decimalsB, symbolA, symbolB } = poolData.tokenPair;
  if (decimalsA === null || decimalsB === null) {
    return { kind: 'pool-unavailable' };
  }

  const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB);

  const pool: SolUsdcPoolSnapshotDto = {
    poolId: poolData.poolId,
    pair: 'SOL/USDC',
    source: 'orca',
    observedAtUnixMs: params.now(),
    tokenPairLabel: `${symbolA} / ${symbolB}`,
    currentPrice,
    currentPriceLabel: `${symbolB} ${currentPrice.toFixed(2)}`,
    sqrtPrice: poolData.sqrtPrice.toString(),
    tickCurrentIndex: poolData.tickCurrentIndex,
    tickSpacing: poolData.tickSpacing,
    feeRate: poolData.feeRate,
    feeRateLabel: formatFeeRateLabel(poolData.feeRate),
    poolLiquidity: poolData.liquidity.toString(),
    priceSource: 'orca_whirlpool_sqrt_price',
  };

  return { kind: 'ok', pool };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/application test -- GetSolUsdcInsightPoolSnapshot`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPoolSnapshot.test.ts
git commit -m "feat(application): add SOL/USDC pool snapshot use case

Returns pool-unavailable on null pool data, RPC error, or missing
decimals. The allowlisted SOL/USDC pool snapshot is primary data; we
never fall back to tick-only pricing here."
```

### Task 5: Implement `getSolUsdcInsightPositions`

**Files:**
- Create: `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts`
- Create: `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts`

This use case validates the pool first, lists wallet positions, filters to the allowlisted SOL/USDC pool, then sequentially reads `getPositionDetail` for each filtered position. Trigger enrichment is layered on top. S/R is NOT included here — that lives only on the bundle response.

Detail reads MUST be sequential (or bounded). Spec rule: "Do not use unbounded `Promise.all` over `getPositionDetail`." A wallet with many positions would fan out RPC calls and exceed Helius rate limits.

- [ ] **Step 1: Write the failing test**

Create `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSolUsdcInsightPositions } from './GetSolUsdcInsightPositions.js';
import {
  FakeSupportedPositionReadPort,
  FakeTriggerRepository,
  FakePricePort,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POOL_DATA,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import {
  makePoolId,
  makePositionId,
  makeWalletId,
  makeClockTimestamp,
} from '@clmm/domain';
import type {
  BreachEpisodeId,
  ExitTriggerId,
  PositionDetail,
} from '@clmm/domain';

const SOL_USDC_POOL_ID = makePoolId('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
const OTHER_POOL_ID = makePoolId('OtherPool11111111111111111111111111111111111');

const now = () => 1_700_000_000_000;

function poolDataFor(poolId: typeof SOL_USDC_POOL_ID) {
  return { ...FIXTURE_POOL_DATA, poolId };
}

function positionInPool(positionId: string, poolId: typeof SOL_USDC_POOL_ID) {
  return {
    ...FIXTURE_POSITION_IN_RANGE,
    positionId: makePositionId(positionId),
    poolId,
  };
}

function detailFor(positionId: string, poolId: typeof SOL_USDC_POOL_ID): PositionDetail {
  return {
    ...FIXTURE_POSITION_DETAIL,
    position: positionInPool(positionId, poolId),
    poolData: poolDataFor(poolId),
  };
}

describe('getSolUsdcInsightPositions', () => {
  it('returns pool-unavailable when the pool snapshot fails', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([], {});
    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('returns position-list-unavailable when listSupportedPositions throws', async () => {
    const positionReadPort = {
      listSupportedPositions: async () => { throw new Error('rpc unreachable'); },
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });
    expect(result.kind).toBe('position-list-unavailable');
  });

  it('filters out positions not in the allowlisted SOL/USDC pool and never reads their detail', async () => {
    const inPoolPosition = positionInPool('pos-in', SOL_USDC_POOL_ID);
    const outOfPoolPosition = positionInPool('pos-out', OTHER_POOL_ID);

    const detailReads: string[] = [];
    const positionReadPort = {
      listSupportedPositions: async () => [inPoolPosition, outOfPoolPosition],
      getPosition: async () => null,
      getPositionDetail: async (_w: never, positionId: string) => {
        detailReads.push(positionId);
        return detailFor(positionId, SOL_USDC_POOL_ID);
      },
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions).toHaveLength(1);
      expect(result.snapshot.positions[0].positionId).toBe('pos-in');
    }
    expect(detailReads).toEqual(['pos-in']);
  });

  it('returns an empty positions list with partial=false when no positions match', async () => {
    const onlyOther = positionInPool('pos-other', OTHER_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [onlyOther],
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions).toEqual([]);
      expect(result.snapshot.dataQuality.partial).toBe(false);
      expect(result.snapshot.dataQuality.warnings).toEqual([]);
    }
  });

  it('returns position-detail-unavailable with the failed positionId', async () => {
    const inPool = positionInPool('pos-broken', SOL_USDC_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [inPool],
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });

    expect(result.kind).toBe('position-detail-unavailable');
    if (result.kind === 'position-detail-unavailable') {
      expect(result.positionId).toBe('pos-broken');
    }
  });

  it('attaches actionable trigger fields and normalizes breachDirection', async () => {
    const inPool = positionInPool('pos-trig', SOL_USDC_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [inPool],
      getPosition: async () => null,
      getPositionDetail: async () => detailFor('pos-trig', SOL_USDC_POOL_ID),
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trig-1', {
      triggerId: 'trig-1' as ExitTriggerId,
      positionId: makePositionId('pos-trig'),
      episodeId: 'ep-1' as BreachEpisodeId,
      breachDirection: { kind: 'upper-bound-breach' },
      triggeredAt: makeClockTimestamp(123),
      confirmationEvaluatedAt: makeClockTimestamp(124),
      confirmationPassed: true,
    });

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const p = result.snapshot.positions[0];
      expect(p.hasActionableTrigger).toBe(true);
      expect(p.triggerId).toBe('trig-1');
      expect(p.breachDirection).toBe('upper-bound-breach');
    }
  });

  it('adds actionable_triggers_unavailable warning when trigger fetch fails', async () => {
    const inPool = positionInPool('pos-trig', SOL_USDC_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [inPool],
      getPosition: async () => null,
      getPositionDetail: async () => detailFor('pos-trig', SOL_USDC_POOL_ID),
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const triggerRepo = {
      getTrigger: async () => null,
      listActionableTriggers: async () => { throw new Error('db down'); },
      deleteTrigger: async () => undefined,
    } as unknown as FakeTriggerRepository;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions[0].hasActionableTrigger).toBe(false);
      expect(result.snapshot.dataQuality.partial).toBe(true);
      expect(
        result.snapshot.dataQuality.warnings.find((w) => w.code === 'actionable_triggers_unavailable'),
      ).toBeDefined();
    }
  });

  it('reads position details sequentially (one in flight at a time)', async () => {
    const ids = ['a', 'b', 'c'];
    const positions = ids.map((id) => positionInPool(id, SOL_USDC_POOL_ID));
    let inFlight = 0;
    let maxInFlight = 0;

    const positionReadPort = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async (_w: never, positionId: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return detailFor(positionId, SOL_USDC_POOL_ID);
      },
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(maxInFlight).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/application test -- GetSolUsdcInsightPositions`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts`:

```ts
import type { PoolId, WalletId, PositionDetail } from '@clmm/domain';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PricePort,
} from '../../ports/index.js';
import type {
  SolUsdcPositionSnapshotDto,
  SolUsdcPositionInsightDto,
  InsightDataWarning,
  ExternalBreachDirection,
} from '../../dto/index.js';
import {
  buildSolUsdcPositionInsight,
  type PriceMapEntry,
} from './buildSolUsdcPositionInsight.js';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';

export type GetSolUsdcInsightPositionsResult =
  | { kind: 'ok'; snapshot: SolUsdcPositionSnapshotDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };

export async function getSolUsdcInsightPositions(params: {
  walletId: WalletId;
  poolId: PoolId;
  positionReadPort: SupportedPositionReadPort;
  triggerRepo: TriggerRepository;
  pricePort: PricePort;
  now: () => number;
}): Promise<GetSolUsdcInsightPositionsResult> {
  const { walletId, poolId, positionReadPort, triggerRepo, pricePort, now } = params;

  const poolResult = await getSolUsdcInsightPoolSnapshot({ poolId, positionReadPort, now });
  if (poolResult.kind !== 'ok') return { kind: 'pool-unavailable' };

  let allPositions;
  try {
    allPositions = await positionReadPort.listSupportedPositions(walletId);
  } catch {
    return { kind: 'position-list-unavailable' };
  }

  const filtered = allPositions.filter((p) => p.poolId === poolId);
  const observedAtUnixMs = now();

  if (filtered.length === 0) {
    return {
      kind: 'ok',
      snapshot: {
        walletId,
        positions: [],
        dataQuality: { partial: false, warnings: [] },
      },
    };
  }

  const details: PositionDetail[] = [];
  for (const p of filtered) {
    let detail: PositionDetail | null;
    try {
      detail = await positionReadPort.getPositionDetail(walletId, p.positionId);
    } catch {
      return { kind: 'position-detail-unavailable', positionId: p.positionId };
    }
    if (!detail) {
      return { kind: 'position-detail-unavailable', positionId: p.positionId };
    }
    details.push(detail);
  }

  const priceMap = await fetchPriceMap(details, pricePort);

  const warnings: InsightDataWarning[] = [];
  const insights: SolUsdcPositionInsightDto[] = [];
  for (const detail of details) {
    const built = buildSolUsdcPositionInsight({ detail, observedAtUnixMs, priceMap });
    insights.push({ ...built.insight, observedAtUnixMs });
    warnings.push(...built.warnings);
  }

  const triggerEnrichment = await enrichWithTriggers({
    walletId,
    triggerRepo,
    insights,
    filteredPositionIds: new Set(insights.map((i) => i.positionId)),
  });
  warnings.push(...triggerEnrichment.warnings);

  return {
    kind: 'ok',
    snapshot: {
      walletId,
      positions: triggerEnrichment.insights,
      dataQuality: {
        partial: warnings.length > 0,
        warnings,
      },
    },
  };
}

async function fetchPriceMap(
  details: PositionDetail[],
  pricePort: PricePort,
): Promise<Map<string, PriceMapEntry>> {
  const mints = new Set<string>();
  for (const d of details) {
    mints.add(d.poolData.tokenPair.mintA);
    mints.add(d.poolData.tokenPair.mintB);
    for (const r of d.fees.rewardInfos) {
      if (r.mint !== '') mints.add(r.mint);
    }
  }
  const map = new Map<string, PriceMapEntry>();
  if (mints.size === 0) return map;
  try {
    const quotes = await pricePort.getPrices([...mints]);
    for (const q of quotes) {
      map.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
    }
  } catch {
    // priceMap stays empty — buildSolUsdcPositionInsight will record warnings
  }
  return map;
}

export async function enrichWithTriggers(params: {
  walletId: WalletId;
  triggerRepo: TriggerRepository;
  insights: SolUsdcPositionInsightDto[];
  filteredPositionIds: ReadonlySet<string>;
}): Promise<{
  insights: SolUsdcPositionInsightDto[];
  warnings: InsightDataWarning[];
  filteredTriggers: Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;
}> {
  const { walletId, triggerRepo, insights, filteredPositionIds } = params;
  let triggers;
  try {
    triggers = await triggerRepo.listActionableTriggers(walletId);
  } catch {
    return {
      insights,
      warnings: [
        {
          code: 'actionable_triggers_unavailable',
          message: 'Actionable triggers unavailable.',
        },
      ],
      filteredTriggers: [],
    };
  }

  const filteredTriggers = triggers
    .filter((t) => filteredPositionIds.has(t.positionId))
    .map((t) => ({
      triggerId: t.triggerId,
      positionId: t.positionId,
      breachDirection: t.breachDirection.kind,
      triggeredAt: t.triggeredAt,
    }));

  const triggerByPositionId = new Map(filteredTriggers.map((t) => [t.positionId, t]));

  const enriched = insights.map((p) => {
    const trig = triggerByPositionId.get(p.positionId);
    if (!trig) return p;
    return {
      ...p,
      hasActionableTrigger: true,
      triggerId: trig.triggerId,
      breachDirection: trig.breachDirection,
    };
  });

  return { insights: enriched, warnings: [], filteredTriggers };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/application test -- GetSolUsdcInsightPositions`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.ts packages/application/src/use-cases/insights/GetSolUsdcInsightPositions.test.ts
git commit -m "feat(application): add SOL/USDC positions insight use case

Validates the pool snapshot first, lists wallet positions, filters to
the allowlisted SOL/USDC pool, sequentially reads details, enriches with
actionable triggers. Detail reads outside the allowlisted pool never
happen. Trigger failures degrade to a warning, not a primary failure."
```

### Task 6: Implement `getSolUsdcInsightBundle`

**Files:**
- Create: `packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.ts`
- Create: `packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts`

The bundle reuses the positions use case wholesale, then composes the pool snapshot, S/R block (top-level only), and the alerts list (only triggers for filtered allowlisted positions). S/R failure → warning + `srLevels: null`, never a primary failure.

- [ ] **Step 1: Write the failing test**

Create `packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSolUsdcInsightBundle } from './GetSolUsdcInsightBundle.js';
import {
  FakeSupportedPositionReadPort,
  FakeTriggerRepository,
  FakePricePort,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POOL_DATA,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import {
  makePoolId,
  makePositionId,
  makeClockTimestamp,
} from '@clmm/domain';
import type {
  BreachEpisodeId,
  ExitTriggerId,
  PositionDetail,
} from '@clmm/domain';
import type { SrLevelsReadPort } from '../../ports/index.js';
import type { SrLevelsBlock } from '../../dto/index.js';

const SOL_USDC_POOL_ID = makePoolId('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
const OTHER_POOL_ID = makePoolId('OtherPool11111111111111111111111111111111111');

const now = () => 1_700_000_000_000;

const SR_LEVELS_LOOKUP = { symbol: 'SOL/USDC', source: 'mco' };

function poolDataFor(poolId: typeof SOL_USDC_POOL_ID) {
  return { ...FIXTURE_POOL_DATA, poolId };
}

function positionInPool(positionId: string, poolId: typeof SOL_USDC_POOL_ID) {
  return {
    ...FIXTURE_POSITION_IN_RANGE,
    positionId: makePositionId(positionId),
    poolId,
  };
}

function detailFor(positionId: string, poolId: typeof SOL_USDC_POOL_ID): PositionDetail {
  return {
    ...FIXTURE_POSITION_DETAIL,
    position: positionInPool(positionId, poolId),
    poolData: poolDataFor(poolId),
  };
}

function srBlock(): SrLevelsBlock {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-04-30T00:00:00Z',
    summary: 'test',
    capturedAtUnixMs: 1_700_000_000_000,
    supports: [{ price: 130 }],
    resistances: [{ price: 160 }],
  };
}

function makeSrPort(impl: SrLevelsReadPort['fetchCurrent']): SrLevelsReadPort {
  return { fetchCurrent: impl };
}

const samplePositionPort = (positions: ReturnType<typeof positionInPool>[]) =>
  ({
    listSupportedPositions: async () => positions,
    getPosition: async () => null,
    getPositionDetail: async (_w: never, positionId: string) =>
      detailFor(positionId, SOL_USDC_POOL_ID),
    getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
  }) as unknown as FakeSupportedPositionReadPort;

describe('getSolUsdcInsightBundle', () => {
  it('returns ok with pool, top-level srLevels, positions, and alerts', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trig-1', {
      triggerId: 'trig-1' as ExitTriggerId,
      positionId: makePositionId('pos-1'),
      episodeId: 'ep-1' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(123),
      confirmationEvaluatedAt: makeClockTimestamp(124),
      confirmationPassed: true,
    });

    const block = srBlock();
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => block),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.pair).toBe('SOL/USDC');
      expect(result.bundle.source).toBe('orca');
      expect(result.bundle.observedAtUnixMs).toBe(1_700_000_000_000);
      expect(result.bundle.pool.poolId).toBe(SOL_USDC_POOL_ID);
      expect(result.bundle.srLevels).toEqual(block);
      expect(result.bundle.positions).toHaveLength(1);
      expect(result.bundle.alerts).toHaveLength(1);
      expect(result.bundle.alerts[0]).toEqual({
        triggerId: 'trig-1',
        positionId: 'pos-1',
        breachDirection: 'lower-bound-breach',
        triggeredAt: 123,
      });
      expect(result.bundle.dataQuality.partial).toBe(false);
      expect(result.bundle.dataQuality.warnings).toEqual([]);
    }
  });

  it('does not copy srLevels onto each position', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => srBlock()),
      now,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const p = result.bundle.positions[0] as Record<string, unknown>;
      expect(p['srLevels']).toBeUndefined();
    }
  });

  it('sets srLevels=null and adds sr_levels_unavailable warning when fetchCurrent throws', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => { throw new Error('rpc'); }),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.srLevels).toBeNull();
      expect(result.bundle.dataQuality.partial).toBe(true);
      expect(
        result.bundle.dataQuality.warnings.find((w) => w.code === 'sr_levels_unavailable'),
      ).toBeDefined();
    }
  });

  it('sets srLevels=null without a warning when fetchCurrent resolves null', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.srLevels).toBeNull();
      expect(
        result.bundle.dataQuality.warnings.find((w) => w.code === 'sr_levels_unavailable'),
      ).toBeUndefined();
    }
  });

  it('excludes alerts whose positionId is outside the filtered allowlisted set', async () => {
    const positions = [positionInPool('pos-in', SOL_USDC_POOL_ID), positionInPool('pos-out', OTHER_POOL_ID)];
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trig-out', {
      triggerId: 'trig-out' as ExitTriggerId,
      positionId: makePositionId('pos-out'),
      episodeId: 'ep-out' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(99),
      confirmationEvaluatedAt: makeClockTimestamp(100),
      confirmationPassed: true,
    });

    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.positions.map((p) => p.positionId)).toEqual(['pos-in']);
      expect(result.bundle.alerts).toEqual([]);
    }
  });

  it('propagates pool-unavailable from the positions stage', async () => {
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: new FakeSupportedPositionReadPort([], {}),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('propagates position-detail-unavailable with the failed positionId', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: port,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });
    expect(result.kind).toBe('position-detail-unavailable');
    if (result.kind === 'position-detail-unavailable') {
      expect(result.positionId).toBe('pos-broken');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/application test -- GetSolUsdcInsightBundle`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the use case**

Create `packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.ts`:

```ts
import type { PoolId, WalletId, PositionDetail } from '@clmm/domain';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PricePort,
  SrLevelsReadPort,
} from '../../ports/index.js';
import type {
  SolUsdcInsightInputBundleDto,
  SolUsdcPositionInsightDto,
  InsightDataWarning,
  ExternalBreachDirection,
} from '../../dto/index.js';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';
import { buildSolUsdcPositionInsight } from './buildSolUsdcPositionInsight.js';
import { enrichWithTriggers } from './GetSolUsdcInsightPositions.js';

export type GetSolUsdcInsightBundleResult =
  | { kind: 'ok'; bundle: SolUsdcInsightInputBundleDto }
  | { kind: 'pool-unavailable' }
  | { kind: 'position-list-unavailable' }
  | { kind: 'position-detail-unavailable'; positionId: string };

export async function getSolUsdcInsightBundle(params: {
  walletId: WalletId;
  poolId: PoolId;
  srLevelsLookup: { symbol: string; source: string };
  positionReadPort: SupportedPositionReadPort;
  triggerRepo: TriggerRepository;
  pricePort: PricePort;
  srLevelsReadPort: SrLevelsReadPort;
  now: () => number;
}): Promise<GetSolUsdcInsightBundleResult> {
  const {
    walletId,
    poolId,
    srLevelsLookup,
    positionReadPort,
    triggerRepo,
    pricePort,
    srLevelsReadPort,
    now,
  } = params;

  const poolResult = await getSolUsdcInsightPoolSnapshot({ poolId, positionReadPort, now });
  if (poolResult.kind !== 'ok') return { kind: 'pool-unavailable' };

  let allPositions;
  try {
    allPositions = await positionReadPort.listSupportedPositions(walletId);
  } catch {
    return { kind: 'position-list-unavailable' };
  }

  const filtered = allPositions.filter((p) => p.poolId === poolId);
  const observedAtUnixMs = now();

  const details: PositionDetail[] = [];
  for (const p of filtered) {
    let detail: PositionDetail | null;
    try {
      detail = await positionReadPort.getPositionDetail(walletId, p.positionId);
    } catch {
      return { kind: 'position-detail-unavailable', positionId: p.positionId };
    }
    if (!detail) {
      return { kind: 'position-detail-unavailable', positionId: p.positionId };
    }
    details.push(detail);
  }

  const priceMap = new Map<string, { usdValue: number; symbol: string }>();
  if (details.length > 0) {
    const mints = new Set<string>();
    for (const d of details) {
      mints.add(d.poolData.tokenPair.mintA);
      mints.add(d.poolData.tokenPair.mintB);
      for (const r of d.fees.rewardInfos) {
        if (r.mint !== '') mints.add(r.mint);
      }
    }
    try {
      const quotes = await pricePort.getPrices([...mints]);
      for (const q of quotes) {
        priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
      }
    } catch {
      // priceMap stays empty — buildSolUsdcPositionInsight records warnings
    }
  }

  const warnings: InsightDataWarning[] = [];
  const insights: SolUsdcPositionInsightDto[] = [];
  for (const detail of details) {
    const built = buildSolUsdcPositionInsight({ detail, observedAtUnixMs, priceMap });
    insights.push({ ...built.insight, observedAtUnixMs });
    warnings.push(...built.warnings);
  }

  const triggerEnrichment = await enrichWithTriggers({
    walletId,
    triggerRepo,
    insights,
    filteredPositionIds: new Set(insights.map((i) => i.positionId)),
  });
  warnings.push(...triggerEnrichment.warnings);

  let srLevels = null;
  try {
    srLevels = await srLevelsReadPort.fetchCurrent(srLevelsLookup.symbol, srLevelsLookup.source);
  } catch {
    warnings.push({
      code: 'sr_levels_unavailable',
      message: 'S/R levels unavailable.',
    });
  }

  const alerts = triggerEnrichment.filteredTriggers as Array<{
    triggerId: string;
    positionId: string;
    breachDirection: ExternalBreachDirection;
    triggeredAt: number;
  }>;

  return {
    kind: 'ok',
    bundle: {
      pair: 'SOL/USDC',
      source: 'orca',
      observedAtUnixMs,
      pool: poolResult.pool,
      srLevels,
      positions: triggerEnrichment.insights,
      alerts,
      dataQuality: {
        partial: warnings.length > 0,
        warnings,
      },
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/application test -- GetSolUsdcInsightBundle`
Expected: PASS (7 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.ts packages/application/src/use-cases/insights/GetSolUsdcInsightBundle.test.ts
git commit -m "feat(application): add SOL/USDC insight bundle use case

Composes pool, top-level srLevels, allowlisted positions, alerts (only
for filtered positions), and minimal dataQuality. S/R lives once at the
bundle top level — never on each position. S/R failure is a warning,
never a primary failure."
```

### Task 7: Export the new use cases from `@clmm/application`

**Files:**
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Add exports**

Append the following lines to `packages/application/src/index.ts`:

```ts
export * from './use-cases/insights/GetSolUsdcInsightPoolSnapshot.js';
export * from './use-cases/insights/GetSolUsdcInsightPositions.js';
export * from './use-cases/insights/GetSolUsdcInsightBundle.js';
export * from './use-cases/insights/buildSolUsdcPositionInsight.js';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/application typecheck`
Expected: PASS.

- [ ] **Step 3: Build to refresh `dist/` so the adapters package can consume the new exports**

Run: `pnpm --filter @clmm/application build`
Expected: PASS (no type errors, dist updated).

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/index.ts
git commit -m "feat(application): export SOL/USDC insight use cases"
```

---

## Phase 3 — Adapter Wiring (CurrentSrLevelsAdapter, Tokens, Cache TTL)

End state: `CurrentSrLevelsAdapter` implements both the existing adapter-local `CurrentSrLevelsPort` AND the new application `SrLevelsReadPort`. A new DI token `SR_LEVELS_READ_PORT` is registered. `OrcaPositionReadAdapter` reads its cache TTL from `CLMM_POOL_DATA_CACHE_TTL_MS`. `.env.sample` documents the new variable.

### Task 8: Make `CurrentSrLevelsAdapter` implement the application `SrLevelsReadPort`

**Files:**
- Modify: `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts`

The class already has the right method shape (`fetchCurrent(symbol, source): Promise<SrLevelsBlock | null>`). The only change is to also implement the application port. Both the adapter-local `CurrentSrLevelsPort` and the application `SrLevelsReadPort` are structurally identical — the application DTO and the adapter type are intentionally duplicated to keep the boundary clean.

`SrLevelsController` (which still depends on the adapter-local port type) keeps working because the class continues to satisfy that interface.

- [ ] **Step 1: Update the class to declare the application port too**

Edit `packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts`. Replace the existing imports and class declaration:

```ts
import type { CurrentSrLevelsPort, SrLevelsBlock, SrLevel } from './types.js';
import type { ObservabilityPort } from '@clmm/application';

export class CurrentSrLevelsAdapter implements CurrentSrLevelsPort {
```

with:

```ts
import type { CurrentSrLevelsPort, SrLevelsBlock as AdapterSrLevelsBlock, SrLevel } from './types.js';
import type { ObservabilityPort, SrLevelsReadPort, SrLevelsBlock } from '@clmm/application';

// The adapter-local SrLevelsBlock and the application SrLevelsBlock are
// structurally identical (drift guard noted in both files). Implementing
// both interfaces means SrLevelsController and the new insight use cases
// can share one adapter instance.
export class CurrentSrLevelsAdapter implements CurrentSrLevelsPort, SrLevelsReadPort {
```

- [ ] **Step 2: Confirm the method signature still resolves correctly**

The existing method signature `async fetchCurrent(symbol: string, source: string): Promise<SrLevelsBlock | null>` stays text-identical. After the import change in Step 1, `SrLevelsBlock` in scope resolves to the application type. The returned object literal is structurally compatible with both, so the body needs no edits.

If TypeScript reports `AdapterSrLevelsBlock` as unused after the imports change, drop the alias from the destructured import and import only `SrLevel` from `./types.js`.

- [ ] **Step 3: Run the existing adapter test**

Run: `pnpm --filter @clmm/adapters test -- CurrentSrLevelsAdapter`
Expected: PASS — behavior is unchanged.

- [ ] **Step 4: Run the controller test to confirm `SrLevelsController` still typechecks against `CurrentSrLevelsAdapter`**

Run: `pnpm --filter @clmm/adapters test -- SrLevelsController`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/regime-engine/CurrentSrLevelsAdapter.ts
git commit -m "feat(adapters): CurrentSrLevelsAdapter implements application SrLevelsReadPort

The adapter now satisfies both the adapter-local CurrentSrLevelsPort
(used by SrLevelsController) and the new application SrLevelsReadPort
(used by SOL/USDC insight use cases). Both interfaces are structurally
identical — duplication is intentional to keep the boundary."
```

### Task 9: Add the `SR_LEVELS_READ_PORT` DI token

**Files:**
- Modify: `packages/adapters/src/inbound/http/tokens.ts`

- [ ] **Step 1: Add the new token**

Append the following line to `packages/adapters/src/inbound/http/tokens.ts` (right after `PRICE_PORT`):

```ts
export const SR_LEVELS_READ_PORT = 'SR_LEVELS_READ_PORT';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS — token is unused so far, that's fine.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat(adapters): add SR_LEVELS_READ_PORT DI token

Used to wire CurrentSrLevelsAdapter into the SOL/USDC insight controller
through the new application-layer SrLevelsReadPort."
```

### Task 10: Configurable `CLMM_POOL_DATA_CACHE_TTL_MS` in `OrcaPositionReadAdapter`

**Files:**
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`

Default is 30 000 ms. Invalid or non-positive values fall back to the default. Don't expose the cache provenance in any DTO — this is purely a backend-internal knob.

- [ ] **Step 1: Add a small parser helper at the top of the file (after the imports)**

Edit `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`. After the last `import` line (the `KNOWN_TOKENS` import), add:

```ts
const DEFAULT_POOL_DATA_CACHE_TTL_MS = 30_000;

export function parsePoolDataCacheTtlMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_POOL_DATA_CACHE_TTL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_POOL_DATA_CACHE_TTL_MS;
  return Math.floor(parsed);
}
```

- [ ] **Step 2: Replace the hard-coded `POOL_DATA_CACHE_TTL_MS` in the class**

Find the class field:

```ts
  private readonly POOL_DATA_CACHE_TTL_MS = 5_000;
```

Replace it with:

```ts
  private readonly POOL_DATA_CACHE_TTL_MS: number;
```

Update the constructor signature and body. Find:

```ts
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
    private readonly db: Db,
  ) {}
```

Replace with:

```ts
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
    private readonly db: Db,
    poolDataCacheTtlMs: number = DEFAULT_POOL_DATA_CACHE_TTL_MS,
  ) {
    this.POOL_DATA_CACHE_TTL_MS = poolDataCacheTtlMs;
  }
```

- [ ] **Step 3: Write a focused test for the parser**

Create `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.cache-ttl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePoolDataCacheTtlMs } from './OrcaPositionReadAdapter.js';

describe('parsePoolDataCacheTtlMs', () => {
  it('defaults to 30_000 when undefined', () => {
    expect(parsePoolDataCacheTtlMs(undefined)).toBe(30_000);
  });

  it('defaults to 30_000 on empty string', () => {
    expect(parsePoolDataCacheTtlMs('')).toBe(30_000);
  });

  it('returns the parsed integer for a positive number', () => {
    expect(parsePoolDataCacheTtlMs('60000')).toBe(60_000);
  });

  it('floors fractional milliseconds', () => {
    expect(parsePoolDataCacheTtlMs('1500.9')).toBe(1500);
  });

  it('falls back to default for zero', () => {
    expect(parsePoolDataCacheTtlMs('0')).toBe(30_000);
  });

  it('falls back to default for negative numbers', () => {
    expect(parsePoolDataCacheTtlMs('-500')).toBe(30_000);
  });

  it('falls back to default for non-numeric strings', () => {
    expect(parsePoolDataCacheTtlMs('abc')).toBe(30_000);
  });

  it('falls back to default for NaN inputs', () => {
    expect(parsePoolDataCacheTtlMs('NaN')).toBe(30_000);
  });
});
```

- [ ] **Step 4: Run the parser test**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionReadAdapter.cache-ttl`
Expected: PASS (8 cases).

- [ ] **Step 5: Run the existing OrcaPositionReadAdapter test to confirm nothing regressed**

Run: `pnpm --filter @clmm/adapters test -- OrcaPositionReadAdapter.test`
Expected: PASS — the new constructor argument is optional and defaults to the previous value's spirit (30 000 ms instead of 5 000 ms; existing tests do not assert the literal cache TTL).

If any existing test fails because it asserts the 5 000 ms TTL specifically, update the assertion to match the new 30 000 ms default. Do NOT silently re-introduce the old value.

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.cache-ttl.test.ts
git commit -m "feat(adapters): configurable CLMM_POOL_DATA_CACHE_TTL_MS for OrcaPositionReadAdapter

Default 30000 ms. Invalid or non-positive values fall back to the
default. Backend-only knob — never exposed in response DTOs."
```

### Task 11: Document `CLMM_POOL_DATA_CACHE_TTL_MS` in `.env.sample`

**Files:**
- Modify: `packages/adapters/.env.sample`

- [ ] **Step 1: Append the new variable**

Append to `packages/adapters/.env.sample`:

```bash

# --- Pool data cache (optional) ---
# CLMM_POOL_DATA_CACHE_TTL_MS: how long OrcaPositionReadAdapter caches
# whirlpool pool data per pool ID, in milliseconds. Default 30000.
# Invalid or non-positive values fall back to the default.
CLMM_POOL_DATA_CACHE_TTL_MS=30000
```

- [ ] **Step 2: Commit**

```bash
git add packages/adapters/.env.sample
git commit -m "docs(adapters): document CLMM_POOL_DATA_CACHE_TTL_MS in .env.sample"
```

---

## Phase 4 — InsightsDataController and AppModule Wiring

End state: a thin Nest controller exposes the three routes, calls the use cases, and maps primary failures to HTTP `503` with `SolUsdcInsightErrorDto`. AppModule registers the controller and binds `SR_LEVELS_READ_PORT` to `CurrentSrLevelsAdapter`.

### Task 12: Implement `InsightsDataController` (TDD)

**Files:**
- Create: `packages/adapters/src/inbound/http/InsightsDataController.ts`
- Create: `packages/adapters/src/inbound/http/InsightsDataController.test.ts`

The controller injects `SUPPORTED_POSITION_READ_PORT`, `TRIGGER_REPOSITORY`, `PRICE_PORT`, `SR_LEVELS_READ_PORT`, and `SR_LEVELS_POOL_ALLOWLIST`. The allowlist is reused — the controller derives `poolId` and `srLevelsLookup` from the (single) entry. Today the allowlist has exactly one entry; if the count is not exactly one, the controller throws on construction so the misconfiguration surfaces at boot.

The controller maps:
- `pool-unavailable` → `503` with `code: 'pool_snapshot_unavailable'`
- `position-list-unavailable` → `503` with `code: 'position_list_unavailable'`
- `position-detail-unavailable` → `503` with `code: 'position_detail_unavailable'` and `positionId`

Use Nest's `HttpException` to return a stable JSON body (NOT framework-default error payloads).

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/src/inbound/http/InsightsDataController.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { InsightsDataController } from './InsightsDataController.js';
import {
  FakeSupportedPositionReadPort,
  FakeTriggerRepository,
  FakePricePort,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POOL_DATA,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import { makePoolId, makePositionId } from '@clmm/domain';
import type { SrLevelsReadPort, SrLevelsBlock } from '@clmm/application';
import type { PositionDetail } from '@clmm/domain';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const ALLOWLIST = new Map<string, { symbol: string; source: string }>([
  [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'mco' }],
]);

const WALLET_ID = FIXTURE_POSITION_IN_RANGE.walletId;

function poolDataFor(poolIdStr: string) {
  return { ...FIXTURE_POOL_DATA, poolId: makePoolId(poolIdStr) };
}

function positionInPool(positionIdStr: string, poolIdStr: string) {
  return {
    ...FIXTURE_POSITION_IN_RANGE,
    positionId: makePositionId(positionIdStr),
    poolId: makePoolId(poolIdStr),
  };
}

function detailFor(positionIdStr: string, poolIdStr: string): PositionDetail {
  return {
    ...FIXTURE_POSITION_DETAIL,
    position: positionInPool(positionIdStr, poolIdStr),
    poolData: poolDataFor(poolIdStr),
  };
}

const sampleSrPort: SrLevelsReadPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };

const samplePort = (positions: ReturnType<typeof positionInPool>[]) =>
  ({
    listSupportedPositions: async () => positions,
    getPosition: async () => null,
    getPositionDetail: async (_w: never, positionId: string) => detailFor(positionId, SOL_USDC_POOL_ID),
    getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
  }) as unknown as FakeSupportedPositionReadPort;

const fixedClock = () => 1_700_000_000_000;

describe('InsightsDataController', () => {
  it('throws on construction if the allowlist does not have exactly one entry', () => {
    expect(() =>
      new InsightsDataController(
        new FakeSupportedPositionReadPort([], {}),
        new FakeTriggerRepository(),
        new FakePricePort(),
        sampleSrPort,
        new Map(),
        fixedClock,
      ),
    ).toThrow();
  });

  it('GET pool: returns the pool snapshot', async () => {
    const controller = new InsightsDataController(
      samplePort([]),
      new FakeTriggerRepository(),
      new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    const result = await controller.getPool();
    expect(result.pool.poolId).toBe(SOL_USDC_POOL_ID);
    expect(result.pool.pair).toBe('SOL/USDC');
  });

  it('GET pool: returns 503 with pool_snapshot_unavailable when pool data is null', async () => {
    const controller = new InsightsDataController(
      new FakeSupportedPositionReadPort([], {}),
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getPool();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'pool_snapshot_unavailable',
        pair: 'SOL/USDC',
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET positions/:walletId: returns the snapshot DTO', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const controller = new InsightsDataController(
      samplePort(positions),
      new FakeTriggerRepository(),
      new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    const result = await controller.getPositions(WALLET_ID);
    expect(result.snapshot.walletId).toBe(WALLET_ID);
    expect(result.snapshot.positions).toHaveLength(1);
  });

  it('GET positions/:walletId: returns 503 with position_list_unavailable when listing fails', async () => {
    const port = {
      listSupportedPositions: async () => { throw new Error('rpc'); },
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const controller = new InsightsDataController(
      port,
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getPositions(WALLET_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_list_unavailable',
        walletId: WALLET_ID,
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET positions/:walletId: returns 503 with position_detail_unavailable and positionId on detail failure', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const controller = new InsightsDataController(
      port,
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getPositions(WALLET_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_detail_unavailable',
        positionId: 'pos-broken',
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET bundle/:walletId: returns the bundle DTO', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const block: SrLevelsBlock = {
      briefId: 'b1',
      sourceRecordedAtIso: null,
      summary: null,
      capturedAtUnixMs: 1_700_000_000_000,
      supports: [{ price: 130 }],
      resistances: [{ price: 160 }],
    };
    const srPort: SrLevelsReadPort = { fetchCurrent: vi.fn().mockResolvedValue(block) };

    const controller = new InsightsDataController(
      samplePort(positions),
      new FakeTriggerRepository(),
      new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srPort,
      ALLOWLIST,
      fixedClock,
    );

    const result = await controller.getBundle(WALLET_ID);
    expect(result.bundle.pool.poolId).toBe(SOL_USDC_POOL_ID);
    expect(result.bundle.srLevels).toEqual(block);
    expect(result.bundle.positions).toHaveLength(1);
  });

  it('GET bundle/:walletId: returns 503 with position_detail_unavailable on detail failure', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const controller = new InsightsDataController(
      port,
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getBundle(WALLET_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_detail_unavailable',
        positionId: 'pos-broken',
        walletId: WALLET_ID,
        poolId: SOL_USDC_POOL_ID,
      });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @clmm/adapters test -- InsightsDataController`
Expected: FAIL — `InsightsDataController` does not exist yet.

- [ ] **Step 3: Implement the controller**

Create `packages/adapters/src/inbound/http/InsightsDataController.ts`:

```ts
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
} from '@nestjs/common';
import {
  getSolUsdcInsightPoolSnapshot,
  getSolUsdcInsightPositions,
  getSolUsdcInsightBundle,
} from '@clmm/application';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PricePort,
  SrLevelsReadPort,
  SolUsdcInsightErrorDto,
} from '@clmm/application';
import { makePoolId, makeWalletId } from '@clmm/domain';
import {
  SUPPORTED_POSITION_READ_PORT,
  TRIGGER_REPOSITORY,
  PRICE_PORT,
  SR_LEVELS_READ_PORT,
  SR_LEVELS_POOL_ALLOWLIST,
} from './tokens.js';

type SrLevelsAllowlist = Map<string, { symbol: string; source: string }>;

@Controller('insights/sol-usdc')
export class InsightsDataController {
  private readonly poolIdRaw: string;
  private readonly srLevelsLookup: { symbol: string; source: string };

  constructor(
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(PRICE_PORT)
    private readonly pricePort: PricePort,
    @Inject(SR_LEVELS_READ_PORT)
    private readonly srLevelsReadPort: SrLevelsReadPort,
    @Inject(SR_LEVELS_POOL_ALLOWLIST)
    private readonly srLevelsAllowlist: SrLevelsAllowlist,
    private readonly now: () => number = Date.now,
  ) {
    if (this.srLevelsAllowlist.size !== 1) {
      throw new Error(
        `InsightsDataController expects exactly one allowlist entry, found ${this.srLevelsAllowlist.size}`,
      );
    }
    const [poolIdRaw, lookup] = this.srLevelsAllowlist.entries().next().value as [
      string,
      { symbol: string; source: string },
    ];
    this.poolIdRaw = poolIdRaw;
    this.srLevelsLookup = lookup;
  }

  @Get('pool')
  async getPool() {
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: makePoolId(this.poolIdRaw),
      positionReadPort: this.positionReadPort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable();
    }
    return { pool: result.pool };
  }

  @Get('positions/:walletId')
  async getPositions(@Param('walletId') walletIdRaw: string) {
    const result = await getSolUsdcInsightPositions({
      walletId: makeWalletId(walletIdRaw),
      poolId: makePoolId(this.poolIdRaw),
      positionReadPort: this.positionReadPort,
      triggerRepo: this.triggerRepo,
      pricePort: this.pricePort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
    }
    return { snapshot: result.snapshot };
  }

  @Get('bundle/:walletId')
  async getBundle(@Param('walletId') walletIdRaw: string) {
    const result = await getSolUsdcInsightBundle({
      walletId: makeWalletId(walletIdRaw),
      poolId: makePoolId(this.poolIdRaw),
      srLevelsLookup: this.srLevelsLookup,
      positionReadPort: this.positionReadPort,
      triggerRepo: this.triggerRepo,
      pricePort: this.pricePort,
      srLevelsReadPort: this.srLevelsReadPort,
      now: this.now,
    });
    if (result.kind === 'pool-unavailable') {
      throw this.poolUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-list-unavailable') {
      throw this.positionListUnavailable(walletIdRaw);
    }
    if (result.kind === 'position-detail-unavailable') {
      throw this.positionDetailUnavailable(walletIdRaw, result.positionId);
    }
    return { bundle: result.bundle };
  }

  private poolUnavailable(walletIdRaw?: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'pool_snapshot_unavailable',
      message: 'Unable to read SOL/USDC pool snapshot.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      ...(walletIdRaw !== undefined ? { walletId: walletIdRaw } : {}),
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private positionListUnavailable(walletIdRaw: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'position_list_unavailable',
      message: 'Unable to read SOL/USDC position list.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      walletId: walletIdRaw,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private positionDetailUnavailable(walletIdRaw: string, positionId: string): HttpException {
    const body: SolUsdcInsightErrorDto = {
      code: 'position_detail_unavailable',
      message: 'Unable to read SOL/USDC position detail.',
      pair: 'SOL/USDC',
      poolId: this.poolIdRaw,
      walletId: walletIdRaw,
      positionId,
      retryable: true,
    };
    return new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @clmm/adapters test -- InsightsDataController`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/InsightsDataController.ts packages/adapters/src/inbound/http/InsightsDataController.test.ts
git commit -m "feat(adapters): add InsightsDataController for SOL/USDC insights API

Three read-only endpoints under /insights/sol-usdc/* that delegate to
the application use cases. Primary failures map to HTTP 503 with stable
SolUsdcInsightErrorDto payloads. Throws on construction if the allowlist
does not have exactly one entry — misconfiguration surfaces at boot."
```

### Task 13: Wire `InsightsDataController` and `SR_LEVELS_READ_PORT` into `AppModule`

**Files:**
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

The existing `currentSrLevelsAdapter` instance now satisfies both `CurrentSrLevelsPort` and the application `SrLevelsReadPort` (Task 8), so the same instance binds to both tokens. Use `OrcaPositionReadAdapter`'s new TTL constructor argument to thread `CLMM_POOL_DATA_CACHE_TTL_MS`.

- [ ] **Step 1: Update `AppModule.ts` imports and providers**

Edit `packages/adapters/src/inbound/http/AppModule.ts`.

Add these imports (place next to the existing controller / token imports):

```ts
import { InsightsDataController } from './InsightsDataController.js';
import { parsePoolDataCacheTtlMs } from '../../outbound/solana-position-reads/OrcaPositionReadAdapter.js';
```

Add `SR_LEVELS_READ_PORT` to the existing `tokens.js` import block — extend the destructured list with `SR_LEVELS_READ_PORT`.

Replace the existing `OrcaPositionReadAdapter` construction line:

```ts
const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, db);
```

with:

```ts
const poolDataCacheTtlMs = parsePoolDataCacheTtlMs(
  (process.env as Record<string, string | undefined>)['CLMM_POOL_DATA_CACHE_TTL_MS'],
);
const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl, snapshotReader, db, poolDataCacheTtlMs);
```

Add `InsightsDataController` to the `controllers` array:

```ts
controllers: [
  HealthController,
  PositionController,
  SrLevelsController,
  InsightsDataController,
  AlertController,
  PreviewController,
  ExecutionController,
  WalletController,
],
```

Add the new provider entry next to `CURRENT_SR_LEVELS_PORT`:

```ts
{ provide: SR_LEVELS_READ_PORT, useValue: currentSrLevelsAdapter },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: PASS.

- [ ] **Step 3: Run the existing module / controller tests to confirm no regressions**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS — including `SrLevelsAllowlist`, `SrLevelsController`, `PositionController`, and the new `InsightsDataController` test.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): wire InsightsDataController and SR_LEVELS_READ_PORT into AppModule

Bind CurrentSrLevelsAdapter to the new SR_LEVELS_READ_PORT token (same
instance is already bound to CURRENT_SR_LEVELS_PORT). Thread
CLMM_POOL_DATA_CACHE_TTL_MS into OrcaPositionReadAdapter."
```

---

## Phase 5 — Documentation

End state: `README.md` documents the public-facing `CLMM_DATA_API_BASE` env hint for the external pipeline.

### Task 14: Document `CLMM_DATA_API_BASE` for the external pipeline in `README.md`

**Files:**
- Modify: `README.md`

The README's existing "Environment Variables" section already separates app-only public vs. backend-only. Add a new subsection that explains how the external `clmm-autopilot-pipeline` should reach the BFF.

- [ ] **Step 1: Add the subsection**

Edit `README.md`. Find the "### Regime engine integration (backend only)" subsection, and add the following subsection directly above it (or directly below, whichever keeps related "external integrations" subsections grouped):

```markdown
### External insights pipeline (read-only consumer)

The external `clmm-autopilot-pipeline` reads SOL/USDC pool, position, alert, and S/R snapshots through the CLMM BFF — never directly from Helius. Centralizing RPC behind the BFF keeps Helius credentials inside CLMM and prevents the pipeline from doing its own RPC fan-out.

The pipeline points at the BFF with:

```bash
CLMM_DATA_API_BASE=http://localhost:3001
```

Use the deployed CLMM API URL in hosted environments. Endpoints are read-only and live under `/insights/sol-usdc/`. They do not sign transactions, submit swaps, withdraw or rebalance liquidity, or request wallet private keys.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document CLMM_DATA_API_BASE for the external insights pipeline"
```

---

## Phase 6 — Verification

End state: narrow + broad checks pass; no regressions in existing endpoints (`/positions/...`, `/sr-levels/...`).

### Task 15: Narrow verification

- [ ] **Step 1: Run narrow verification**

Run:

```bash
pnpm typecheck
pnpm --filter @clmm/application test
pnpm --filter @clmm/adapters test
```

Expected: all pass.

### Task 16: Broad verification

- [ ] **Step 1: Run broad repo verification**

Run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

Expected: all pass.

If `pnpm boundaries` flags `packages/application` importing from adapters, that means somewhere along the way an `import` slipped across the boundary. Check the new files in `packages/application/src/use-cases/insights/` and the updated `packages/application/src/ports/index.ts` — they may only import from `@clmm/domain`, `../../dto/index.js`, or `../../ports/index.js`.

### Task 17: Sanity-check existing endpoints are unchanged

The spec is explicit that the existing `PositionController` and `SrLevelsController` behavior must not change.

- [ ] **Step 1: Run the targeted regression tests**

Run:

```bash
pnpm --filter @clmm/adapters test -- PositionController
pnpm --filter @clmm/adapters test -- SrLevelsController
pnpm --filter @clmm/adapters test -- SrLevelsAllowlist
```

Expected: all pass — including the existing PositionController regression that asserts `srLevels` is never on the position payload.

### Task 18: Manual smoke (optional, recommended)

If a local Postgres + valid `SOLANA_RPC_URL` is available:

- [ ] **Step 1: Boot the API**

Run: `pnpm dev:api`
Expected: server listening on port 3001 (or `PORT`).

- [ ] **Step 2: Hit the three endpoints**

```bash
curl -fsS http://localhost:3001/insights/sol-usdc/pool | jq
curl -fsS "http://localhost:3001/insights/sol-usdc/positions/<some-wallet>" | jq
curl -fsS "http://localhost:3001/insights/sol-usdc/bundle/<some-wallet>" | jq
```

Expected:
- `/pool` returns a populated `pool` object (`pair: 'SOL/USDC'`, `source: 'orca'`, `priceSource: 'orca_whirlpool_sqrt_price'`).
- `/positions/<wallet>` returns `snapshot.positions[]` filtered to the SOL/USDC pool, with `dataQuality.partial=false` if all enrichment succeeded.
- `/bundle/<wallet>` returns `bundle` with top-level `pool`, top-level `srLevels` (or `null`), `positions[]`, `alerts[]`, and `dataQuality`.

If the BFF cannot reach Solana, the responses should be `503` with `code: 'pool_snapshot_unavailable'` (or one of the other defined codes), not Nest default error JSON.

If a smoke environment is not available, skip this task and report explicitly that runtime verification was not performed.

---

## Out-of-scope (do not add)

These are explicitly rejected by the spec; do not introduce them in this plan:

- Cache provenance fields (`usedCache`, `rpcProvider`, `fresh`, `cached`) on response DTOs.
- A generic multi-pool registry. The allowlist stays single-entry in v1.
- `poolDepthLabel` on insight DTOs.
- Re-deriving directional exit policy or target posture inside the insight use cases.
- Any execution, signing, liquidity mutation, swap submission, private-key, proof, attestation, or claim-verification concept.
- S/R copied onto each position record. S/R is bundle-top-level only.

---

## Acceptance Criteria (from the spec)

- `GET /insights/sol-usdc/pool` returns a valid Orca SOL/USDC pool snapshot for the allowlisted pool.
- `GET /insights/sol-usdc/positions/:walletId` returns only allowlisted SOL/USDC Orca positions for the wallet.
- `GET /insights/sol-usdc/bundle/:walletId` returns pool, top-level S/R levels, positions, alerts, and minimal data quality in one compact payload.
- Positions and bundle endpoints validate the pool snapshot before listing wallet positions.
- Pool snapshot failures return `503` with `SolUsdcInsightErrorDto`.
- Allowlisted position detail failures return `503` with `SolUsdcInsightErrorDto` and include the failed `positionId` when available.
- Partial data warnings are used only for non-critical enrichment failures.
- `srLevels` is top-level in the bundle and never included per position.
- Bundle alerts include only actionable triggers for the filtered allowlisted SOL/USDC positions.
- Raw fee/reward fields are included in `SolUsdcPositionInsightDto`.
- Position USD valuation uses `number | null`, preserving the difference between known zero and unavailable valuation.
- `poolDepthLabel` is not included in insight DTOs.
- Existing position endpoint behavior remains unchanged.
- Existing S/R endpoint behavior remains unchanged.
- No execution, signing, liquidity mutation, swap submission, private-key, proof, attestation, or claim-verification concepts are added.
- No fake cache/provider provenance is returned.
- `CLMM_POOL_DATA_CACHE_TTL_MS` is implemented, safely parsed, defaults to `30000`, falls back on invalid values, and is documented.
- Tests cover the application use case and HTTP failure mapping.
