import { describe, expect, it } from 'vitest';
import type { PositionSummaryDto } from '@clmm/application/public';
import { buildPositionListViewModel } from './PositionListViewModel.js';

function makeSummaryDto(overrides: Partial<PositionSummaryDto> = {}): PositionSummaryDto {
  return {
    positionId: 'position-1' as PositionSummaryDto['positionId'],
    poolId: 'pool-1' as PositionSummaryDto['poolId'],
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
    ...overrides,
  };
}

describe('buildPositionListViewModel', () => {
  it('maps price-space bound fields from DTO', () => {
    const vm = buildPositionListViewModel([makeSummaryDto()]);
    const item = vm.items[0]!;

    expect(item.lowerBoundPrice).toBe(100);
    expect(item.upperBoundPrice).toBe(200);
    expect(item.lowerBoundLabel).toBe('USDC 100.00');
    expect(item.upperBoundLabel).toBe('USDC 200.00');
  });

  it('returns isEmpty true when list is empty', () => {
    const vm = buildPositionListViewModel([]);
    expect(vm.isEmpty).toBe(true);
    expect(vm.items).toHaveLength(0);
  });
});