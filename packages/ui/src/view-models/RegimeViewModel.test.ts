import { describe, expect, it } from 'vitest';
import type { RegimeBlock } from '@clmm/application/public';
import { buildRegimeViewModelBlock } from './RegimeViewModel.js';

function makeBlock(overrides: Partial<RegimeBlock> = {}): RegimeBlock {
  return {
    regime: 'UP',
    trendStrength: 0.75,
    volRatio: 1.2,
    clmmSuitability: {
      status: 'ALLOWED',
      reasons: [],
    },
    marketReasons: [],
    freshness: {
      capturedAtUnixMs: 1_700_000_000_000,
      softStale: false,
      hardStale: false,
    },
    ...overrides,
  };
}

describe('buildRegimeViewModelBlock', () => {
  it('maps UP regime to ▲ Uptrend with trend and vol labels', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ regime: 'UP', trendStrength: 0.65, volRatio: 1.1 }),
      1_700_000_000_000 + 5 * 60_000,
    );

    expect(vm.regimeLabel).toBe('▲ Uptrend');
    expect(vm.trendLabel).toBe('Trend: 0.65');
    expect(vm.volLabel).toBe('Vol: 1.10');
  });

  it('maps DOWN regime to ▼ Downtrend', () => {
    const vm = buildRegimeViewModelBlock(makeBlock({ regime: 'DOWN' }), 1_700_000_000_000);

    expect(vm.regimeLabel).toBe('▼ Downtrend');
  });

  it('maps CHOP regime to ◆ Choppy', () => {
    const vm = buildRegimeViewModelBlock(makeBlock({ regime: 'CHOP' }), 1_700_000_000_000);

    expect(vm.regimeLabel).toBe('◆ Choppy');
  });

  it('maps ALLOWED suitability to ✓ Suitable for CLMM', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'ALLOWED', reasons: [] } }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityLabel).toBe('✓ Suitable for CLMM');
  });

  it('maps CAUTION suitability to ⚠ Caution', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'CAUTION', reasons: [] } }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityLabel).toBe('⚠ Caution');
  });

  it('maps BLOCKED suitability to ✗ Not recommended', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'BLOCKED', reasons: [] } }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityLabel).toBe('✗ Not recommended');
  });

  it('maps UNKNOWN suitability to ? Unknown', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'UNKNOWN', reasons: [] } }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityLabel).toBe('? Unknown');
  });

  it('shows only the top market reason by severity', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'WARN', text: 'High volatility' },
          { severity: 'INFO', text: 'Trend weakening' },
        ],
      }),
      1_700_000_000_000,
    );

    expect(vm.marketReasonSummary).toBe('High volatility');
  });

  it('picks the top market reason by severity (ERROR before WARN before INFO)', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        marketReasons: [
          { severity: 'INFO', text: 'Momentum positive' },
          { severity: 'ERROR', text: 'Candle gap detected' },
          { severity: 'WARN', text: 'High volatility' },
        ],
      }),
      1_700_000_000_000,
    );

    expect(vm.marketReasonSummary).toBe('Candle gap detected');
  });

  it('returns em dash for empty market reasons', () => {
    const vm = buildRegimeViewModelBlock(makeBlock({ marketReasons: [] }), 1_700_000_000_000);

    expect(vm.marketReasonSummary).toBe('—');
  });

  it('renders freshness label with minutes for a fresh block', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 5 * 60_000;
    const vm = buildRegimeViewModelBlock(
      makeBlock({ freshness: { capturedAtUnixMs: captured, softStale: false, hardStale: false } }),
      now,
    );

    expect(vm.freshnessLabel).toBe('MCO · 5m ago');
    expect(vm.isStale).toBe(false);
  });

  it('marks stale when captured more than 48 hours ago', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 49 * 3_600_000;
    const vm = buildRegimeViewModelBlock(
      makeBlock({ freshness: { capturedAtUnixMs: captured, softStale: true, hardStale: false } }),
      now,
    );

    expect(vm.isStale).toBe(true);
    expect(vm.freshnessLabel).toContain('stale');
  });

  it('uses metadata source in freshness label when present', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 10 * 60_000;
    const vm = buildRegimeViewModelBlock(makeBlock({ metadata: { source: 'MCO-v2' } }), now);

    expect(vm.freshnessLabel).toBe('MCO-v2 · 10m ago');
  });

  it('passes through suitability status', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'CAUTION', reasons: [] } }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityStatus).toBe('CAUTION');
  });

  it('marks stale when upstream hardStale is true regardless of age', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 5 * 60_000;
    const vm = buildRegimeViewModelBlock(
      makeBlock({ freshness: { capturedAtUnixMs: captured, softStale: true, hardStale: true } }),
      now,
    );

    expect(vm.isStale).toBe(true);
    expect(vm.freshnessLabel).toContain('stale');
  });

  it('does not mark stale when upstream softStale is true but hardStale is false and age is recent', () => {
    const captured = 1_700_000_000_000;
    const now = captured + 5 * 60_000;
    const vm = buildRegimeViewModelBlock(
      makeBlock({ freshness: { capturedAtUnixMs: captured, softStale: true, hardStale: false } }),
      now,
    );

    expect(vm.isStale).toBe(false);
  });

  it('shows top severity suitability reason when CAUTION', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'CAUTION',
          reasons: [
            { severity: 'INFO', text: 'Trend is still forming' },
            { severity: 'WARN', text: 'Elevated volatility' },
          ],
        },
      }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityLabel).toBe('⚠ Caution');
    expect(vm.suitabilityReason).toBe('Elevated volatility');
  });

  it('shows top severity suitability reason when BLOCKED', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'BLOCKED',
          reasons: [{ severity: 'ERROR', text: 'Extreme market dislocation' }],
        },
      }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityReason).toBe('Extreme market dislocation');
  });

  it('returns null suitabilityReason for ALLOWED status', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({
        clmmSuitability: {
          status: 'ALLOWED',
          reasons: [{ severity: 'INFO', text: 'Favorable conditions' }],
        },
      }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityReason).toBeNull();
  });

  it('returns null suitabilityReason for CAUTION with empty reasons', () => {
    const vm = buildRegimeViewModelBlock(
      makeBlock({ clmmSuitability: { status: 'CAUTION', reasons: [] } }),
      1_700_000_000_000,
    );

    expect(vm.suitabilityReason).toBeNull();
  });
});
