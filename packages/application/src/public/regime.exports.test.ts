import { describe, expect, it } from 'vitest';
import type {
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeClmmSuitability,
  RegimeMetadata,
  MarketRegime,
  ClmmSuitabilityStatus,
} from './index.js';

describe('@clmm/application/public exports for regime', () => {
  it('exposes RegimeBlock and nested DTOs as types', () => {
    const sample: RegimeBlock = {
      regime: 'UP' as MarketRegime,
      trendStrength: 0.4,
      volRatio: 1.1,
      clmmSuitability: {
        status: 'ALLOWED' as ClmmSuitabilityStatus,
        reasons: [{ severity: 'INFO' as RegimeReasonSeverity, text: 'ok' }],
      } satisfies RegimeClmmSuitability,
      marketReasons: [] as RegimeReason[],
      freshness: {
        capturedAtUnixMs: 0,
        softStale: false,
        hardStale: false,
      } satisfies RegimeFreshness,
      metadata: {} satisfies RegimeMetadata,
    };
    expect(sample.regime).toBe('UP');
  });
});
