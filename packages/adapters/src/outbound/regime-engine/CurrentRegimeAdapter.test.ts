import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentRegimeAdapter } from './CurrentRegimeAdapter.js';
import type { ObservabilityPort } from '@clmm/application';

interface FakeLogEntry {
  level: string;
  message: string;
  context: Record<string, unknown> | undefined;
}

function createFakeObservability() {
  const logs: FakeLogEntry[] = [];
  const port: ObservabilityPort = {
    log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
      logs.push({ level, message, context });
    },
    recordTiming() {},
    recordDetectionTiming() {},
    recordDeliveryTiming() {},
  };
  return { logs, port };
}

const PARAMS = {
  symbol: 'SOL/USDC',
  source: 'geckoterminal',
  network: 'solana',
  poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  timeframe: '1h',
};

const SAMPLE_UPSTREAM = {
  regime: 'UP',
  source: 'geckoterminal',
  network: 'solana',
  symbol: 'SOL/USDC',
  timeframe: '1h',
  sourceTimeframe: '15m',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: {
    status: 'ALLOWED',
    reasons: [{ severity: 'INFO', message: 'Trend supports range LP', code: 'CLMM_OK' }],
  },
  marketReasons: [{ severity: 'INFO', message: 'Constructive trend', code: 'TREND_OK' }],
  freshness: {
    generatedAtIso: '2026-05-06T12:00:00Z',
    lastCandleOpenUnixMs: Date.parse('2026-05-06T11:00:00Z'),
    lastCandleOpenIso: '2026-05-06T11:00:00Z',
    lastCandleCloseUnixMs: Date.parse('2026-05-06T12:00:00Z'),
    lastCandleCloseIso: '2026-05-06T12:00:00Z',
    ageSeconds: 0,
    softStale: false,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    sourceCandleCount: 346,
    candleCount: 86,
    derivedTimeframe: '1h',
    aggregationVersion: 'ohlcv-agg-v1',
    engineVersion: 'regime-engine-v1.4.0',
    configVersion: 'regime-config-v3',
  },
};

describe('CurrentRegimeAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with parsed RegimeBlock on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);

    const result = await adapter.fetchCurrent(PARAMS);

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.regime).toBe('UP');
    expect(result.block.telemetry).toEqual({
      realizedVolShort: 0.007,
      realizedVolLong: 0.0107,
      volRatio: 1.06,
      trendStrength: 0.00018,
      compression: 0.0092,
    });
    expect(result.block.clmmSuitability.status).toBe('ALLOWED');
    expect(result.block.freshness.generatedAtUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
    expect(result.block.freshness.generatedAtIso).toBe('2026-05-06T12:00:00Z');
    expect(result.block.freshness.lastCandleOpenUnixMs).toBe(Date.parse('2026-05-06T11:00:00Z'));
    expect(result.block.freshness.lastCandleOpenIso).toBe('2026-05-06T11:00:00Z');
    expect(result.block.freshness.lastCandleCloseUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
    expect(result.block.freshness.lastCandleCloseIso).toBe('2026-05-06T12:00:00Z');
    expect(result.block.freshness.ageSeconds).toBe(0);
    expect(result.block.freshness.softStale).toBe(false);
    expect(result.block.freshness.hardStale).toBe(false);
    expect(result.block.freshness.softStaleSeconds).toBe(75 * 60);
    expect(result.block.freshness.hardStaleSeconds).toBe(90 * 60);
    expect(result.block.metadata.source).toBe('geckoterminal');
    expect(result.block.metadata.network).toBe('solana');
    expect(result.block.metadata.symbol).toBe('SOL/USDC');
    expect(result.block.metadata.timeframe).toBe('1h');
    expect(result.block.metadata.sourceTimeframe).toBe('15m');
    expect(result.block.metadata.sourceCandleCount).toBe(346);
    expect(result.block.metadata.candleCount).toBe(86);
    expect(result.block.metadata.derivedTimeframe).toBe('1h');
    expect(result.block.metadata.aggregationVersion).toBe('ohlcv-agg-v1');
    expect(result.block.metadata.engineVersion).toBe('regime-engine-v1.4.0');
    expect(result.block.metadata.configVersion).toBe('regime-config-v3');
  });

  it('sends all five required upstream query params', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent(PARAMS);
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('symbol=SOL%2FUSDC');
    expect(calledUrl).toContain('source=geckoterminal');
    expect(calledUrl).toContain('network=solana');
    expect(calledUrl).toContain('poolAddress=Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
    expect(calledUrl).toContain('timeframe=1h');
  });

  it('returns kind:"not-found" when upstream returns 404 with nested error envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          error: { code: 'CANDLES_NOT_FOUND', message: 'No candles found', details: [] },
        }),
        { status: 404 },
      ),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"config-error" when upstream returns 400 with nested error envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          error: { code: 'VALIDATION_ERROR', message: 'bad symbol', details: [] },
        }),
        { status: 400 },
      ),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('config-error');
    expect(obs.logs.some((l) => l.message.includes('VALIDATION_ERROR'))).toBe(true);
  });

  it('returns kind:"upstream-error" on 404 with unrecognized error code', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          error: { code: 'UNKNOWN_CODE', message: 'something', details: [] },
        }),
        { status: 404 },
      ),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on 404 with unparseable error envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ schemaVersion: '1.0' }), { status: 404 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on 5xx', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on malformed body shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ regime: 'INVALID', telemetry: { trendStrength: 'oops' } }), {
        status: 200,
      }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on unparseable JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"config-error" when baseUrl is null', async () => {
    const adapter = new CurrentRegimeAdapter(null, obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('config-error');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('returns kind:"config-error" when baseUrl is malformed', async () => {
    const adapter = new CurrentRegimeAdapter('not-a-url', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('config-error');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(obs.logs.some((l) => l.message.includes('malformed'))).toBe(true);
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com/', obs.port);
    await adapter.fetchCurrent(PARAMS);
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toMatch(/^https:\/\/regime\.example\.com\/v1\/regime\/current\?/);
  });

  it('maps upstream message field to DTO text in reasons', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.clmmSuitability.reasons[0]!.text).toBe('Trend supports range LP');
    expect(result.block.marketReasons[0]!.text).toBe('Constructive trend');
  });

  it('uses top-level metadata fields and overrides nested metadata', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      source: 'geckoterminal',
      network: 'solana',
      symbol: 'SOL/USDC',
      timeframe: '1h',
      metadata: {
        ...SAMPLE_UPSTREAM.metadata,
        source: 'NESTED-SHOULD-LOSE',
        network: 'NESTED-SHOULD-LOSE',
        symbol: 'NESTED-SHOULD-LOSE',
        timeframe: 'NESTED-SHOULD-LOSE',
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.metadata.source).toBe('geckoterminal');
    expect(result.block.metadata.network).toBe('solana');
    expect(result.block.metadata.symbol).toBe('SOL/USDC');
    expect(result.block.metadata.timeframe).toBe('1h');
  });

  it('falls back to nested metadata when top-level metadata is absent', async () => {
    const upstream = {
      regime: SAMPLE_UPSTREAM.regime,
      telemetry: SAMPLE_UPSTREAM.telemetry,
      clmmSuitability: SAMPLE_UPSTREAM.clmmSuitability,
      marketReasons: SAMPLE_UPSTREAM.marketReasons,
      freshness: SAMPLE_UPSTREAM.freshness,
      metadata: {
        source: 'geckoterminal',
        network: 'solana',
        symbol: 'SOL/USDC',
        timeframe: '1h',
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.metadata.source).toBe('geckoterminal');
    expect(result.block.metadata.network).toBe('solana');
  });

  it('uses top-level optional metadata fields with nested fallback', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      sourceCandleCount: 500,
      candleCount: 120,
      derivedTimeframe: '4h',
      aggregationVersion: 'ohlcv-agg-v2',
      engineVersion: 'regime-engine-v2',
      configVersion: 'regime-config-v4',
      metadata: {
        ...SAMPLE_UPSTREAM.metadata,
        sourceCandleCount: 999,
        candleCount: 999,
        derivedTimeframe: 'NESTED-SHOULD-LOSE',
        aggregationVersion: 'NESTED-SHOULD-LOSE',
        engineVersion: 'NESTED-SHOULD-LOSE',
        configVersion: 'NESTED-SHOULD-LOSE',
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.metadata.sourceCandleCount).toBe(500);
    expect(result.block.metadata.candleCount).toBe(120);
    expect(result.block.metadata.derivedTimeframe).toBe('4h');
    expect(result.block.metadata.aggregationVersion).toBe('ohlcv-agg-v2');
    expect(result.block.metadata.engineVersion).toBe('regime-engine-v2');
    expect(result.block.metadata.configVersion).toBe('regime-config-v4');
  });

  it('falls back to nested metadata for optional fields when top-level is absent', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      metadata: {
        source: 'geckoterminal',
        network: 'solana',
        symbol: 'SOL/USDC',
        timeframe: '1h',
        sourceCandleCount: 346,
        candleCount: 86,
        derivedTimeframe: '1h',
        aggregationVersion: 'ohlcv-agg-v1',
        engineVersion: 'regime-engine-v1.4.0',
        configVersion: 'regime-config-v3',
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.metadata.sourceCandleCount).toBe(346);
    expect(result.block.metadata.candleCount).toBe(86);
    expect(result.block.metadata.derivedTimeframe).toBe('1h');
    expect(result.block.metadata.aggregationVersion).toBe('ohlcv-agg-v1');
  });

  it('treats non-positive optional number metadata as absent', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      sourceCandleCount: 0,
      candleCount: -5,
      metadata: {
        ...SAMPLE_UPSTREAM.metadata,
        sourceCandleCount: 0,
        candleCount: -5,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.metadata.sourceCandleCount).toBeUndefined();
    expect(result.block.metadata.candleCount).toBeUndefined();
  });

  it('rejects when required metadata cannot be resolved from either layer', async () => {
    const upstream = {
      regime: SAMPLE_UPSTREAM.regime,
      telemetry: SAMPLE_UPSTREAM.telemetry,
      clmmSuitability: SAMPLE_UPSTREAM.clmmSuitability,
      marketReasons: SAMPLE_UPSTREAM.marketReasons,
      freshness: SAMPLE_UPSTREAM.freshness,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects when generatedAtIso is not parseable', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      freshness: { ...SAMPLE_UPSTREAM.freshness, generatedAtIso: 'not-a-date' },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects when lastCandleIso is not parseable', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      freshness: { ...SAMPLE_UPSTREAM.freshness, lastCandleIso: 'not-a-date' },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects when ageSeconds is negative', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      freshness: { ...SAMPLE_UPSTREAM.freshness, ageSeconds: -1 },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects when softStaleSeconds is not positive', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      freshness: { ...SAMPLE_UPSTREAM.freshness, softStaleSeconds: 0 },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects when hardStaleSeconds is not greater than softStaleSeconds', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      freshness: {
        ...SAMPLE_UPSTREAM.freshness,
        softStaleSeconds: 90 * 60,
        hardStaleSeconds: 90 * 60,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects when any telemetry value is non-finite', async () => {
    const upstream = {
      ...SAMPLE_UPSTREAM,
      telemetry: { ...SAMPLE_UPSTREAM.telemetry, compression: Number.POSITIVE_INFINITY },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(upstream), { status: 200 }));
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('upstream-error');
  });

  it('preserves all five telemetry numbers exactly as parsed', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.telemetry).toEqual(SAMPLE_UPSTREAM.telemetry);
  });
});
