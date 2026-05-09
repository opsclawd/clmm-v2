import { describe, expect, it } from 'vitest';
import type { RegimeBlock } from '@clmm/application/public';
import { buildRegimeViewModelBlock, formatCandleClockTime } from './RegimeViewModel.js';

const GENERATED = 1_700_000_000_000;
const LAST_CANDLE_CLOSE = GENERATED;
const LAST_CANDLE_OPEN = GENERATED - 60 * 60_000;
const AGE_SECONDS = 0;

function makeBlock(
  overrides: Omit<Partial<RegimeBlock>, 'freshness'> & {
    freshness?: Partial<RegimeBlock['freshness']>;
  } = {},
): RegimeBlock {
  const { freshness: freshOverride, ...rest } = overrides;
  const baseFreshness: RegimeBlock['freshness'] = {
    generatedAtUnixMs: GENERATED,
    generatedAtIso: new Date(GENERATED).toISOString(),
    lastCandleOpenUnixMs: LAST_CANDLE_OPEN,
    lastCandleOpenIso: new Date(LAST_CANDLE_OPEN).toISOString(),
    lastCandleCloseUnixMs: LAST_CANDLE_CLOSE,
    lastCandleCloseIso: new Date(LAST_CANDLE_CLOSE).toISOString(),
    ageSeconds: AGE_SECONDS,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  };
  return {
    regime: 'CHOP',
    telemetry: {
      realizedVolShort: 0.007,
      realizedVolLong: 0.0107,
      volRatio: 1.06,
      trendStrength: 0.00018,
      compression: 0.0092,
    },
    clmmSuitability: { status: 'CAUTION', reasons: [] },
    marketReasons: [],
    freshness: { ...baseFreshness, ...freshOverride },
    metadata: {
      source: 'geckoterminal',
      network: 'solana',
      symbol: 'SOL/USDC',
      timeframe: '1h',
    },
    ...rest,
  };
}

describe('buildRegimeViewModelBlock — data quality', () => {
  it('classifies Fresh when neither flag is set', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED + 60_000);
    expect(vm.dataQualityLabel).toMatch(/fresh/i);
    expect(vm.dataQualityTone).toBe('success');
  });

  it('classifies Soft-stale when softStale is true and hardStale is false', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 80 * 60,
          softStale: true,
          hardStale: false,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/soft-?stale/i);
    expect(vm.dataQualityTone).toBe('warning');
  });

  it('classifies Hard-stale when hardStale is true (regardless of softStale)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 95 * 60,
          softStale: true,
          hardStale: true,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/hard-?stale/i);
    expect(vm.dataQualityTone).toBe('danger');
  });

  it('classifies Hard-stale when only hardStale is true (false softStale ignored)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 95 * 60,
          softStale: false,
          hardStale: true,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/hard-?stale/i);
    expect(vm.dataQualityTone).toBe('danger');
  });

  it('does NOT mark stale based on local 48h rule when upstream flags are false', () => {
    const old = GENERATED - 49 * 3_600_000;
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: old,
          generatedAtIso: new Date(old).toISOString(),
          lastCandleOpenUnixMs: old - 60 * 60_000,
          lastCandleOpenIso: new Date(old - 60 * 60_000).toISOString(),
          lastCandleCloseUnixMs: old,
          lastCandleCloseIso: new Date(old).toISOString(),
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
        },
      }),
      GENERATED,
    );
    expect(vm.dataQualityTone).toBe('success');
  });
});

describe('buildRegimeViewModelBlock — labels', () => {
  it('uses the spec suitability copy (CAUTION)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'CAUTION', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM caution');
  });

  it('uses the spec suitability copy (ALLOWED)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'ALLOWED', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM suitable');
  });

  it('uses the spec suitability copy (BLOCKED)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'BLOCKED', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM not recommended');
  });

  it('uses the spec suitability copy (UNKNOWN)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'UNKNOWN', reasons: [] } }),
      GENERATED,
    );
    expect(vm.suitabilityLabel).toBe('CLMM suitability unknown');
  });

  it('renders source label from metadata.source (no MCO fallback)', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.sourceLabel).toBe('GeckoTerminal · SOL/USDC · 1h');
  });

  it('formats generatedAge using elapsed time', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED + 12 * 60_000);
    expect(vm.generatedAgeLabel).toBe('Generated 12m ago');
  });

  it('formats latestCandleAge from upstream ageSeconds plus elapsed since generatedAt', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 87 * 60,
          softStale: false,
          hardStale: false,
        },
      }),
      GENERATED,
    );
    expect(vm.latestCandleAgeLabel).toBe('Latest closed candle is 87m old');
  });

  it('advances candle age by elapsed-since-generatedAt', () => {
    const generatedAt = GENERATED - 2 * 3_600_000;
    const block = makeBlock({
      freshness: {
        generatedAtUnixMs: generatedAt,
        generatedAtIso: new Date(generatedAt).toISOString(),
        lastCandleOpenUnixMs: generatedAt - 60 * 60_000,
        lastCandleOpenIso: new Date(generatedAt - 60 * 60_000).toISOString(),
        lastCandleCloseUnixMs: generatedAt,
        lastCandleCloseIso: new Date(generatedAt).toISOString(),
        ageSeconds: 30 * 60,
        softStale: true,
        hardStale: false,
      },
    });
    const vm = buildRegimeViewModelBlock(block, GENERATED);
    expect(vm.latestCandleAgeLabel).toBe('Latest closed candle is 150m old');
  });

  it('renders compact telemetry with qualitative trend label and vol ratio', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.compactTelemetryLabel).toBe('Trend flat · Vol ratio 1.06x');
  });

  it('does not render Trend strength as a 0–1 ratio in any label', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.compactTelemetryLabel).not.toContain('/ 1.00');
    expect(vm.expandedTelemetryRows.find((r) => r.label === 'Trend strength')?.value).not.toContain(
      '/ 1.00',
    );
  });
});

describe('buildRegimeViewModelBlock — display reasons', () => {
  it('sorts reasons by severity ERROR > WARN > INFO', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'INFO', text: 'Momentum positive' },
          { severity: 'ERROR', text: 'Candle gap detected' },
          { severity: 'WARN', text: 'Elevated volatility' },
        ],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.map((r) => r.text)).toEqual([
      'Candle gap detected',
      'Elevated volatility',
      'Momentum positive',
    ]);
  });

  it('uses source order as a tie-breaker within the same severity', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'WARN', text: 'First warn' },
          { severity: 'WARN', text: 'Second warn' },
        ],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.map((r) => r.text)).toEqual(['First warn', 'Second warn']);
  });

  it('dedupes by code when present', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [{ severity: 'WARN', text: 'A', code: 'X' }],
        },
        marketReasons: [{ severity: 'WARN', text: 'B', code: 'X' }],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.length).toBe(1);
  });

  it('dedupes by normalized text when code is absent', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [{ severity: 'WARN', text: 'Elevated  Volatility' }],
        },
        marketReasons: [{ severity: 'WARN', text: 'elevated volatility' }],
      }),
      GENERATED,
    );
    expect(vm.displayReasons.length).toBe(1);
  });

  it('collapses any code containing STALE or text containing stale into one freshness reason', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [{ severity: 'WARN', text: 'Data is soft-stale', code: 'DATA_SOFT_STALE' }],
        },
        marketReasons: [
          { severity: 'WARN', text: 'Stale signals due to old candles' },
          { severity: 'WARN', text: 'Latest candle is past hard-stale threshold' },
        ],
      }),
      GENERATED,
    );
    const stale = vm.displayReasons.filter((r) => /stale/i.test(r.text));
    expect(stale.length).toBe(1);
  });

  it('exposes exactly one primaryDisplayReason', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'INFO', text: 'Momentum positive' },
          { severity: 'WARN', text: 'Elevated volatility' },
        ],
      }),
      GENERATED,
    );
    expect(vm.primaryDisplayReason?.text).toBe('Elevated volatility');
  });

  it('returns null primaryDisplayReason when no reasons exist', () => {
    const vm = buildRegimeViewModelBlock(makeBlock({ marketReasons: [] }), GENERATED);
    expect(vm.primaryDisplayReason).toBeNull();
  });
});

describe('buildRegimeViewModelBlock — expanded rows', () => {
  it('expandedTelemetryRows includes all five telemetry numbers', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    const labels = vm.expandedTelemetryRows.map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Trend strength',
        'Realized vol short',
        'Realized vol long',
        'Volatility ratio',
        'Compression',
      ]),
    );
  });

  it('expandedSampleRows includes samples and provenance', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        metadata: {
          source: 'geckoterminal',
          network: 'solana',
          symbol: 'SOL/USDC',
          timeframe: '1h',
          sourceTimeframe: '15m',
          sourceCandleCount: 346,
          candleCount: 86,
          derivedTimeframe: '1h',
          aggregationVersion: 'ohlcv-agg-v1',
        },
      }),
      GENERATED,
    );
    const sampleRows = vm.expandedSampleRows.map((r) => r.label);
    expect(sampleRows).toEqual(
      expect.arrayContaining(['Samples', 'Source candles', 'Derived timeframe', 'Aggregation']),
    );
  });

  it('expandedFreshnessRows includes both thresholds and the latest-candle clock', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    const labels = vm.expandedFreshnessRows.map((r) => r.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Latest candle open',
        'Latest candle close',
        'Latest closed candle age',
        'Soft stale threshold',
        'Hard stale threshold',
      ]),
    );
  });

  it('expandedFreshnessRows computes candle age from display-age formula, not local clock', () => {
    const generatedAt = GENERATED - 2 * 3_600_000;
    const block = makeBlock({
      freshness: {
        generatedAtUnixMs: generatedAt,
        generatedAtIso: new Date(generatedAt).toISOString(),
        lastCandleOpenUnixMs: generatedAt - 60 * 60_000,
        lastCandleOpenIso: new Date(generatedAt - 60 * 60_000).toISOString(),
        lastCandleCloseUnixMs: generatedAt,
        lastCandleCloseIso: new Date(generatedAt).toISOString(),
        ageSeconds: 30 * 60,
        softStale: true,
        hardStale: false,
      },
    });
    const vm = buildRegimeViewModelBlock(block, GENERATED);
    const candleRow = vm.expandedFreshnessRows.find((r) => r.label === 'Latest closed candle age');
    expect(candleRow?.value).toBe('150m old');
  });

  it('renders soft stale threshold as exact minutes (75m, not 1h)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 4500,
          hardStaleSeconds: 5400,
        },
      }),
      GENERATED,
    );
    const soft = vm.expandedFreshnessRows.find((r) => r.label === 'Soft stale threshold');
    expect(soft?.value).toBe('75m');
  });

  it('renders hard stale threshold as exact minutes (90m, not 2h)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 4500,
          hardStaleSeconds: 5400,
        },
      }),
      GENERATED,
    );
    const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
    expect(hard?.value).toBe('90m');
  });

  it('renders 7200s as 120m (not 2h) for the hard stale threshold', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 4500,
          hardStaleSeconds: 7200,
        },
      }),
      GENERATED,
    );
    const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
    expect(hard?.value).toBe('120m');
  });

  it('renders 9000s as 150m (not 3h) for the hard stale threshold', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 4500,
          hardStaleSeconds: 9000,
        },
      }),
      GENERATED,
    );
    const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
    expect(hard?.value).toBe('150m');
  });

  it('rounds threshold seconds with Math.round at the minute boundary', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 4529,
          hardStaleSeconds: 4531,
        },
      }),
      GENERATED,
    );
    const soft = vm.expandedFreshnessRows.find((r) => r.label === 'Soft stale threshold');
    const hard = vm.expandedFreshnessRows.find((r) => r.label === 'Hard stale threshold');
    expect(soft?.value).toBe('75m');
    expect(hard?.value).toBe('76m');
  });

  it('expanded freshness rows expose open, close, and close-age (no "Latest candle" row)', () => {
    const open = Date.parse('2026-05-09T01:00:00Z');
    const close = Date.parse('2026-05-09T02:00:00Z');
    const generated = Date.parse('2026-05-09T02:48:00Z');
    const block = makeBlock({
      freshness: {
        generatedAtUnixMs: generated,
        generatedAtIso: '2026-05-09T02:48:00Z',
        lastCandleOpenUnixMs: open,
        lastCandleOpenIso: '2026-05-09T01:00:00Z',
        lastCandleCloseUnixMs: close,
        lastCandleCloseIso: '2026-05-09T02:00:00Z',
        ageSeconds: 48 * 60,
        softStale: false,
        hardStale: false,
      },
    });
    const vm = buildRegimeViewModelBlock(block, generated, {
      locale: 'en-US',
      timeZone: 'UTC',
    });
    expect(vm.expandedFreshnessRows.map((r) => r.label)).toEqual([
      'Latest candle open',
      'Latest candle close',
      'Latest closed candle age',
      'Soft stale threshold',
      'Hard stale threshold',
    ]);
    expect(vm.expandedFreshnessRows[0]?.value).toBe('01:00');
    expect(vm.expandedFreshnessRows[1]?.value).toBe('02:00');
    expect(vm.expandedFreshnessRows[2]?.value).toBe('48m old');
  });
});

describe('formatCandleClockTime', () => {
  const NOON_UTC = Date.parse('2026-05-09T12:00:00Z');

  it('formats same-day timestamps as HH:MM in 24-hour format', () => {
    expect(
      formatCandleClockTime(Date.parse('2026-05-09T02:00:00Z'), NOON_UTC, {
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    ).toBe('02:00');
  });

  it('formats different-day timestamps with a date prefix', () => {
    const open = Date.parse('2026-05-08T23:00:00Z');
    const close = Date.parse('2026-05-09T00:00:00Z');
    const now = Date.parse('2026-05-09T00:30:00Z');
    expect(formatCandleClockTime(open, now, { locale: 'en-US', timeZone: 'UTC' })).toBe(
      'May 8, 23:00',
    );
    expect(formatCandleClockTime(close, now, { locale: 'en-US', timeZone: 'UTC' })).toBe('00:00');
  });

  it('respects the injected timeZone for "today" comparison', () => {
    const earlyAm = Date.parse('2026-05-09T09:30:00Z');
    const later = Date.parse('2026-05-09T13:00:00Z');
    expect(
      formatCandleClockTime(earlyAm, later, { locale: 'en-US', timeZone: 'America/Los_Angeles' }),
    ).toBe('02:30');
  });
});
