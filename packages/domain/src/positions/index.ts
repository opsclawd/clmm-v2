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