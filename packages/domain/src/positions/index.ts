import type { PositionId, WalletId, PoolId, ClockTimestamp } from '../shared/index.js';

export type RangeBounds = {
  readonly lowerBound: number;
  readonly upperBound: number;
};

export type RangeState =
  | { readonly kind: 'in-range'; readonly currentPrice: number }
  | { readonly kind: 'below-range'; readonly currentPrice: number }
  | { readonly kind: 'above-range'; readonly currentPrice: number };

export function evaluateRangeState(
  bounds: RangeBounds,
  currentPrice: number,
): RangeState {
  if (currentPrice < bounds.lowerBound) {
    return { kind: 'below-range', currentPrice };
  }
  if (currentPrice > bounds.upperBound) {
    return { kind: 'above-range', currentPrice };
  }
  return { kind: 'in-range', currentPrice };
}

export type MonitoringReadiness =
  | { readonly kind: 'active' }
  | { readonly kind: 'degraded'; readonly reason: string }
  | { readonly kind: 'inactive'; readonly reason: string };

export type LiquidityPosition = {
  readonly positionId: PositionId;
  readonly walletId: WalletId;
  readonly poolId: PoolId;
  readonly bounds: RangeBounds;
  readonly lastObservedAt: ClockTimestamp;
  readonly rangeState: RangeState;
  readonly monitoringReadiness: MonitoringReadiness;
};

export type TokenPair = {
  readonly mintA: string;
  readonly mintB: string;
  readonly symbolA: string;
  readonly symbolB: string;
  readonly decimalsA: number | null;
  readonly decimalsB: number | null;
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
  readonly decimals: number | null;
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
  whirlpoolFeeRateToBps,
  formatFeeRateLabel,
} from './enrichment.js';