import { describe, expect, it } from 'vitest';
import type { PositionDetailDto } from '@clmm/application/public';
import { buildPositionDetailViewModel } from './PositionDetailViewModel.js';

function makeDto(overrides: Partial<PositionDetailDto> = {}): PositionDetailDto {
  return {
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
    lowerBound: 100,
    upperBound: 200,
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
    expect(vm.srLevels!.groups.length).toBeGreaterThan(0);
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

  it('parses real notes format with trigger and invalidation', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{
            price: 90,
            notes: 'morecryptoonline swing, bearish. trend continuation | Trigger: break below 85 signals wave three down is underway | Invalidation: break above 88.30, shifting probabilities toward orange C-wave scenario | Support parsed from: "79–81 (blue zone)" | Raw support: 83 (Sunday low), 79–81 (blue zone)',
          }],
          resistances: [],
        }),
      }),
      now,
    );
    const group = vm.srLevels!.groups[0]!;
    expect(group.source).toBe('morecryptoonline');
    expect(group.timeframe).toBe('swing');
    expect(group.bias).toBe('bearish');
    expect(group.setupType).toBe('trend continuation');
    expect(group.trigger).toBe('break below 85 signals wave three down is underway');
    expect(group.invalidation).toBe('break above 88.30, shifting probabilities toward orange C-wave scenario');
    expect(group.note).toContain('Support parsed from:');
    expect(group.note).toContain('Raw support:');
  });

  it('returns raw notes when no pipe separator', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 90, notes: 'Primary support zone' }],
          resistances: [],
        }),
      }),
      now,
    );
    const group = vm.srLevels!.groups[0]!;
    expect(group.note).toBe('Primary support zone');
    expect(group.source).toBeUndefined();
  });

  it('groups levels with identical metadata', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [
            { price: 90, rank: 'S1', notes: 'source, 1h, Bullish. test | note body' },
            { price: 110, rank: 'S1', notes: 'source, 1h, Bullish. test | note body' },
          ],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups.length).toBe(1);
    expect(vm.srLevels!.groups[0]!.levels.length).toBe(2);
  });

  it('creates separate groups for different metadata', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [
            { price: 90, rank: 'S1', notes: 'note A' },
            { price: 110, rank: 'S2', notes: 'note B' },
          ],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups.length).toBe(2);
  });

  it('marks resistance as breach tone (red)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [],
          resistances: [{ price: 180 }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups[0]!.levels[0]!.tone).toBe('breach');
  });

  it('marks support as safe tone (green)', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 90 }],
          resistances: [],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups[0]!.levels[0]!.tone).toBe('safe');
  });

  it('passes summary through to view-model', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          summary: 'Bearish swing, trend continuation.',
        }),
      }),
      now,
    );
    expect(vm.srLevels!.summary).toBe('Bearish swing, trend continuation.');
  });

  it('sorts groups by lowest price ascending', () => {
    const now = 200_000_000;
    const vm = buildPositionDetailViewModel(
      makeDto({
        srLevels: makeSrBlock({
          capturedAtUnixMs: now,
          supports: [{ price: 130, notes: 'high' }],
          resistances: [{ price: 80, notes: 'low' }],
        }),
      }),
      now,
    );
    expect(vm.srLevels!.groups[0]!.levels[0]!.priceLabel).toBe('$80.00');
    expect(vm.srLevels!.groups[1]!.levels[0]!.priceLabel).toBe('$130.00');
  });
});
