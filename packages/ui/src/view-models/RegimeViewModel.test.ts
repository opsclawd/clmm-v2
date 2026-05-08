import { describe, expect, it } from 'vitest';
import type { RegimeBlock } from '@clmm/application/public';
import { buildRegimeViewModelBlock } from './RegimeViewModel.js';

const GENERATED = 1_700_000_000_000;
const LAST_CANDLE = GENERATED - 87 * 60_000;

function makeBlock(overrides: Partial<RegimeBlock> = {}): RegimeBlock {
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
    freshness: {
      generatedAtUnixMs: GENERATED,
      lastCandleUnixMs: LAST_CANDLE,
      ageSeconds: 87 * 60,
      softStale: true,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
    metadata: {
      source: 'geckoterminal',
      network: 'solana',
      symbol: 'SOL/USDC',
      timeframe: '1h',
    },
    ...overrides,
  };
}

describe('buildRegimeViewModelBlock — data quality', () => {
  it('classifies Fresh when neither flag is set', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED,
          lastCandleUnixMs: LAST_CANDLE,
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/fresh/i);
    expect(vm.dataQualityTone).toBe('success');
  });

  it('classifies Soft-stale when softStale is true and hardStale is false', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED + 60_000);
    expect(vm.dataQualityLabel).toMatch(/soft-?stale/i);
    expect(vm.dataQualityTone).toBe('warning');
  });

  it('classifies Hard-stale when hardStale is true (regardless of softStale)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED,
          lastCandleUnixMs: LAST_CANDLE,
          ageSeconds: 95 * 60,
          softStale: true,
          hardStale: true,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
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
          generatedAtUnixMs: GENERATED,
          lastCandleUnixMs: LAST_CANDLE,
          ageSeconds: 95 * 60,
          softStale: false,
          hardStale: true,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
        },
      }),
      GENERATED + 60_000,
    );
    expect(vm.dataQualityLabel).toMatch(/hard-?stale/i);
    expect(vm.dataQualityTone).toBe('danger');
  });

  it('does NOT mark stale based on local 48h rule when upstream flags are false', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        freshness: {
          generatedAtUnixMs: GENERATED - 49 * 3_600_000,
          lastCandleUnixMs: GENERATED - 49 * 3_600_000 - 60_000,
          ageSeconds: 60,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 75 * 60,
          hardStaleSeconds: 90 * 60,
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

  it('formats latestCandleAge from ageSeconds', () => {
    const vm = buildRegimeViewModelBlock(makeBlock(), GENERATED);
    expect(vm.latestCandleAgeLabel).toBe('Latest candle is 87m old');
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
      expect.arrayContaining(['Latest candle', 'Soft stale threshold', 'Hard stale threshold']),
    );
  });
});
