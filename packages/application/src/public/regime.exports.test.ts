import { describe, expectTypeOf, it } from 'vitest';
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeTelemetry,
  RegimeClmmSuitability,
  RegimeMetadata,
  MarketRegime,
  ClmmSuitabilityStatus,
} from './index.js';

describe('@clmm/application/public exports for regime', () => {
  it('RegimeBlock no longer exposes top-level trendStrength', () => {
    expectTypeOf<RegimeBlock>().not.toHaveProperty('trendStrength');
  });

  it('RegimeBlock no longer exposes top-level volRatio', () => {
    expectTypeOf<RegimeBlock>().not.toHaveProperty('volRatio');
  });

  it('RegimeBlock has telemetry with all five fields', () => {
    expectTypeOf<RegimeBlock['telemetry']>().toEqualTypeOf<RegimeTelemetry>();
    expectTypeOf<RegimeTelemetry>().toEqualTypeOf<{
      realizedVolShort: number;
      realizedVolLong: number;
      volRatio: number;
      trendStrength: number;
      compression: number;
    }>();
  });

  it('RegimeFreshness no longer exposes capturedAtUnixMs', () => {
    expectTypeOf<RegimeFreshness>().not.toHaveProperty('capturedAtUnixMs');
  });

  it('RegimeFreshness no longer exposes lastCandleUnixMs', () => {
    expectTypeOf<RegimeFreshness>().not.toHaveProperty('lastCandleUnixMs');
  });

  it('RegimeFreshness no longer exposes lastCandleIso', () => {
    expectTypeOf<RegimeFreshness>().not.toHaveProperty('lastCandleIso');
  });

  it('RegimeFreshness exposes generatedAt, candle open/close, age, stale flags, and thresholds', () => {
    expectTypeOf<RegimeFreshness>().toEqualTypeOf<{
      generatedAtUnixMs: number;
      generatedAtIso: string;
      lastCandleOpenUnixMs: number;
      lastCandleOpenIso: string;
      lastCandleCloseUnixMs: number;
      lastCandleCloseIso: string;
      ageSeconds: number;
      softStale: boolean;
      hardStale: boolean;
      softStaleSeconds: number;
      hardStaleSeconds: number;
    }>();
  });

  it('RegimeMetadata requires source, network, symbol, timeframe', () => {
    expectTypeOf<RegimeMetadata>().toMatchTypeOf<{
      source: string;
      network: string;
      symbol: string;
      timeframe: string;
    }>();
  });

  it('RegimeBlock.metadata is required (not optional)', () => {
    expectTypeOf<RegimeBlock>().toHaveProperty('metadata').not.toBeUndefined();
  });

  it('a complete sample is constructible', () => {
    const sample: RegimeBlock = {
      regime: 'UP' as MarketRegime,
      telemetry: {
        realizedVolShort: 0.007,
        realizedVolLong: 0.0107,
        volRatio: 1.06,
        trendStrength: 0.00018,
        compression: 0.0092,
      },
      clmmSuitability: {
        status: 'ALLOWED' as ClmmSuitabilityStatus,
        reasons: [{ severity: 'INFO' as RegimeReasonSeverity, text: 'ok' }] as RegimeReason[],
      } satisfies RegimeClmmSuitability,
      marketReasons: [] as RegimeReason[],
      freshness: {
        generatedAtUnixMs: 1_700_000_000_000,
        generatedAtIso: '2026-05-06T12:00:00Z',
        lastCandleOpenUnixMs: 1_700_000_000_000 - 88 * 60_000,
        lastCandleOpenIso: '2026-05-06T10:32:00Z',
        lastCandleCloseUnixMs: 1_700_000_000_000 - 87 * 60_000,
        lastCandleCloseIso: '2026-05-06T10:33:00Z',
        ageSeconds: 87 * 60,
        softStale: true,
        hardStale: false,
        softStaleSeconds: 75 * 60,
        hardStaleSeconds: 90 * 60,
      } satisfies RegimeFreshness,
      metadata: {
        source: 'geckoterminal',
        network: 'solana',
        symbol: 'SOL/USDC',
        timeframe: '1h',
      } satisfies RegimeMetadata,
    };
    expectTypeOf(sample).toEqualTypeOf<RegimeBlock>();
  });
});
