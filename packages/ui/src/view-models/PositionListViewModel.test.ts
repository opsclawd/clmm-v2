import { describe, expect, it } from 'vitest';
import type { PositionSummaryDto, PositionListFinancialMetricsDto } from '@clmm/application/public';
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

type PoolFinancialMetricsDto = PositionListFinancialMetricsDto['poolsById'][string];
type PoolTvlMetricDto = NonNullable<PoolFinancialMetricsDto['tvl']>;
type PoolFees24hMetricDto = NonNullable<PoolFinancialMetricsDto['fees24h']>;

function makePoolTvlMetric(overrides: Partial<PoolTvlMetricDto> = {}): PoolTvlMetricDto {
  return {
    poolId: 'pool-1' as PoolTvlMetricDto['poolId'],
    valueUsd: 1_000_000,
    observedAtUnixMs: Date.now(),
    source: 'orca-whirlpool',
    scope: 'whole-orca-pool',
    ...overrides,
  };
}

function makePoolFees24hMetric(
  overrides: Partial<PoolFees24hMetricDto> = {},
): PoolFees24hMetricDto {
  return {
    poolId: 'pool-1' as PoolFees24hMetricDto['poolId'],
    valueUsd: 5000,
    source: 'orca-whirlpool',
    windowStartUnixMs: Date.now() - 86400000,
    windowEndUnixMs: Date.now(),
    scope: 'whole-orca-pool',
    ...overrides,
  };
}

function makePoolMetrics(
  overrides: Partial<PoolFinancialMetricsDto> = {},
): PoolFinancialMetricsDto {
  return {
    tvl: makePoolTvlMetric(),
    fees24h: makePoolFees24hMetric(),
    ...overrides,
  };
}

function makeFinancialMetrics(
  overrides: Partial<PositionListFinancialMetricsDto> = {},
): PositionListFinancialMetricsDto {
  return {
    positionValue: {
      valueUsd: 25_000,
      valuedAtUnixMs: Date.now(),
      source: 'orca-whirlpool',
      basis: 'principal-token-amounts',
      scope: 'returned-supported-positions',
      excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
    },
    unclaimedFees: {
      valueUsd: 350.5,
      valuedAtUnixMs: Date.now(),
      source: 'orca-whirlpool',
      basis: 'currently-claimable-trading-fees',
      scope: 'returned-supported-positions',
      excludes: ['rewards', 'collected-fees', 'lifetime-fees'] as const,
    },
    poolsById: { 'pool-1': makePoolMetrics() },
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

describe('Financial metric mapping invariants', () => {
  describe('maps null financial metrics to unavailable display states', () => {
    it('maps null positionValue to unavailable', () => {
      const metrics = makeFinancialMetrics({ positionValue: null });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue).toEqual({ kind: 'unavailable', label: '—' });
    });

    it('maps null unclaimedFees to unavailable', () => {
      const metrics = makeFinancialMetrics({ unclaimedFees: null });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.unclaimedFees).toEqual({ kind: 'unavailable', label: '—' });
    });

    it('maps undefined poolsById entry to unavailable pool metrics', () => {
      const metrics = makeFinancialMetrics({ poolsById: {} });
      const vm = buildPositionListViewModel(
        [makeSummaryDto({ poolId: 'unknown-pool' as PositionSummaryDto['poolId'] })],
        metrics,
      );
      expect(vm.items[0]!.poolTvl).toEqual({ kind: 'unavailable', label: '—' });
      expect(vm.items[0]!.poolFees24h).toEqual({ kind: 'unavailable', label: '—' });
    });
  });

  describe('maps exact zero financial metrics to available $0.00 display states', () => {
    it('maps zero positionValue to available $0.00', () => {
      const zeroValue = {
        valueUsd: 0,
        valuedAtUnixMs: Date.now(),
        source: 'test',
        basis: 'principal-token-amounts' as const,
        scope: 'returned-supported-positions' as const,
        excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
      };
      const metrics = makeFinancialMetrics({
        positionValue: zeroValue as PositionListFinancialMetricsDto['positionValue'],
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue).toEqual({ kind: 'available', valueUsd: 0, label: '$0.00' });
    });

    it('maps zero unclaimedFees to available $0.00', () => {
      const zeroFees = {
        valueUsd: 0,
        valuedAtUnixMs: Date.now(),
        source: 'test',
        basis: 'currently-claimable-trading-fees' as const,
        scope: 'returned-supported-positions' as const,
        excludes: ['rewards', 'collected-fees', 'lifetime-fees'] as const,
      };
      const metrics = makeFinancialMetrics({
        unclaimedFees: zeroFees as PositionListFinancialMetricsDto['unclaimedFees'],
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.unclaimedFees).toEqual({ kind: 'available', valueUsd: 0, label: '$0.00' });
    });
  });

  describe('formats positive financial metrics consistently in USD', () => {
    it('formats positionValue with 2 decimal places', () => {
      const metrics = makeFinancialMetrics({
        positionValue: {
          valueUsd: 1234.56,
          valuedAtUnixMs: Date.now(),
          source: 'test',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
        },
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue.label).toBe('$1,234.56');
    });

    it('formats unclaimedFees with 2 decimal places', () => {
      const metrics = makeFinancialMetrics({
        unclaimedFees: {
          valueUsd: 99.9,
          valuedAtUnixMs: Date.now(),
          source: 'test',
          basis: 'currently-claimable-trading-fees',
          scope: 'returned-supported-positions',
          excludes: ['rewards', 'collected-fees', 'lifetime-fees'] as const,
        },
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.unclaimedFees.label).toBe('$99.90');
    });
  });

  describe('fails closed when a view model receives negative or non-finite values', () => {
    it('maps negative valueUsd to unavailable', () => {
      const metrics = makeFinancialMetrics({
        positionValue: {
          valueUsd: -100,
          valuedAtUnixMs: Date.now(),
          source: 'test',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
        },
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue.kind).toBe('unavailable');
    });

    it('maps NaN to unavailable', () => {
      const metrics = makeFinancialMetrics({
        positionValue: {
          valueUsd: NaN,
          valuedAtUnixMs: Date.now(),
          source: 'test',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
        },
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue.kind).toBe('unavailable');
    });

    it('maps Infinity to unavailable', () => {
      const metrics = makeFinancialMetrics({
        positionValue: {
          valueUsd: Infinity,
          valuedAtUnixMs: Date.now(),
          source: 'test',
          basis: 'principal-token-amounts',
          scope: 'returned-supported-positions',
          excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
        },
      });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue.kind).toBe('unavailable');
    });
  });

  describe('matches pool metrics by exact pool id for shared and distinct pools', () => {
    it('reuses pool metrics for positions in the same pool', () => {
      const metrics: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-shared': {
            tvl: {
              poolId: 'pool-shared' as PoolTvlMetricDto['poolId'],
              valueUsd: 5_000_000,
              observedAtUnixMs: Date.now(),
              source: 'test',
              scope: 'whole-orca-pool',
            },
            fees24h: {
              poolId: 'pool-shared' as PoolFees24hMetricDto['poolId'],
              valueUsd: 25000,
              source: 'test',
              windowStartUnixMs: Date.now() - 86400000,
              windowEndUnixMs: Date.now(),
              scope: 'whole-orca-pool',
            },
          },
        },
      };
      const vm = buildPositionListViewModel(
        [
          makeSummaryDto({ poolId: 'pool-shared' as PositionSummaryDto['poolId'] }),
          makeSummaryDto({
            positionId: 'position-2' as PositionSummaryDto['positionId'],
            poolId: 'pool-shared' as PositionSummaryDto['poolId'],
          }),
        ],
        metrics,
      );
      expect(vm.items[0]!.poolTvl.kind).toBe('available');
      expect(vm.items[1]!.poolTvl.kind).toBe('available');
    });

    it('retains distinct pool metrics for positions in different pools', () => {
      const metrics: PositionListFinancialMetricsDto = {
        positionValue: null,
        unclaimedFees: null,
        poolsById: {
          'pool-a': {
            tvl: {
              poolId: 'pool-a' as PoolTvlMetricDto['poolId'],
              valueUsd: 1_000_000,
              observedAtUnixMs: Date.now(),
              source: 'test',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
          'pool-b': {
            tvl: {
              poolId: 'pool-b' as PoolTvlMetricDto['poolId'],
              valueUsd: 2_000_000,
              observedAtUnixMs: Date.now(),
              source: 'test',
              scope: 'whole-orca-pool',
            },
            fees24h: null,
          },
        },
      };
      const vm = buildPositionListViewModel(
        [
          makeSummaryDto({ poolId: 'pool-a' as PositionSummaryDto['poolId'] }),
          makeSummaryDto({
            positionId: 'position-2' as PositionSummaryDto['positionId'],
            poolId: 'pool-b' as PositionSummaryDto['poolId'],
          }),
        ],
        metrics,
      );
      expect(vm.items[0]!.poolTvl.kind).toBe('available');
      expect(vm.items[1]!.poolTvl.kind).toBe('available');
      if (vm.items[0]!.poolTvl.kind === 'available' && vm.items[1]!.poolTvl.kind === 'available') {
        expect(vm.items[0]!.poolTvl.valueUsd).toBe(1_000_000);
        expect(vm.items[1]!.poolTvl.valueUsd).toBe(2_000_000);
      }
    });
  });

  describe('does not compute summary metrics from pool metrics or position fields', () => {
    it('keeps null positionValue unavailable even when pool metrics are populated', () => {
      const metrics = makeFinancialMetrics({ positionValue: null });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.positionValue.kind).toBe('unavailable');
    });

    it('keeps null unclaimedFees unavailable even when pool metrics are populated', () => {
      const metrics = makeFinancialMetrics({ unclaimedFees: null });
      const vm = buildPositionListViewModel([makeSummaryDto()], metrics);
      expect(vm.unclaimedFees.kind).toBe('unavailable');
    });
  });
});
