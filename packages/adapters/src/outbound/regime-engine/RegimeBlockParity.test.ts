import { describe, it, expect } from 'vitest';
import type { RegimeBlock, RegimeReadResult } from '@clmm/application';

const sampleBlock: RegimeBlock = {
  regime: 'UP',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [],
  freshness: {
    generatedAtUnixMs: 1_700_000_000_000,
    lastCandleUnixMs: 1_700_000_000_000 - 87 * 60_000,
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
};

describe('RegimeBlock structural parity', () => {
  it('application RegimeBlock is self-consistent', () => {
    expect(sampleBlock.regime).toBe('UP');
    expect(sampleBlock.telemetry.trendStrength).toBe(0.00018);
    expect(sampleBlock.clmmSuitability.status).toBe('ALLOWED');
    expect(sampleBlock.freshness.generatedAtUnixMs).toBe(1_700_000_000_000);
    expect(sampleBlock.freshness.softStaleSeconds).toBeLessThan(
      sampleBlock.freshness.hardStaleSeconds,
    );
    expect(sampleBlock.metadata.source).toBe('geckoterminal');
  });

  it('application RegimeReadResult block variant is well-formed', () => {
    const result: RegimeReadResult = { kind: 'block', block: sampleBlock };
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
