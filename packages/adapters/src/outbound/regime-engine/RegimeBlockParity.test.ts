import { describe, it, expect } from 'vitest';
import type { RegimeBlock, RegimeReadResult } from '@clmm/application';

describe('RegimeBlock structural parity', () => {
  it('application RegimeBlock is self-consistent', () => {
    const sampleBlock: RegimeBlock = {
      regime: 'UP',
      trendStrength: 0.75,
      volRatio: 1.2,
      clmmSuitability: { status: 'ALLOWED', reasons: [] },
      marketReasons: [],
      freshness: { capturedAtUnixMs: 1700000000000, softStale: false, hardStale: false },
    };
    expect(sampleBlock.regime).toBe('UP');
    expect(sampleBlock.trendStrength).toBe(0.75);
    expect(sampleBlock.clmmSuitability.status).toBe('ALLOWED');
    expect(sampleBlock.freshness.capturedAtUnixMs).toBe(1700000000000);
  });

  it('application RegimeReadResult block variant is well-formed', () => {
    const result: RegimeReadResult = {
      kind: 'block',
      block: {
        regime: 'UP',
        trendStrength: 0.75,
        volRatio: 1.2,
        clmmSuitability: { status: 'ALLOWED', reasons: [] },
        marketReasons: [],
        freshness: { capturedAtUnixMs: 1700000000000, softStale: false, hardStale: false },
      },
    };
    expect(result.kind).toBe('block');
    if (result.kind === 'block') {
      expect(result.block.regime).toBe('UP');
    }
  });

  it('application RegimeReadResult not-found variant', () => {
    const result: RegimeReadResult = { kind: 'not-found' };
    expect(result.kind).toBe('not-found');
  });

  it('application RegimeReadResult config-error variant', () => {
    const result: RegimeReadResult = { kind: 'config-error' };
    expect(result.kind).toBe('config-error');
  });

  it('application RegimeReadResult upstream-error variant', () => {
    const result: RegimeReadResult = { kind: 'upstream-error' };
    expect(result.kind).toBe('upstream-error');
  });
});
