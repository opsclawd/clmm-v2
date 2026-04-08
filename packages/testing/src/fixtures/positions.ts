import type { LiquidityPosition } from '@clmm/domain';
import {
  makePositionId,
  makeWalletId,
  makePoolId,
  makeClockTimestamp,
} from '@clmm/domain';

export const FIXTURE_POSITION_ID = makePositionId('fixture-pos-1');
export const FIXTURE_WALLET_ID = makeWalletId('fixture-wallet-1');
export const FIXTURE_POOL_ID = makePoolId('fixture-pool-1');

export const FIXTURE_POSITION_IN_RANGE: LiquidityPosition = {
  positionId: FIXTURE_POSITION_ID,
  walletId: FIXTURE_WALLET_ID,
  poolId: FIXTURE_POOL_ID,
  bounds: { lowerBound: 100, upperBound: 200 },
  lastObservedAt: makeClockTimestamp(1_000_000),
  rangeState: { kind: 'in-range', currentPrice: 150 },
  monitoringReadiness: { kind: 'active' },
};

export const FIXTURE_POSITION_BELOW_RANGE: LiquidityPosition = {
  ...FIXTURE_POSITION_IN_RANGE,
  rangeState: { kind: 'below-range', currentPrice: 80 },
};

export const FIXTURE_POSITION_ABOVE_RANGE: LiquidityPosition = {
  ...FIXTURE_POSITION_IN_RANGE,
  rangeState: { kind: 'above-range', currentPrice: 250 },
};
