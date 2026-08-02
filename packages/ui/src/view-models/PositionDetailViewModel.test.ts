import { describe, expect, it } from 'vitest';
import type { PositionDetailDto } from '@clmm/application/public';
import { buildPositionDetailViewModel } from './PositionDetailViewModel.js';

const positionAmounts = {
  amountA: { raw: '10500000000', decimals: 9, symbol: 'SOL', usdValue: 1575 },
  amountB: { raw: '250000000', decimals: 6, symbol: 'USDC', usdValue: 250 },
  totalUsd: 1825,
};

function makeDto(
  overrides: Omit<Partial<PositionDetailDto>, 'positionAmounts'> & {
    positionAmounts?: PositionDetailDto['positionAmounts'] | undefined;
  } = {},
): PositionDetailDto {
  const { positionAmounts: overridePositionAmounts, ...rest } = overrides;
  const dto: PositionDetailDto = {
    positionId: 'position-1' as PositionDetailDto['positionId'],
    poolId: 'pool-1' as PositionDetailDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 150,
    currentPriceLabel: 'USDC 150.00',
    feeRateLabel: '10 bps',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    lowerBoundPrice: 100,
    upperBoundPrice: 200,
    lowerBoundLabel: 'USDC 100.00',
    upperBoundLabel: 'USDC 200.00',
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
    positionAmounts,
    poolLiquidity: '2400000000',
    poolDepthLabel: 'depth unavailable',
    ...rest,
  };

  if ('positionAmounts' in overrides) {
    if (overridePositionAmounts === undefined) {
      delete dto.positionAmounts;
    } else {
      dto.positionAmounts = overridePositionAmounts;
    }
  }

  return dto;
}

describe('buildPositionDetailViewModel', () => {
  it('returns base fields without srLevels (regression)', () => {
    const vm = buildPositionDetailViewModel(makeDto());
    expect(vm).not.toHaveProperty('srLevels');
    expect(vm.poolLabel).toBe('SOL / USDC');
  });

  it('formats complete USD value as the position size', () => {
    const vm = buildPositionDetailViewModel(
      makeDto({ positionAmounts: { ...positionAmounts, totalUsd: 1575 } }),
    );
    expect(vm.positionSizeLabel).toBe('$1575.00 position size');
  });

  it('falls back to token composition when USD valuation is unavailable', () => {
    const vm = buildPositionDetailViewModel(
      makeDto({ positionAmounts: { ...positionAmounts, totalUsd: 0 } }),
    );
    expect(vm.positionSizeLabel).toBe('10.5000 SOL + 250.0000 USDC position size');
  });

  it('falls back to raw liquidity for a legacy detail without position amounts', () => {
    const vm = buildPositionDetailViewModel(makeDto({ positionAmounts: undefined }));
    expect(vm.positionSizeLabel).toBe('5000000000 liquidity units');
  });
});
