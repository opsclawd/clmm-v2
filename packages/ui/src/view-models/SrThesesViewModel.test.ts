import { describe, it, expect } from 'vitest';
import type { SrThesesBlock, SrThesisDto } from '@clmm/application/public';
import { buildSrThesesViewModel, type SrThesesViewModel } from './SrThesesViewModel.js';

const NOW = Date.parse('2026-05-07T12:00:00Z');

function makeThesis(partial: Partial<SrThesisDto> = {}): SrThesisDto {
  return {
    asset: 'SOL/USDC',
    timeframe: '4h',
    bias: 'bullish',
    setupType: 'breakout',
    supportLevels: [],
    resistanceLevels: [],
    entryZone: null,
    targets: [],
    invalidation: null,
    trigger: null,
    chartReference: null,
    sourceHandle: 'analyst',
    sourceChannel: 'twitter',
    sourceKind: 'twitter',
    sourceReliability: 'high',
    rawThesisText: 'thesis body',
    collectedAt: null,
    publishedAt: null,
    sourceUrl: null,
    notes: null,
    ...partial,
  };
}

function makeBlock(theses: SrThesisDto[], capturedAtIso = '2026-05-07T10:00:00Z'): SrThesesBlock {
  return {
    schemaVersion: '2.0',
    source: 'openclaw',
    symbol: 'SOL/USDC',
    brief: { briefId: 'b', sourceRecordedAtIso: null, summary: 'Brief summary text.' },
    capturedAtIso,
    capturedAtUnixMs: Date.parse(capturedAtIso),
    theses,
  };
}

describe('buildSrThesesViewModel', () => {
  it('sorts theses by publishedAt descending', () => {
    const a = makeThesis({ publishedAt: '2026-05-07T01:00:00Z', sourceHandle: 'a' });
    const b = makeThesis({ publishedAt: '2026-05-07T05:00:00Z', sourceHandle: 'b' });
    const c = makeThesis({ publishedAt: '2026-05-07T03:00:00Z', sourceHandle: 'c' });
    const vm = buildSrThesesViewModel(makeBlock([a, b, c]), NOW);
    expect(vm.cards.map((card) => card.sourceHandle)).toEqual(['b', 'c', 'a']);
  });

  it('falls back to collectedAt when publishedAt is missing', () => {
    const a = makeThesis({
      publishedAt: null,
      collectedAt: '2026-05-07T01:00:00Z',
      sourceHandle: 'a',
    });
    const b = makeThesis({
      publishedAt: null,
      collectedAt: '2026-05-07T05:00:00Z',
      sourceHandle: 'b',
    });
    const vm = buildSrThesesViewModel(makeBlock([a, b]), NOW);
    expect(vm.cards.map((c) => c.sourceHandle)).toEqual(['b', 'a']);
  });

  it('falls back to block capturedAtIso when neither timestamp is present', () => {
    const a = makeThesis({ publishedAt: null, collectedAt: null, sourceHandle: 'a' });
    const b = makeThesis({ publishedAt: null, collectedAt: null, sourceHandle: 'b' });
    const vm = buildSrThesesViewModel(makeBlock([a, b], '2026-05-07T10:00:00Z'), NOW);
    expect(vm.cards).toHaveLength(2);
    // Ties allowed — key requirement is that they are NOT placed at "sort last".
    expect(vm.cards.every((c) => c.timestampLabel != null)).toBe(true);
  });

  it('places unparseable timestamps last', () => {
    const good = makeThesis({ publishedAt: '2026-05-07T05:00:00Z', sourceHandle: 'good' });
    const bad = makeThesis({
      publishedAt: 'not-a-date',
      collectedAt: 'also-bad',
      sourceHandle: 'bad',
    });
    const vm = buildSrThesesViewModel(makeBlock([bad, good]), NOW);
    expect(vm.cards[vm.cards.length - 1]!.sourceHandle).toBe('bad');
  });

  it('does not use sourceReliability for sorting', () => {
    const lowReliableNewer = makeThesis({
      publishedAt: '2026-05-07T05:00:00Z',
      sourceHandle: 'newer-low',
      sourceReliability: 'low',
    });
    const highReliableOlder = makeThesis({
      publishedAt: '2026-05-07T01:00:00Z',
      sourceHandle: 'older-high',
      sourceReliability: 'high',
    });
    const vm = buildSrThesesViewModel(makeBlock([highReliableOlder, lowReliableNewer]), NOW);
    expect(vm.cards[0]!.sourceHandle).toBe('newer-low');
  });

  it('exposes brief summary, source label, and freshness label from the block', () => {
    const vm = buildSrThesesViewModel(makeBlock([makeThesis()], '2026-05-07T11:00:00Z'), NOW);
    expect(vm.briefSummary).toBe('Brief summary text.');
    expect(vm.sourceLabel).toBe('openclaw');
    expect(vm.freshnessLabel).toContain('1h ago');
  });

  it('marks unknown bias / setupType / sourceReliability as neutral tone', () => {
    const t = makeThesis({
      bias: 'mildly-constructive-but-cautious',
      setupType: 'distribution-into-vwap',
      sourceReliability: 'tier-experimental-2026',
    });
    const vm = buildSrThesesViewModel(makeBlock([t]), NOW);
    expect(vm.cards[0]!.biasTone).toBe('neutral');
  });

  it('maps known bias values to expected tones', () => {
    const bull = buildSrThesesViewModel(makeBlock([makeThesis({ bias: 'bullish' })]), NOW);
    const bear = buildSrThesesViewModel(makeBlock([makeThesis({ bias: 'bearish' })]), NOW);
    const range = buildSrThesesViewModel(makeBlock([makeThesis({ bias: 'range' })]), NOW);
    expect(bull.cards[0]!.biasTone).toBe('safe');
    expect(bear.cards[0]!.biasTone).toBe('breach');
    expect(range.cards[0]!.biasTone).toBe('warn');
  });

  it('shows only the first 3 cards by default and reports remaining count', () => {
    const five = Array.from({ length: 5 }, (_unused, i) =>
      makeThesis({ publishedAt: `2026-05-0${i + 1}T00:00:00Z`, sourceHandle: `t${i}` }),
    );
    const vm = buildSrThesesViewModel(makeBlock(five), NOW);
    expect(vm.visibleCards).toHaveLength(3);
    expect(vm.remainingCount).toBe(2);
    expect(vm.cards).toHaveLength(5);
  });

  it('selects the most recent thesis by default', () => {
    const a = makeThesis({ publishedAt: '2026-05-07T01:00:00Z', sourceHandle: 'a' });
    const b = makeThesis({ publishedAt: '2026-05-07T05:00:00Z', sourceHandle: 'b' });
    const vm = buildSrThesesViewModel(makeBlock([a, b]), NOW);
    expect(vm.selectedThesisIndex).toBe(0);
    expect(vm.selectedCard.sourceHandle).toBe('b');
  });

  it('marks raw thesis text collapsed by default', () => {
    const vm = buildSrThesesViewModel(makeBlock([makeThesis({ rawThesisText: 'long body' })]), NOW);
    expect(vm.cards[0]!.rawThesisCollapsedByDefault).toBe(true);
  });

  it('derives an overlay model that uses only the selected thesis', () => {
    const a = makeThesis({
      publishedAt: '2026-05-07T05:00:00Z',
      supportLevels: ['132', '128'],
      resistanceLevels: ['148', '152'],
      targets: ['148', '152'],
      invalidation: '128',
      entryZone: '135-138',
    });
    const b = makeThesis({
      publishedAt: '2026-05-07T01:00:00Z',
      supportLevels: ['200'],
      resistanceLevels: ['210'],
      targets: ['210'],
      invalidation: '195',
      entryZone: '205',
    });
    const vm = buildSrThesesViewModel(makeBlock([a, b]), NOW);
    expect(vm.overlay.supports).toEqual([132, 128]);
    expect(vm.overlay.resistances).toEqual([148, 152]);
    expect(vm.overlay.targets).toEqual([148, 152]);
    expect(vm.overlay.invalidation).toEqual({ kind: 'numeric', value: 128, raw: '128' });
    expect(vm.overlay.entryZone).toEqual({ kind: 'range', low: 135, high: 138, raw: '135-138' });
  });

  it('includes only parseable strings in numeric overlay coordinates', () => {
    const t = makeThesis({
      supportLevels: ['132', 'breakout-shelf', '128'],
      resistanceLevels: ['n/a'],
      targets: ['148', 'open-ended'],
      invalidation: 'discretion',
      entryZone: 'on flush',
    });
    const vm: SrThesesViewModel = buildSrThesesViewModel(makeBlock([t]), NOW);
    expect(vm.overlay.supports).toEqual([132, 128]);
    expect(vm.overlay.resistances).toEqual([]);
    expect(vm.overlay.targets).toEqual([148]);
    expect(vm.overlay.invalidation).toEqual({ kind: 'text', raw: 'discretion' });
    expect(vm.overlay.entryZone).toEqual({ kind: 'text', raw: 'on flush' });
  });
});
