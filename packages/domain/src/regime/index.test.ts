import { describe, expect, it } from 'vitest';
import type { MarketRegime, ClmmSuitabilityStatus } from './index.js';

describe('domain/regime value types', () => {
  it('accepts each MarketRegime literal at compile time', () => {
    const up: MarketRegime = 'UP';
    const down: MarketRegime = 'DOWN';
    const chop: MarketRegime = 'CHOP';
    expect([up, down, chop]).toEqual(['UP', 'DOWN', 'CHOP']);
  });

  it('accepts each ClmmSuitabilityStatus literal at compile time', () => {
    const allowed: ClmmSuitabilityStatus = 'ALLOWED';
    const caution: ClmmSuitabilityStatus = 'CAUTION';
    const blocked: ClmmSuitabilityStatus = 'BLOCKED';
    const unknown: ClmmSuitabilityStatus = 'UNKNOWN';
    expect([allowed, caution, blocked, unknown]).toEqual([
      'ALLOWED',
      'CAUTION',
      'BLOCKED',
      'UNKNOWN',
    ]);
  });
});
