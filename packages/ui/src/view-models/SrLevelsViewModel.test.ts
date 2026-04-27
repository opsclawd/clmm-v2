import { describe, expect, it } from 'vitest';
import type { SrLevelsBlock } from '@clmm/application/public';
import { buildSrLevelsViewModelBlock } from './SrLevelsViewModel.js';

function makeBlock(overrides: Partial<SrLevelsBlock> = {}): SrLevelsBlock {
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

describe('buildSrLevelsViewModelBlock', () => {
  it('produces groups when given a populated block', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ capturedAtUnixMs: 1_700_000 }),
      1_700_000 + 5 * 60_000,
    );

    expect(vm.groups.length).toBeGreaterThan(0);
  });

  it('renders fresh freshness label when the block is recent', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ capturedAtUnixMs: 1_700_000 }),
      1_700_000 + 5 * 60_000,
    );

    expect(vm.freshnessLabel).toBe('AI · MCO · 5m ago');
    expect(vm.isStale).toBe(false);
  });

  it('marks the block stale when older than 48 hours', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 49 * 3_600_000;
    const vm = buildSrLevelsViewModelBlock(makeBlock({ capturedAtUnixMs: captured }), now);

    expect(vm.isStale).toBe(true);
    expect(vm.freshnessLabel).toContain('stale');
  });

  it('parses metadata from the `notes` field of the first level in a group', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({
        supports: [{ price: 90, notes: 'mco 1h, bullish.swing | trigger: above 95' }],
        resistances: [],
      }),
      1_700_000_000,
    );

    const group = vm.groups[0]!;
    expect(group.source).toBe('mco');
    expect(group.timeframe).toBe('1h');
    expect(group.bias).toBe('bullish');
    expect(group.setupType).toBe('swing');
    expect(group.trigger).toBe('above 95');
  });

  it('groups levels with identical metadata together', () => {
    const sharedNotes = 'mco 1h, neutral.range';
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({
        supports: [
          { price: 90, notes: sharedNotes },
          { price: 88, notes: sharedNotes },
        ],
        resistances: [],
      }),
      1_700_000_000,
    );

    expect(vm.groups.length).toBe(1);
    expect(vm.groups[0]!.levels.length).toBe(2);
  });

  it('separates levels with different metadata into different groups', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({
        supports: [{ price: 90, notes: 'mco 1h, neutral.range' }],
        resistances: [{ price: 150, notes: 'mco 4h, bearish.trend' }],
      }),
      1_700_000_000,
    );

    expect(vm.groups.length).toBe(2);
  });

  it('assigns breach tone to resistance levels and safe tone to support levels', () => {
    const vmResistance = buildSrLevelsViewModelBlock(
      makeBlock({ supports: [], resistances: [{ price: 150 }] }),
      1_700_000_000,
    );
    expect(vmResistance.groups[0]!.levels[0]!.tone).toBe('breach');

    const vmSupport = buildSrLevelsViewModelBlock(
      makeBlock({ supports: [{ price: 90 }], resistances: [] }),
      1_700_000_000,
    );
    expect(vmSupport.groups[0]!.levels[0]!.tone).toBe('safe');
  });

  it('surfaces the block summary when present', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ summary: 'Bearish swing, trend continuation.' }),
      1_700_000_000,
    );
    expect(vm.summary).toBe('Bearish swing, trend continuation.');
  });

  it('renders price labels with two decimal places', () => {
    const vm = buildSrLevelsViewModelBlock(
      makeBlock({ supports: [{ price: 80 }], resistances: [{ price: 130 }] }),
      1_700_000_000,
    );

    const allLabels = vm.groups.flatMap((g) => g.levels.map((l) => l.priceLabel));
    expect(allLabels).toContain('$130.00');
    expect(allLabels).toContain('$80.00');
  });
});