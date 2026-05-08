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

  it('RegimeFreshness exposes both clocks, age, stale flags, and thresholds', () => {
    expectTypeOf<RegimeFreshness>().toEqualTypeOf<{
      generatedAtUnixMs: number;
      lastCandleUnixMs: number;
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
        lastCandleUnixMs: 1_700_000_000_000 - 87 * 60_000,
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
