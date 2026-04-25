import { describe, it, expect } from 'vitest';
import { buildPositionDetailViewModel } from './PositionDetailViewModel.js';
import type { PositionDetailDto } from '@clmm/application/public';

function makeDto(overrides: Partial<PositionDetailDto> = {}): PositionDetailDto {
  return {
    positionId: 'pos-1' as PositionDetailDto['positionId'],
    poolId: 'pool-1' as PositionDetailDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 142.35,
    currentPriceLabel: 'USDC 142.35',
    feeRateLabel: '10 bps',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    lowerBound: 100,
    upperBound: 200,
    lowerBoundLabel: 'USDC 1.01',
    upperBoundLabel: 'USDC 1.22',
    sqrtPrice: '184467440737095516',
    unclaimedFees: {
      feeOwedA: { raw: '120000000', decimals: 9, symbol: 'SOL', usdValue: 18 },
      feeOwedB: { raw: '47230000', decimals: 6, symbol: 'USDC', usdValue: 47.23 },
      totalUsd: 65.23,
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

function makeSrBlock(overrides: Partial<NonNullable<PositionDetailDto['srLevels']>> = {}): NonNullable<PositionDetailDto['srLevels']> {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: null,
    summary: null,
    capturedAtUnixMs: 1_000_000_000,
    supports: [{ price: 90 }, { price: 110 }],
    resistances: [{ price: 180 }, { price: 210 }],
    ...overrides,
  };
}

describe('buildPositionDetailViewModel srLevels', () => {
  it('returns srLevels undefined when dto has no srLevels', () => {
    const vm = buildPositionDetailViewModel(makeDto(), Date.now());
    expect(vm.srLevels).toBeUndefined();
  });

  it('returns a populated srLevels block when dto.srLevels is present', () => {
    const now = 2_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 1_700_000 }) }),
      now,
    );
    expect(vm.srLevels).toBeDefined();
  });

  it('computes freshness for 5 minutes ago', () => {
    const now = 2_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 1_700_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('captured 5m ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('computes freshness for 3 hours ago', () => {
    const now = 20_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 9_200_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('captured 3h ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('computes freshness for 47 hours ago', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 30_800_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('captured 47h ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('computes freshness for 49 hours ago (stale)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 23_600_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('captured 49h ago · stale');
    expect(vm.srLevels?.isStale).toBe(true);
  });

  it('marks stale at exactly 48h boundary', () => {
    const ms48h = 172_800_000;
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: now - ms48h }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('captured 48h ago · stale');
    expect(vm.srLevels?.isStale).toBe(true);
  });

  it('floors at 1 minute for 30 seconds ago', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: now - 30_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('captured 1m ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('sorts supports ascending by price', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 130 }, { price: 90 }, { price: 110 }],
          resistances: [],
        }),
      }),
      now,
    );
    const prices = vm.srLevels!.supportsSorted.map((s) => s.priceLabel);
    expect(prices).toEqual(['$90.00', '$110.00', '$130.00']);
  });

  it('sorts resistances ascending by price', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 250 }, { price: 180 }, { price: 210 }],
        }),
      }),
      now,
    );
    const prices = vm.srLevels!.resistancesSorted.map((r) => r.priceLabel);
    expect(prices).toEqual(['$180.00', '$210.00', '$250.00']);
  });

  it('includes rankLabel when rank is present', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 90, rank: 'S1' }],
          resistances: [{ price: 210, rank: 'R1' }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.supportsSorted[0]?.rankLabel).toBe('S1');
    expect(vm.srLevels!.resistancesSorted[0]?.rankLabel).toBe('R1');
  });
});
