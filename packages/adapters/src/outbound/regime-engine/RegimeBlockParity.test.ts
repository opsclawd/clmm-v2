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
    generatedAtIso: '2023-11-14T22:13:20.000Z',
    lastCandleOpenUnixMs: 1_700_000_000_000 - 60 * 60_000,
    lastCandleOpenIso: '2023-11-14T21:13:20.000Z',
    lastCandleCloseUnixMs: 1_700_000_000_000,
    lastCandleCloseIso: '2023-11-14T22:13:20.000Z',
    ageSeconds: 0,
    softStale: false,
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
    expect(sampleBlock.freshness.lastCandleCloseUnixMs).toBeGreaterThan(
      sampleBlock.freshness.lastCandleOpenUnixMs,
    );
    expect(typeof sampleBlock.freshness.lastCandleOpenIso).toBe('string');
    expect(typeof sampleBlock.freshness.lastCandleCloseIso).toBe('string');
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
