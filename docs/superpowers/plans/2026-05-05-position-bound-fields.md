# Position Bound Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the position-card range contract so the list and detail screens share the same price-space bound fields and labels, and remove tick-index bound fields from the application DTO surface.

**Architecture:** `PositionSummaryDto` becomes the shared range contract carrying `lowerBoundPrice`, `upperBoundPrice`, `lowerBoundLabel`, and `upperBoundLabel`. `PositionDetailDto` extends `PositionSummaryDto` and no longer declares tick-index bounds. Tick-to-price conversion and label formatting stay in the application layer using `tickToPrice` from `@clmm/domain`. The list use case excludes positions whose metadata cannot produce honest price fields; the detail use case returns a precise internal failure for the same case (separate from `not-found`).

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, NestJS (BFF/adapters), React + React Native (UI), Expo (apps/app). Domain math: `tickToPrice` and `priceFromSqrtPrice` in `packages/domain/src/positions/enrichment.ts`.

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/application/src/dto/index.ts` | DTO type definitions | Modify: add 4 fields to `PositionSummaryDto`; remove `lowerBound`/`upperBound`/`lowerBoundLabel`/`upperBoundLabel` from `PositionDetailDto` |
| `packages/application/src/use-cases/positions/buildPositionDisplayBounds.ts` | Shared application helper that turns raw bound ticks plus complete display metadata into price-space fields and labels | Create |
| `packages/application/src/use-cases/positions/buildPositionDisplayBounds.test.ts` | Unit tests for the helper | Create |
| `packages/application/src/use-cases/positions/ListSupportedPositions.ts` | List use case — emits summary DTOs | Modify: compute price-space bounds + labels via helper; exclude positions without complete metadata |
| `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts` | List use-case tests | Modify: assert price-space bound fields, exclusion of incomplete metadata, and absence of tick fields |
| `packages/application/src/use-cases/positions/GetPositionDetail.ts` | Detail use case | Modify: extend result with `cannot-build-supported-detail-dto`; drop tick-bound DTO fields; reuse helper |
| `packages/application/src/use-cases/positions/GetPositionDetail.test.ts` | Detail use-case tests | Modify: assert new shape, exercise `cannot-build-supported-detail-dto`, keep `not-found` behavior |
| `packages/adapters/src/inbound/http/PositionController.ts` | BFF HTTP controller | Modify: handle new failure kind (map to existing 404-like external response); remove tick references |
| `packages/adapters/src/inbound/http/PositionController.test.ts` | Controller tests | Modify: cover the cannot-build-detail mapping, ensure summary fixtures include new fields |
| `apps/app/src/api/positions.ts` | API client validators | Modify: validate `lowerBoundPrice`, `upperBoundPrice`, `lowerBoundLabel`, `upperBoundLabel` on summary; stop validating `lowerBound`/`upperBound` on detail |
| `apps/app/src/api/positions.test.ts` | API validator tests | Modify: rewrite NaN/infinity tests against price-space fields; assert payloads no longer require tick fields |
| `packages/ui/src/view-models/PositionListViewModel.ts` | List view model | Modify: expose 4 new bound fields; map them from DTO |
| `packages/ui/src/view-models/PositionListViewModel.test.ts` | List view-model tests | Create |
| `packages/ui/src/view-models/PositionDetailViewModel.ts` | Detail view model | Already reads `dto.lowerBoundLabel` / `dto.upperBoundLabel` — no change once they come from summary |
| `packages/ui/src/view-models/PositionDetailViewModel.test.ts` | Detail view-model tests | Modify fixture: drop deleted detail tick fields |
| `packages/ui/src/presenters/PositionDetailPresenter.ts` | Detail presenter normalization | Modify: remove tick-DTO fallbacks; if normalization is kept, fallbacks must produce price-space fields |
| `packages/ui/src/screens/PositionDetailScreen.test.tsx` | Detail screen tests | Modify fixtures: drop deleted detail tick fields |
| `packages/ui/src/screens/PositionsListScreen.test.tsx` | List screen tests | Modify: include new summary bound fields in fixtures (where required by typecheck) |

The helper file is justified because both use cases compute the same four fields from the same inputs (raw ticks + decimals + symbol). Without the helper, the list use case would either duplicate the per-position bound logic or skip it. The helper has no adapter or React imports and stays inside `packages/application`.

---

## Pre-flight

### Task 0: Confirm fresh worktree is bootstrapped

**Files:** none

- [ ] **Step 1: Verify dependencies and build outputs**

Run: `pnpm install --frozen-lockfile`
Expected: completes without modifying lockfile.

Run: `pnpm build`
Expected: completes successfully across the workspace.

If either fails, stop and resolve before continuing.

---

## Phase 1 — DTO contract

### Task 1: Update `PositionSummaryDto` and `PositionDetailDto` shape

**Files:**
- Modify: `packages/application/src/dto/index.ts`

- [ ] **Step 1: Replace the `PositionSummaryDto` type to add the four bound fields**

Find the existing block:

```ts
// Position DTOs
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

Replace it with:

```ts
// Position DTOs
export type PositionSummaryDto = {
  positionId: PositionId;
  poolId: PoolId;
  tokenPairLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  feeRateLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  rangeState: 'in-range' | 'below-range' | 'above-range';
  rangeDistance: {
    belowLowerPercent: number;
    aboveUpperPercent: number;
  };
  hasActionableTrigger: boolean;
  monitoringStatus: 'active' | 'degraded' | 'inactive';
};
```

- [ ] **Step 2: Replace `PositionDetailDto` to remove the four tick-bound and label fields**

Find:

```ts
export type PositionDetailDto = PositionSummaryDto & {
  lowerBound: number;
  upperBound: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
  currentPrice: number;
  sqrtPrice: string;
  unclaimedFees: {
    feeOwedA: TokenAmountValue;
    feeOwedB: TokenAmountValue;
    totalUsd: number;
  };
  unclaimedRewards: {
    rewards: RewardAmountValue[];
    totalUsd: number;
  };
  positionLiquidity: string;
  poolLiquidity: string;
  poolDepthLabel: string;
  triggerId?: ExitTriggerId;
  breachDirection?: BreachDirection;
};
```

Replace with:

```ts
export type PositionDetailDto = PositionSummaryDto & {
  currentPrice: number;
  sqrtPrice: string;
  unclaimedFees: {
    feeOwedA: TokenAmountValue;
    feeOwedB: TokenAmountValue;
    totalUsd: number;
  };
  unclaimedRewards: {
    rewards: RewardAmountValue[];
    totalUsd: number;
  };
  positionLiquidity: string;
  poolLiquidity: string;
  poolDepthLabel: string;
  triggerId?: ExitTriggerId;
  breachDirection?: BreachDirection;
};
```

- [ ] **Step 3: Run typecheck to harvest the migration checklist**

Run: `pnpm typecheck`
Expected: FAILS in roughly these locations — keep the output handy as the migration checklist:

- `packages/application/src/use-cases/positions/ListSupportedPositions.ts` (missing `lowerBoundPrice` etc.)
- `packages/application/src/use-cases/positions/GetPositionDetail.ts` (`lowerBound`/`upperBound` no longer exist on `PositionDetailDto`)
- `packages/ui/src/presenters/PositionDetailPresenter.ts` (refers to deleted `dto.lowerBound`/`dto.upperBound`)
- `apps/app/src/api/positions.ts` (validator references `lowerBound`/`upperBound`)

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/dto/index.ts
git commit -m "feat(application): tighten position bound DTO contract

Add lowerBoundPrice, upperBoundPrice, lowerBoundLabel, upperBoundLabel
to PositionSummaryDto and remove tick-bound fields from
PositionDetailDto. Subsequent commits resolve the resulting compile
failures."
```

---

## Phase 2 — Application use cases

### Task 2: Add the bound-display helper (TDD)

**Files:**
- Create: `packages/application/src/use-cases/positions/buildPositionDisplayBounds.ts`
- Create: `packages/application/src/use-cases/positions/buildPositionDisplayBounds.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/application/src/use-cases/positions/buildPositionDisplayBounds.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildPositionDisplayBounds } from './buildPositionDisplayBounds.js';

describe('buildPositionDisplayBounds', () => {
  it('returns price-space bounds and labels using token-B as the displayed quote symbol for SOL/USDC', () => {
    const result = buildPositionDisplayBounds({
      lowerTick: -10000,
      upperTick: 10000,
      decimalsA: 9,
      decimalsB: 6,
      displayQuoteSymbol: 'USDC',
    });

    expect(result.lowerBoundPrice).toBeGreaterThan(0);
    expect(result.upperBoundPrice).toBeGreaterThan(result.lowerBoundPrice);
    expect(result.lowerBoundLabel).toBe(`USDC ${result.lowerBoundPrice.toFixed(2)}`);
    expect(result.upperBoundLabel).toBe(`USDC ${result.upperBoundPrice.toFixed(2)}`);
  });

  it('preserves lowerTick < upperTick into lowerBoundPrice < upperBoundPrice for SOL/USDC orientation', () => {
    const result = buildPositionDisplayBounds({
      lowerTick: 100,
      upperTick: 200,
      decimalsA: 9,
      decimalsB: 6,
      displayQuoteSymbol: 'USDC',
    });

    expect(result.lowerBoundPrice).toBeLessThan(result.upperBoundPrice);
  });

  it('formats labels with the supplied display quote symbol', () => {
    const result = buildPositionDisplayBounds({
      lowerTick: 0,
      upperTick: 100,
      decimalsA: 9,
      decimalsB: 6,
      displayQuoteSymbol: 'USDC',
    });

    expect(result.lowerBoundLabel.startsWith('USDC ')).toBe(true);
    expect(result.upperBoundLabel.startsWith('USDC ')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/application test -- buildPositionDisplayBounds`
Expected: FAIL with "Cannot find module './buildPositionDisplayBounds.js'" (or equivalent module-not-found error).

- [ ] **Step 3: Write the helper**

Create `packages/application/src/use-cases/positions/buildPositionDisplayBounds.ts`:

```ts
import { tickToPrice } from '@clmm/domain';

export type PositionDisplayBoundsInput = {
  lowerTick: number;
  upperTick: number;
  decimalsA: number;
  decimalsB: number;
  displayQuoteSymbol: string;
};

export type PositionDisplayBounds = {
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};

export function buildPositionDisplayBounds(input: PositionDisplayBoundsInput): PositionDisplayBounds {
  const lowerBoundPrice = tickToPrice(input.lowerTick, input.decimalsA, input.decimalsB);
  const upperBoundPrice = tickToPrice(input.upperTick, input.decimalsA, input.decimalsB);
  return {
    lowerBoundPrice,
    upperBoundPrice,
    lowerBoundLabel: `${input.displayQuoteSymbol} ${lowerBoundPrice.toFixed(2)}`,
    upperBoundLabel: `${input.displayQuoteSymbol} ${upperBoundPrice.toFixed(2)}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @clmm/application test -- buildPositionDisplayBounds`
Expected: PASS — three tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/positions/buildPositionDisplayBounds.ts \
        packages/application/src/use-cases/positions/buildPositionDisplayBounds.test.ts
git commit -m "feat(application): add buildPositionDisplayBounds helper

Convert raw position bound ticks into price-space values and labels for
DTO emission. Used by ListSupportedPositions and GetPositionDetail."
```

### Task 3: Wire `ListSupportedPositions` to emit price-space bound fields

**Files:**
- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.ts`
- Modify: `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts`

- [ ] **Step 1: Add a failing test for the new contract**

Open `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts` and append the following inside the existing `describe('ListSupportedPositions', () => { ... })`:

```ts
  it('emits price-space lowerBoundPrice and upperBoundPrice (no tick fields) for the SOL/USDC pool', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    const dto = result.summaryDtos[0]!;
    expect(typeof dto.lowerBoundPrice).toBe('number');
    expect(Number.isFinite(dto.lowerBoundPrice)).toBe(true);
    expect(typeof dto.upperBoundPrice).toBe('number');
    expect(Number.isFinite(dto.upperBoundPrice)).toBe(true);
    expect(dto.lowerBoundPrice).toBeLessThan(dto.upperBoundPrice);
    expect(dto.lowerBoundLabel).toBe(`USDC ${dto.lowerBoundPrice.toFixed(2)}`);
    expect(dto.upperBoundLabel).toBe(`USDC ${dto.upperBoundPrice.toFixed(2)}`);
    expect(dto).not.toHaveProperty('lowerBound');
    expect(dto).not.toHaveProperty('upperBound');
  });

  it('excludes positions whose pool metadata is missing', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      {},
    );

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(0);
  });
```

Then **delete** the now-obsolete tick-fallback test:

```ts
  it('falls back to tick labels when pool data unavailable', async () => {
    // ... existing body ...
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/application test -- ListSupportedPositions`
Expected: FAIL — typecheck or runtime errors complaining that `summaryDtos[0]` lacks `lowerBoundPrice`, that the second test still gets one summary entry, etc.

- [ ] **Step 3: Rewrite `ListSupportedPositions.ts` to emit the new fields and exclude incomplete entries**

Replace the body of `packages/application/src/use-cases/positions/ListSupportedPositions.ts` with:

```ts
import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { WalletId, LiquidityPosition, PoolId } from '@clmm/domain';
import type { PositionSummaryDto } from '../../dto/index.js';
import { priceFromSqrtPrice, rangeDistancePercent, formatFeeRateLabel } from '@clmm/domain';
import { buildPositionDisplayBounds } from './buildPositionDisplayBounds.js';

export type ListSupportedPositionsResult = {
  positions: LiquidityPosition[];
  summaryDtos: PositionSummaryDto[];
};

export async function listSupportedPositions(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
}): Promise<ListSupportedPositionsResult> {
  const positions = await params.positionReadPort.listSupportedPositions(params.walletId);

  const uniquePoolIds = [...new Set(positions.map((p) => p.poolId))];
  const poolDataMap = new Map<PoolId, Awaited<ReturnType<SupportedPositionReadPort['getPoolData']>>>();

  await Promise.all(uniquePoolIds.map(async (poolId) => {
    const poolData = await params.positionReadPort.getPoolData(poolId);
    if (poolData) poolDataMap.set(poolId, poolData);
  }));

  const summaryDtos: PositionSummaryDto[] = [];
  for (const p of positions) {
    const poolData = poolDataMap.get(p.poolId);
    if (!poolData) continue;
    const { decimalsA, decimalsB } = poolData.tokenPair;
    if (decimalsA === null || decimalsB === null) continue;

    const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB);
    const distance = rangeDistancePercent(
      p.rangeState.currentPrice,
      p.bounds.lowerBound,
      p.bounds.upperBound,
    );

    const displayQuoteSymbol = poolData.tokenPair.symbolB;
    const bounds = buildPositionDisplayBounds({
      lowerTick: p.bounds.lowerBound,
      upperTick: p.bounds.upperBound,
      decimalsA,
      decimalsB,
      displayQuoteSymbol,
    });

    summaryDtos.push({
      positionId: p.positionId,
      poolId: p.poolId,
      tokenPairLabel: `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}`,
      currentPrice,
      currentPriceLabel: `${displayQuoteSymbol} ${currentPrice.toFixed(2)}`,
      feeRateLabel: formatFeeRateLabel(poolData.feeRate),
      lowerBoundPrice: bounds.lowerBoundPrice,
      upperBoundPrice: bounds.upperBoundPrice,
      lowerBoundLabel: bounds.lowerBoundLabel,
      upperBoundLabel: bounds.upperBoundLabel,
      rangeState: p.rangeState.kind,
      rangeDistance: {
        belowLowerPercent: distance.belowLowerPercent,
        aboveUpperPercent: distance.aboveUpperPercent,
      },
      hasActionableTrigger: false,
      monitoringStatus: p.monitoringReadiness.kind,
    });
  }

  return { positions, summaryDtos };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/application test -- ListSupportedPositions`
Expected: PASS — all four tests in the file are green.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/positions/ListSupportedPositions.ts \
        packages/application/src/use-cases/positions/ListSupportedPositions.test.ts
git commit -m "feat(application): emit price-space bound fields in summary DTOs

ListSupportedPositions now produces lowerBoundPrice/upperBoundPrice and
labels via buildPositionDisplayBounds. Positions whose pool metadata or
token decimals are missing are excluded from summaryDtos rather than
emitting a partial summary."
```

### Task 4: Wire `GetPositionDetail` to use the helper and add `cannot-build-supported-detail-dto` failure

**Files:**
- Modify: `packages/application/src/use-cases/positions/GetPositionDetail.ts`
- Modify: `packages/application/src/use-cases/positions/GetPositionDetail.test.ts`

- [ ] **Step 1: Add failing tests for the new shape and failure mode**

Open `packages/application/src/use-cases/positions/GetPositionDetail.test.ts` and inside the existing `describe('GetPositionDetail', () => { ... })` add:

```ts
  it('emits price-space bound fields and labels matching ListSupportedPositions for the same position', async () => {
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
    if (result.kind !== 'found') return;
    const dto = result.detailDto;
    expect(typeof dto.lowerBoundPrice).toBe('number');
    expect(Number.isFinite(dto.lowerBoundPrice)).toBe(true);
    expect(typeof dto.upperBoundPrice).toBe('number');
    expect(Number.isFinite(dto.upperBoundPrice)).toBe(true);
    expect(dto.lowerBoundPrice).toBeLessThan(dto.upperBoundPrice);
    expect(dto.lowerBoundLabel).toBe(`USDC ${dto.lowerBoundPrice.toFixed(2)}`);
    expect(dto.upperBoundLabel).toBe(`USDC ${dto.upperBoundPrice.toFixed(2)}`);
    expect(dto).not.toHaveProperty('lowerBound');
    expect(dto).not.toHaveProperty('upperBound');
  });

  it('returns cannot-build-supported-detail-dto when the position exists but its token decimals are missing', async () => {
    const poolDataMissingDecimals = {
      ...FIXTURE_POOL_DATA,
      tokenPair: { ...FIXTURE_POOL_DATA.tokenPair, decimalsA: null, decimalsB: null },
    };
    const detail = { ...FIXTURE_POSITION_DETAIL, poolData: poolDataMissingDecimals };
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: poolDataMissingDecimals },
      detail,
    );
    const pricePort = new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]);

    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
      pricePort,
    });

    expect(result.kind).toBe('cannot-build-supported-detail-dto');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @clmm/application test -- GetPositionDetail`
Expected: FAIL — typecheck rejects `'cannot-build-supported-detail-dto'`, and the new fields aren't on the DTO.

- [ ] **Step 3: Replace the use case body**

Replace the contents of `packages/application/src/use-cases/positions/GetPositionDetail.ts` with:

```ts
import type { SupportedPositionReadPort, PricePort } from '../../ports/index.js';
import type { PositionId, WalletId, LiquidityPosition } from '@clmm/domain';
import type { PositionDetailDto, TokenAmountValue, RewardAmountValue } from '../../dto/index.js';
import { priceFromSqrtPrice, rangeDistancePercent, tokenAmountToUsd, formatFeeRateLabel } from '@clmm/domain';
import { buildPositionDisplayBounds } from './buildPositionDisplayBounds.js';

export type GetPositionDetailResult =
  | { kind: 'found'; position: LiquidityPosition; detailDto: PositionDetailDto }
  | { kind: 'not-found' }
  | { kind: 'cannot-build-supported-detail-dto' };

export async function getPositionDetail(params: {
  walletId: WalletId;
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
  pricePort: PricePort;
}): Promise<GetPositionDetailResult> {
  const detail = await params.positionReadPort.getPositionDetail(params.walletId, params.positionId);
  if (!detail) return { kind: 'not-found' };

  const { position, poolData, fees, positionLiquidity } = detail;

  if (position.positionId !== params.positionId || position.walletId !== params.walletId) {
    return { kind: 'not-found' };
  }

  const { decimalsA, decimalsB } = poolData.tokenPair;
  if (decimalsA === null || decimalsB === null) {
    return { kind: 'cannot-build-supported-detail-dto' };
  }

  const priceMap = new Map<string, { usdValue: number; symbol: string }>();
  try {
    const mints = [poolData.tokenPair.mintA, poolData.tokenPair.mintB];
    const rewardMints = fees.rewardInfos
      .map((r) => r.mint)
      .filter((m): m is string => m !== '' && !mints.includes(m));
    const allMints = [...mints, ...rewardMints];
    const quotes = await params.pricePort.getPrices([...new Set(allMints)]);
    for (const q of quotes) {
      priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
    }
  } catch {
    // Price fetch failed — degrade gracefully on USD valuation only.
  }

  const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB);
  const distance = rangeDistancePercent(
    position.rangeState.currentPrice,
    position.bounds.lowerBound,
    position.bounds.upperBound,
  );

  const displayQuoteSymbol = poolData.tokenPair.symbolB;
  const bounds = buildPositionDisplayBounds({
    lowerTick: position.bounds.lowerBound,
    upperTick: position.bounds.upperBound,
    decimalsA,
    decimalsB,
    displayQuoteSymbol,
  });

  const priceA = priceMap.get(poolData.tokenPair.mintA);
  const priceB = priceMap.get(poolData.tokenPair.mintB);

  const feeOwedA: TokenAmountValue = {
    raw: fees.feeOwedA.toString(),
    decimals: decimalsA,
    symbol: poolData.tokenPair.symbolA,
    usdValue: priceA ? tokenAmountToUsd(fees.feeOwedA, decimalsA, priceA.usdValue) : 0,
  };

  const feeOwedB: TokenAmountValue = {
    raw: fees.feeOwedB.toString(),
    decimals: decimalsB,
    symbol: poolData.tokenPair.symbolB,
    usdValue: priceB ? tokenAmountToUsd(fees.feeOwedB, decimalsB, priceB.usdValue) : 0,
  };

  const totalFeesUsd = feeOwedA.usdValue + feeOwedB.usdValue;

  const rewardValues: RewardAmountValue[] = fees.rewardInfos
    .filter((r) => r.mint !== '' && r.amountOwed !== 0n)
    .map((r) => {
      const rPrice = priceMap.get(r.mint);
      return {
        mint: r.mint,
        amount: r.amountOwed.toString(),
        decimals: r.decimals,
        symbol: rPrice?.symbol ?? r.mint,
        usdValue: (r.decimals !== null && rPrice) ? tokenAmountToUsd(r.amountOwed, r.decimals, rPrice.usdValue) : 0,
      };
    });

  const totalRewardsUsd = rewardValues.reduce((sum, r) => sum + r.usdValue, 0);

  const detailDto: PositionDetailDto = {
    positionId: position.positionId,
    poolId: position.poolId,
    tokenPairLabel: `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}`,
    currentPrice,
    currentPriceLabel: `${displayQuoteSymbol} ${currentPrice.toFixed(2)}`,
    feeRateLabel: formatFeeRateLabel(poolData.feeRate),
    lowerBoundPrice: bounds.lowerBoundPrice,
    upperBoundPrice: bounds.upperBoundPrice,
    lowerBoundLabel: bounds.lowerBoundLabel,
    upperBoundLabel: bounds.upperBoundLabel,
    rangeState: position.rangeState.kind,
    rangeDistance: {
      belowLowerPercent: distance.belowLowerPercent,
      aboveUpperPercent: distance.aboveUpperPercent,
    },
    hasActionableTrigger: false,
    monitoringStatus: position.monitoringReadiness.kind,
    sqrtPrice: poolData.sqrtPrice.toString(),
    unclaimedFees: {
      feeOwedA,
      feeOwedB,
      totalUsd: totalFeesUsd,
    },
    unclaimedRewards: {
      rewards: rewardValues,
      totalUsd: totalRewardsUsd,
    },
    positionLiquidity: positionLiquidity.toString(),
    poolLiquidity: poolData.liquidity.toString(),
    poolDepthLabel: 'depth unavailable',
  };

  return { kind: 'found', position, detailDto };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/application test -- GetPositionDetail`
Expected: PASS — all existing tests plus the two new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/positions/GetPositionDetail.ts \
        packages/application/src/use-cases/positions/GetPositionDetail.test.ts
git commit -m "feat(application): tighten GetPositionDetail bound DTO contract

Detail DTO now inherits price-space bound fields from PositionSummaryDto
and drops the tick-index fields. When the position exists but token
decimals are missing, the use case returns
cannot-build-supported-detail-dto rather than fabricating tick-derived
labels or pretending the record is missing."
```

---

## Phase 3 — Adapters (BFF HTTP controller)

### Task 5: Handle `cannot-build-supported-detail-dto` in `PositionController`

**Files:**
- Modify: `packages/adapters/src/inbound/http/PositionController.ts`
- Modify: `packages/adapters/src/inbound/http/PositionController.test.ts`

- [ ] **Step 1: Add a failing controller test for the new failure kind**

Append to `packages/adapters/src/inbound/http/PositionController.test.ts` inside `describe('PositionController', () => { ... })`:

```ts
  it('returns 404 NotFoundException when the position exists but cannot produce a valid supported detail DTO', async () => {
    const poolDataMissingDecimals = {
      ...FIXTURE_POOL_DATA,
      tokenPair: { ...FIXTURE_POOL_DATA.tokenPair, decimalsA: null, decimalsB: null },
    };
    const detail = { ...FIXTURE_POSITION_DETAIL, poolData: poolDataMissingDecimals };
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: poolDataMissingDecimals },
      detail,
    );
    const triggerRepo = new FakeTriggerRepository();
    const controller = new PositionController(positionReadPort, triggerRepo, fakePricePort);

    await expect(
      controller.getPosition(FIXTURE_POSITION_IN_RANGE.walletId, FIXTURE_POSITION_IN_RANGE.positionId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @clmm/adapters test -- PositionController`
Expected: FAIL — TypeScript narrows reject the `cannot-build-supported-detail-dto` branch in the existing controller, or the test throws because the controller currently treats the case as `not-found` only by accident.

- [ ] **Step 3: Update the controller to map the new failure to 404**

Open `packages/adapters/src/inbound/http/PositionController.ts` and replace the `getPosition` method body up through the `not-found` short-circuit so it reads:

```ts
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

    if (result.kind === 'not-found' || result.kind === 'cannot-build-supported-detail-dto') {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    if (result.position.walletId !== wallet) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }
    // ... unchanged: trigger lookup and return ...
```

(Leave the rest of the method body intact.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @clmm/adapters test -- PositionController`
Expected: PASS — all existing controller tests plus the new one.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/PositionController.ts \
        packages/adapters/src/inbound/http/PositionController.test.ts
git commit -m "fix(adapters): map cannot-build-supported-detail-dto to 404

When GetPositionDetail returns the new internal failure kind, surface it
to clients as Position Not Found. Distinct from the application use
case, which now distinguishes 'truly missing' from 'cannot construct an
honest DTO'."
```

---

## Phase 4 — API client (apps/app)

### Task 6: Update `apps/app/src/api/positions.ts` validators

**Files:**
- Modify: `apps/app/src/api/positions.ts`
- Modify: `apps/app/src/api/positions.test.ts`

- [ ] **Step 1: Replace the validator tests**

Open `apps/app/src/api/positions.test.ts`. In the `describe('fetchSupportedPositions', () => { ... })` block, add a new test below the existing happy-path test:

```ts
  it('rejects supported positions whose lowerBoundPrice is not a finite number', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions: [
            {
              positionId: 'Position1111111111111111111111111111111111',
              poolId: 'Pool111111111111111111111111111111111111111',
              rangeState: 'in-range',
              hasActionableTrigger: false,
              monitoringStatus: 'active',
              lowerBoundPrice: Number.NaN,
              upperBoundPrice: 200,
              lowerBoundLabel: 'USDC NaN',
              upperBoundLabel: 'USDC 200.00',
            },
          ],
        }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed positions response',
    );
  });

  it('rejects supported positions whose lowerBoundLabel is not a string', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions: [
            {
              positionId: 'Position1111111111111111111111111111111111',
              poolId: 'Pool111111111111111111111111111111111111111',
              rangeState: 'in-range',
              hasActionableTrigger: false,
              monitoringStatus: 'active',
              lowerBoundPrice: 100,
              upperBoundPrice: 200,
              lowerBoundLabel: 100,
              upperBoundLabel: 'USDC 200.00',
            },
          ],
        }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed positions response',
    );
  });
```

Then, in the `describe('fetchSupportedPositions', () => { ... })` happy-path test, update the inline `positions` array literal so each entry includes the new fields:

```ts
    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '10 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
        hasActionableTrigger: false,
        monitoringStatus: 'active',
      },
    ] as PositionSummaryDto[];
```

In the `'throws a controlled error when the BFF payload is malformed'` test, change `positionId: 123` so the malformation is the `positionId` type, not bound presence (existing test already does this — leave the `positions: [{ positionId: 123, ... }]` payload as-is, but ensure all other fields satisfy the new type so the test still tells us what we want).

In `describe('fetchPositionDetail', () => { ... })`, replace the existing `'rejects position detail payloads with NaN bounds or price'` and `'rejects position detail payloads with infinite bounds or price'` tests with:

```ts
  it('rejects position detail payloads whose lowerBoundPrice is NaN', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          position: {
            positionId: 'Position1111111111111111111111111111111111',
            poolId: 'Pool111111111111111111111111111111111111111',
            rangeState: 'below-range',
            hasActionableTrigger: false,
            monitoringStatus: 'active',
            lowerBoundPrice: Number.NaN,
            upperBoundPrice: 200,
            lowerBoundLabel: 'USDC NaN',
            upperBoundLabel: 'USDC 200.00',
            currentPrice: 80,
          },
        }),
    }) as typeof fetch;

    const error = await fetchPositionDetail(
      'DemoWallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed position detail response',
    );
  });

  it('rejects position detail payloads whose upperBoundPrice is infinite', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          position: {
            positionId: 'Position1111111111111111111111111111111111',
            poolId: 'Pool111111111111111111111111111111111111111',
            rangeState: 'below-range',
            hasActionableTrigger: false,
            monitoringStatus: 'active',
            lowerBoundPrice: 100,
            upperBoundPrice: Number.POSITIVE_INFINITY,
            lowerBoundLabel: 'USDC 100.00',
            upperBoundLabel: 'USDC Infinity',
            currentPrice: 80,
          },
        }),
    }) as typeof fetch;

    const error = await fetchPositionDetail(
      'DemoWallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed position detail response',
    );
  });

  it('does not require lowerBound or upperBound tick fields on detail payloads', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const detail = {
      positionId: 'Position1111111111111111111111111111111111',
      poolId: 'Pool111111111111111111111111111111111111111',
      rangeState: 'below-range',
      hasActionableTrigger: false,
      monitoringStatus: 'active',
      lowerBoundPrice: 100,
      upperBoundPrice: 200,
      lowerBoundLabel: 'USDC 100.00',
      upperBoundLabel: 'USDC 200.00',
      currentPrice: 80,
    } as PositionDetailDto;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ position: detail }),
    }) as typeof fetch;

    await expect(
      fetchPositionDetail(
        'DemoWallet1111111111111111111111111111111111',
        'Position1111111111111111111111111111111111',
      ),
    ).resolves.toEqual(detail);
  });
```

Also update the existing happy-path test, the warning-passthrough test, and the `forward-compat: ignores srLevels` test to drop `lowerBound`/`upperBound` and add `lowerBoundPrice`/`upperBoundPrice`/`lowerBoundLabel`/`upperBoundLabel`. Concretely, in each `detail` object literal:

- Remove: `lowerBound: 100,` and `upperBound: 200,`
- Add: `lowerBoundPrice: 100, upperBoundPrice: 200, lowerBoundLabel: 'USDC 100.00', upperBoundLabel: 'USDC 200.00',`

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter app test -- positions`
Expected: FAIL — the validator currently demands `lowerBound`/`upperBound`, so the new payloads are rejected and the rewritten tests fail.

- [ ] **Step 3: Update the validator**

Open `apps/app/src/api/positions.ts` and replace `isPositionSummaryRecord` and `isPositionDetailDto` with:

```ts
function isPositionSummaryRecord(value: Record<string, unknown>): boolean {
  const lowerBoundPrice = value['lowerBoundPrice'];
  const upperBoundPrice = value['upperBoundPrice'];
  return (
    typeof value['positionId'] === 'string' &&
    typeof value['poolId'] === 'string' &&
    typeof value['hasActionableTrigger'] === 'boolean' &&
    VALID_RANGE_STATES.includes(value['rangeState'] as (typeof VALID_RANGE_STATES)[number]) &&
    VALID_MONITORING_STATUSES.includes(
      value['monitoringStatus'] as (typeof VALID_MONITORING_STATUSES)[number],
    ) &&
    typeof lowerBoundPrice === 'number' &&
    Number.isFinite(lowerBoundPrice) &&
    typeof upperBoundPrice === 'number' &&
    Number.isFinite(upperBoundPrice) &&
    typeof value['lowerBoundLabel'] === 'string' &&
    typeof value['upperBoundLabel'] === 'string'
  );
}

function isPositionDetailDto(value: unknown): value is PositionDetailDto {
  if (!isRecord(value)) {
    return false;
  }

  const breachDirection = value['breachDirection'];
  const currentPrice = value['currentPrice'];

  const baseValid =
    isPositionSummaryRecord(value) &&
    typeof currentPrice === 'number' &&
    Number.isFinite(currentPrice) &&
    (value['triggerId'] == null || typeof value['triggerId'] === 'string') &&
    (breachDirection == null ||
      (isRecord(breachDirection) &&
        VALID_BREACH_DIRECTIONS.includes(
          breachDirection['kind'] as BreachDirection['kind'],
        )));

  return baseValid;
}
```

(Delete the local `lowerBound`/`upperBound` reads in `isPositionDetailDto` — they no longer exist on the DTO.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter app test -- positions`
Expected: PASS — both `fetchSupportedPositions` and `fetchPositionDetail` describes are green.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/api/positions.ts apps/app/src/api/positions.test.ts
git commit -m "feat(app): validate price-space bound fields, drop tick fields

The summary and detail validators now require finite lowerBoundPrice and
upperBoundPrice, plus string lowerBoundLabel and upperBoundLabel. They
no longer require lowerBound or upperBound."
```

---

## Phase 5 — UI

### Task 7: Add the bound fields to `PositionListItemViewModel`

**Files:**
- Modify: `packages/ui/src/view-models/PositionListViewModel.ts`
- Create: `packages/ui/src/view-models/PositionListViewModel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/view-models/PositionListViewModel.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import type { PositionSummaryDto } from '@clmm/application/public';
import { buildPositionListViewModel } from './PositionListViewModel.js';

function makeSummary(overrides: Partial<PositionSummaryDto> = {}): PositionSummaryDto {
  return {
    positionId: 'position-1' as PositionSummaryDto['positionId'],
    poolId: 'pool-1' as PositionSummaryDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 150,
    currentPriceLabel: 'USDC 150.00',
    feeRateLabel: '10 bps',
    lowerBoundPrice: 100,
    upperBoundPrice: 200,
    lowerBoundLabel: 'USDC 100.00',
    upperBoundLabel: 'USDC 200.00',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    ...overrides,
  };
}

describe('buildPositionListViewModel', () => {
  it('exposes lowerBoundPrice, upperBoundPrice, lowerBoundLabel, upperBoundLabel from the DTO', () => {
    const vm = buildPositionListViewModel([makeSummary()]);
    expect(vm.items[0]?.lowerBoundPrice).toBe(100);
    expect(vm.items[0]?.upperBoundPrice).toBe(200);
    expect(vm.items[0]?.lowerBoundLabel).toBe('USDC 100.00');
    expect(vm.items[0]?.upperBoundLabel).toBe('USDC 200.00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @clmm/ui test -- PositionListViewModel`
Expected: FAIL — TypeScript and runtime both reject the four new view-model fields.

- [ ] **Step 3: Add the fields to the view model and mapper**

Open `packages/ui/src/view-models/PositionListViewModel.ts` and update the type and mapper to include the new fields:

```ts
import type { PositionSummaryDto } from '@clmm/application/public';

export type PositionListItemViewModel = {
  positionId: string;
  poolLabel: string;
  currentPriceLabel: string;
  feeRateLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
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

function rangeDistanceLabel(distance: { belowLowerPercent: number; aboveUpperPercent: number } | undefined): string {
  if (!distance) return '';
  if (distance.belowLowerPercent > 0) {
    return `${distance.belowLowerPercent.toFixed(1)}% below lower`;
  }
  if (distance.aboveUpperPercent > 0) {
    return `${distance.aboveUpperPercent.toFixed(1)}% above upper`;
  }
  return '';
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolLabel: p.tokenPairLabel,
    currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
    feeRateLabel: p.feeRateLabel ?? '',
    lowerBoundPrice: p.lowerBoundPrice,
    upperBoundPrice: p.upperBoundPrice,
    lowerBoundLabel: p.lowerBoundLabel,
    upperBoundLabel: p.upperBoundLabel,
    rangeStatusLabel: rangeStateLabel(p.rangeState),
    rangeStatusKind: p.rangeState,
    rangeDistanceLabel: rangeDistanceLabel(p.rangeDistance),
    hasAlert: p.hasActionableTrigger,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
  }));

  return { items, isEmpty: items.length === 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @clmm/ui test -- PositionListViewModel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/view-models/PositionListViewModel.ts \
        packages/ui/src/view-models/PositionListViewModel.test.ts
git commit -m "feat(ui): expose price-space bound fields on PositionListItemViewModel

Map lowerBoundPrice, upperBoundPrice, lowerBoundLabel, upperBoundLabel
from PositionSummaryDto so the position card layout work can render
range bars and labels without re-deriving them in the UI."
```

### Task 8: Update `PositionDetailPresenter` fallbacks

**Files:**
- Modify: `packages/ui/src/presenters/PositionDetailPresenter.ts`

- [ ] **Step 1: Replace tick-DTO fallbacks with price-space fallbacks**

Open `packages/ui/src/presenters/PositionDetailPresenter.ts` and replace the body of `normalizePositionDetailDto`. The deleted lines are the four tick references; replace them with the four price-space fields. Final file content:

```ts
import type { PositionDetailDto } from '@clmm/application/public';
import { buildPositionDetailViewModel, type PositionDetailViewModel } from '../view-models/PositionDetailViewModel.js';

export type PositionDetailPresentation = {
  position: PositionDetailViewModel;
};

const EMPTY_TOKEN_AMOUNT = { raw: '0', decimals: null, symbol: '', usdValue: 0 };

function normalizePositionDetailDto(dto: Partial<PositionDetailDto> & Pick<PositionDetailDto, 'positionId' | 'poolId'>): PositionDetailDto {
  const poolId = dto.poolId ?? 'unknown';
  const lowerBoundPrice = dto.lowerBoundPrice ?? 0;
  const upperBoundPrice = dto.upperBoundPrice ?? 0;
  return {
    positionId: dto.positionId,
    poolId,
    tokenPairLabel: dto.tokenPairLabel ?? `Pool ${poolId}`,
    currentPrice: dto.currentPrice ?? 0,
    currentPriceLabel: dto.currentPriceLabel ?? `${(dto.currentPrice ?? 0).toFixed(2)}`,
    feeRateLabel: dto.feeRateLabel ?? '',
    rangeState: dto.rangeState ?? 'in-range',
    rangeDistance: dto.rangeDistance ?? { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: dto.hasActionableTrigger ?? false,
    monitoringStatus: dto.monitoringStatus ?? 'active',
    lowerBoundPrice,
    upperBoundPrice,
    lowerBoundLabel: dto.lowerBoundLabel ?? lowerBoundPrice.toFixed(2),
    upperBoundLabel: dto.upperBoundLabel ?? upperBoundPrice.toFixed(2),
    sqrtPrice: dto.sqrtPrice ?? '0',
    unclaimedFees: dto.unclaimedFees ?? {
      feeOwedA: { ...EMPTY_TOKEN_AMOUNT },
      feeOwedB: { ...EMPTY_TOKEN_AMOUNT },
      totalUsd: 0,
    },
    unclaimedRewards: dto.unclaimedRewards ?? {
      rewards: [],
      totalUsd: 0,
    },
    positionLiquidity: dto.positionLiquidity ?? '0',
    poolLiquidity: dto.poolLiquidity ?? '0',
    poolDepthLabel: dto.poolDepthLabel ?? 'depth unavailable',
    ...(dto.triggerId ? { triggerId: dto.triggerId } : {}),
    ...(dto.breachDirection ? { breachDirection: dto.breachDirection } : {}),
  };
}

export function presentPositionDetail(params: {
  position: PositionDetailDto;
}): PositionDetailPresentation {
  const normalized = normalizePositionDetailDto(params.position as Partial<PositionDetailDto> & Pick<PositionDetailDto, 'positionId' | 'poolId'>);
  return { position: buildPositionDetailViewModel(normalized) };
}
```

- [ ] **Step 2: Run typecheck and the presenter's downstream tests**

Run: `pnpm --filter @clmm/ui typecheck`
Expected: PASS.

Run: `pnpm --filter @clmm/ui test -- PositionDetailViewModel PositionDetailScreen`
Expected: FAIL on the existing fixtures (next task fixes the test fixtures).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/presenters/PositionDetailPresenter.ts
git commit -m "refactor(ui): use price-space fallbacks in PositionDetailPresenter

Stop normalizing deleted tick DTO fields. Fallbacks now produce valid
price-space numbers and labels."
```

### Task 9: Update detail UI test fixtures

**Files:**
- Modify: `packages/ui/src/view-models/PositionDetailViewModel.test.ts`
- Modify: `packages/ui/src/screens/PositionDetailScreen.test.tsx`

- [ ] **Step 1: Update the detail view-model test fixture**

Open `packages/ui/src/view-models/PositionDetailViewModel.test.ts` and replace the `makeDto` body so the `lowerBound`/`upperBound` lines are removed and the `lowerBoundPrice`/`upperBoundPrice` fields are added:

```ts
function makeDto(overrides: Partial<PositionDetailDto> = {}): PositionDetailDto {
  return {
    positionId: 'position-1' as PositionDetailDto['positionId'],
    poolId: 'pool-1' as PositionDetailDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 150,
    currentPriceLabel: 'USDC 150.00',
    feeRateLabel: '10 bps',
    lowerBoundPrice: 100,
    upperBoundPrice: 200,
    lowerBoundLabel: 'USDC 100.00',
    upperBoundLabel: 'USDC 200.00',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    sqrtPrice: '123456',
    unclaimedFees: {
      feeOwedA: { raw: '100000000', decimals: 9, symbol: 'SOL', usdValue: 15 },
      feeOwedB: { raw: '30000000', decimals: 6, symbol: 'USDC', usdValue: 30 },
      totalUsd: 45,
    },
    unclaimedRewards: {
      rewards: [],
      totalUsd: 0,
    },
    positionLiquidity: '5000000000',
    poolLiquidity: '2400000000',
    poolDepthLabel: 'depth unavailable',
    ...overrides,
  };
}
```

- [ ] **Step 2: Update the detail screen test fixture**

Open `packages/ui/src/screens/PositionDetailScreen.test.tsx` and replace `makePosition` similarly:

```ts
function makePosition(overrides: Partial<PositionDetailDto> = {}): PositionDetailDto {
  return {
    positionId: 'position-1' as PositionDetailDto['positionId'],
    poolId: 'pool-1' as PositionDetailDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 80,
    currentPriceLabel: 'USDC 80.00',
    feeRateLabel: '10 bps',
    lowerBoundPrice: 1.01,
    upperBoundPrice: 1.22,
    lowerBoundLabel: 'USDC 1.01',
    upperBoundLabel: 'USDC 1.22',
    rangeState: 'below-range',
    rangeDistance: { belowLowerPercent: 20, aboveUpperPercent: 0 },
    hasActionableTrigger: true,
    monitoringStatus: 'active',
    sqrtPrice: '123456',
    unclaimedFees: {
      feeOwedA: { raw: '100000000', decimals: 9, symbol: 'SOL', usdValue: 15 },
      feeOwedB: { raw: '30000000', decimals: 6, symbol: 'USDC', usdValue: 30 },
      totalUsd: 45,
    },
    unclaimedRewards: {
      rewards: [],
      totalUsd: 0,
    },
    positionLiquidity: '5000000000',
    poolLiquidity: '2400000000',
    poolDepthLabel: 'depth unavailable',
    triggerId: 'trigger-1' as NonNullable<PositionDetailDto['triggerId']>,
    breachDirection: { kind: 'lower-bound-breach' },
    ...overrides,
  };
}
```

- [ ] **Step 3: Run UI tests to verify they pass**

Run: `pnpm --filter @clmm/ui test`
Expected: PASS — all UI tests including the existing screen and view-model regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/view-models/PositionDetailViewModel.test.ts \
        packages/ui/src/screens/PositionDetailScreen.test.tsx
git commit -m "test(ui): align detail fixtures with price-space bound DTO contract

Remove deleted tick-bound fields from detail test fixtures and add the
new price-space bound fields. The detail screen and view-model tests
continue to assert the same observable behavior."
```

### Task 10: Update list-screen fixtures (if needed)

**Files:**
- Modify: `packages/ui/src/screens/PositionsListScreen.test.tsx`

- [ ] **Step 1: Add the new bound fields to `makePosition`**

Open `packages/ui/src/screens/PositionsListScreen.test.tsx` and update the `makePosition` factory so each summary fixture includes the new fields:

```ts
function makePosition(overrides: Partial<PositionSummaryDto> = {}): PositionSummaryDto {
  return {
    positionId: brand<PositionSummaryDto['positionId']>('position-1'),
    poolId: brand<PositionSummaryDto['poolId']>('pool-1'),
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 142.35,
    currentPriceLabel: 'USDC 142.35',
    feeRateLabel: '10 bps',
    lowerBoundPrice: 130,
    upperBoundPrice: 160,
    lowerBoundLabel: 'USDC 130.00',
    upperBoundLabel: 'USDC 160.00',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    ...overrides,
  };
}
```

- [ ] **Step 2: Run UI tests**

Run: `pnpm --filter @clmm/ui test -- PositionsListScreen`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/PositionsListScreen.test.tsx
git commit -m "test(ui): include bound fields in PositionsListScreen fixtures

Required by the tightened PositionSummaryDto contract."
```

---

## Phase 6 — Cross-cutting verification

### Task 11: Run full migration verification

**Files:** none

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Targeted unit tests**

Run: `pnpm test`
Expected: PASS — every test in the workspace.

- [ ] **Step 3: Boundaries**

Run: `pnpm boundaries`
Expected: PASS — `buildPositionDisplayBounds` does not introduce a forbidden import (it stays in `packages/application` and only depends on `@clmm/domain`).

- [ ] **Step 4: Build and lint (full repo gate)**

Because the change touches shared application contracts and runs through adapters, UI, and apps:

Run: `pnpm build`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 5: Spot-check the dev BFF returns the new fields**

Start the BFF (use whichever script the repo runs day-to-day; if unsure, run from the repo root): `pnpm --filter @clmm/adapters dev`. Then `curl http://localhost:<bff-port>/positions/<wallet>/<position>` and inspect the JSON. Confirm that `position.lowerBoundPrice`, `upperBoundPrice`, `lowerBoundLabel`, and `upperBoundLabel` are present, and that `lowerBound` and `upperBound` are absent.

If the BFF is not runnable in this environment, document the limitation in the PR description rather than skipping silently.

- [ ] **Step 6: Final commit (if anything was nudged) and prep PR**

If any verification step required follow-up edits, commit them with a descriptive message. Then prepare a PR description that lists:

- Migration of `PositionSummaryDto` and `PositionDetailDto` to the strict bound contract.
- Introduction of `buildPositionDisplayBounds` helper.
- New `cannot-build-supported-detail-dto` failure kind for `GetPositionDetail`.
- API validator update.
- UI view-model and presenter updates.
- Verification commands run.

Do not say "PR-ready" without listing what was verified.
