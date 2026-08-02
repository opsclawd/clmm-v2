import { describe, expect, it } from 'vitest';
import { makePositionId, makePoolId } from '@clmm/domain';
import type { PositionDetailDto } from './index.js';
import { isPositionDetailDto } from './validation.js';

const validDetail: PositionDetailDto = {
  positionId: makePositionId('pos-1'),
  poolId: makePoolId('pool-1'),
  tokenPairLabel: 'SOL/USDC',
  currentPrice: 150.0,
  currentPriceLabel: '$150.00',
  feeRateLabel: '0.05%',
  lowerBoundPrice: 100.0,
  upperBoundPrice: 200.0,
  lowerBoundLabel: '$100.00',
  upperBoundLabel: '$200.00',
  rangeState: 'in-range',
  rangeDistance: {
    belowLowerPercent: 0,
    aboveUpperPercent: 0,
  },
  hasActionableTrigger: false,
  monitoringStatus: 'active',
  sqrtPrice: '123456789',
  unclaimedFees: {
    feeOwedA: { raw: '1000', decimals: 9, symbol: 'SOL', usdValue: 1.5 },
    feeOwedB: { raw: '2000', decimals: 6, symbol: 'USDC', usdValue: 2.0 },
    totalUsd: 3.5,
  },
  unclaimedRewards: {
    rewards: [],
    totalUsd: 0,
  },
  positionLiquidity: '1000000',
  poolLiquidity: '10000000',
  poolDepthLabel: 'Deep',
  positionAmounts: {
    amountA: { raw: '1000000000', decimals: 9, symbol: 'SOL', usdValue: 150.0 },
    amountB: { raw: '150000000', decimals: 6, symbol: 'USDC', usdValue: 150.0 },
    totalUsd: 300.0,
  },
};

describe('PositionDetailDto positionAmounts validation', () => {
  it('accepts valid position amounts and legacy omission', () => {
    expect(isPositionDetailDto(validDetail)).toBe(true);
    const { positionAmounts: _omitted, ...legacyDetail } = validDetail;
    expect(isPositionDetailDto(legacyDetail)).toBe(true);
  });

  it('rejects malformed position amounts', () => {
    expect(
      isPositionDetailDto({
        ...validDetail,
        positionAmounts: {
          ...validDetail.positionAmounts!,
          totalUsd: Number.NaN,
        },
      }),
    ).toBe(false);
    expect(
      isPositionDetailDto({
        ...validDetail,
        positionAmounts: {
          ...validDetail.positionAmounts!,
          amountA: { ...validDetail.positionAmounts!.amountA, decimals: -1 },
        },
      }),
    ).toBe(false);
  });
});
