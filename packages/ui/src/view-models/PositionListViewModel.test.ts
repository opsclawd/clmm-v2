import { describe, expect, it } from 'vitest';
import type { PositionSummaryDto } from '@clmm/application/public';
import { buildPositionListViewModel, asMonitoringStatus } from './PositionListViewModel.js';

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

  it('exposes poolId and numeric currentPrice for card-layer consumers', () => {
    const vm = buildPositionListViewModel([
      makeSummaryDto({
        poolId: 'pool-xyz' as PositionSummaryDto['poolId'],
        currentPrice: 142.35,
      }),
    ]);
    const item = vm.items[0]!;

    expect(item.poolId).toBe('pool-xyz');
    expect(item.currentPrice).toBe(142.35);
  });

  it('returns isEmpty true when list is empty', () => {
    const vm = buildPositionListViewModel([]);
    expect(vm.isEmpty).toBe(true);
    expect(vm.items).toHaveLength(0);
  });
});

describe('buildPositionListViewModel monitoringStatus mapping', () => {
  it('copies active monitoring status through as a typed value', () => {
    const vm = buildPositionListViewModel([makeSummaryDto({ monitoringStatus: 'active' })]);
    expect(vm.items[0]!.monitoringStatus).toBe('active');
  });

  it('copies degraded monitoring status through as a typed value', () => {
    const vm = buildPositionListViewModel([makeSummaryDto({ monitoringStatus: 'degraded' })]);
    expect(vm.items[0]!.monitoringStatus).toBe('degraded');
  });

  it('copies inactive monitoring status through as a typed value', () => {
    const vm = buildPositionListViewModel([makeSummaryDto({ monitoringStatus: 'inactive' })]);
    expect(vm.items[0]!.monitoringStatus).toBe('inactive');
  });

  it('throws on an invalid monitoringStatus from the DTO', () => {
    expect(() =>
      buildPositionListViewModel([
        makeSummaryDto({ monitoringStatus: 'unknown' as PositionSummaryDto['monitoringStatus'] }),
      ]),
    ).toThrow('Invalid monitoringStatus');
  });
});

describe('asMonitoringStatus', () => {
  it('returns valid statuses unchanged', () => {
    expect(asMonitoringStatus('active')).toBe('active');
    expect(asMonitoringStatus('degraded')).toBe('degraded');
    expect(asMonitoringStatus('inactive')).toBe('inactive');
  });

  it('throws for an invalid value', () => {
    expect(() => asMonitoringStatus('unknown')).toThrow('Invalid monitoringStatus');
  });
});
