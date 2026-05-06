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
  trendStrength: 0.62,
  volRatio: 1.08,
  clmmSuitability: {
    status: 'ALLOWED',
    reasons: [{ severity: 'INFO', text: 'Trend supports range LP', code: 'CLMM_OK' }],
  },
  marketReasons: [{ severity: 'INFO', text: 'Constructive trend', code: 'TREND_OK' }],
  freshness: {
    capturedAtIso: '2026-05-06T12:00:00Z',
    softStale: false,
    hardStale: false,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
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
    expect(result.block.trendStrength).toBe(0.62);
    expect(result.block.volRatio).toBe(1.08);
    expect(result.block.clmmSuitability.status).toBe('ALLOWED');
    expect(result.block.freshness.capturedAtUnixMs).toBe(Date.parse('2026-05-06T12:00:00Z'));
    expect(result.block.freshness.softStale).toBe(false);
    expect(result.block.freshness.hardStale).toBe(false);
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

  it('returns kind:"not-found" when upstream returns 404 CANDLES_NOT_FOUND', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'CANDLES_NOT_FOUND', message: 'no candles' }), {
        status: 404,
      }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"config-error" when upstream returns 400 VALIDATION_ERROR', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'bad symbol' }), {
        status: 400,
      }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent(PARAMS);
    expect(result.kind).toBe('config-error');
    expect(obs.logs.some((l) => l.message.includes('VALIDATION_ERROR'))).toBe(true);
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
      new Response(JSON.stringify({ regime: 'INVALID', trendStrength: 'oops' }), { status: 200 }),
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

  it('strips trailing slash from baseUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentRegimeAdapter('https://regime.example.com/', obs.port);
    await adapter.fetchCurrent(PARAMS);
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toMatch(/^https:\/\/regime\.example\.com\/v1\/regime\/current\?/);
  });
});
