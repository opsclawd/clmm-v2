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
    expect(vm.srLevels!.levels.length).toBeGreaterThan(0);
  });

  it('computes freshness for 5 minutes ago', () => {
    const now = 2_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 1_700_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 5m ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('computes freshness for 3 hours ago', () => {
    const now = 20_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 9_200_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 3h ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('computes freshness for 49 hours ago (stale)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: 23_600_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 49h ago · stale');
    expect(vm.srLevels?.isStale).toBe(true);
  });

  it('sorts all levels ascending by price', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 130 }, { price: 90 }],
          resistances: [{ price: 180 }, { price: 210 }],
        }),
      }),
      now,
    );
    const prices = vm.srLevels!.levels.map((l) => l.priceLabel);
    expect(prices).toEqual(['$90.00', '$130.00', '$180.00', '$210.00']);
  });

  it('assigns support and resistance kinds correctly', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110 }],
          resistances: [{ price: 190 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.kind).toBe('support');
    expect(vm.srLevels!.levels[1]!.kind).toBe('resistance');
  });

  it('uses DTO notes when available', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110, notes: 'Primary · 30d pivot' }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('Primary · 30d pivot');
  });

  it('falls back to range-bound note for lower bound match', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 110,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('Range lower · your position');
  });

  it('falls back to range-bound note for upper bound match', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 190,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 190 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('Range upper · your position');
  });

  it('falls back to rank label when no notes or bound match', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 110, rank: 'S1' }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.note).toBe('S1');
  });

  it('marks breached resistance as breach tone when price is above it', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 220,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 210 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('breach');
  });

  it('marks unbreached resistance near upper bound as warn tone', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 200 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('warn');
  });

  it('marks distant safe resistance as safe tone', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 500 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('safe');
  });

  it('marks breached support as breach tone when price is below it', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 80,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 90 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('breach');
  });

  it('marks unbreached support near lower bound as warn tone', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 100 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('warn');
  });

  it('marks distant safe support as safe tone', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 10 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('safe');
  });

  it('marks level as warn when within 5% proximity of current price', () => {
    const now = 200_000_000;
    // currentPrice 150, resistance at 155 = 3.3% above -> warn
    const vm = buildPositionDetailViewModel(
      makeDto({
        currentPrice: 150,
        lowerBound: 100,
        upperBound: 200,
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 155 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.levels[0]!.tone).toBe('warn');
  });

  it('floors freshness at 1 minute for sub-minute age', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: now - 30_000 }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 1m ago');
    expect(vm.srLevels?.isStale).toBe(false);
  });

  it('marks stale at exactly 48h boundary', () => {
    const ms48h = 172_800_000;
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({ srLevels: makeSrBlock({ capturedAtUnixMs: now - ms48h }) }),
      now,
    );
    expect(vm.srLevels?.freshnessLabel).toBe('AI · MCO · 48h ago · stale');
    expect(vm.srLevels?.isStale).toBe(true);
  });
});
