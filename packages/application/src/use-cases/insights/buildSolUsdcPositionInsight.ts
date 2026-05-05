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
        (w) =>
          w.code === 'fee_reward_usd_unavailable' && w.scope?.positionId === position.positionId,
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
