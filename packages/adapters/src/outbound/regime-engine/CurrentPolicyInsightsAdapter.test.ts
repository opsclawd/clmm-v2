import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentPolicyInsightsAdapter } from './CurrentPolicyInsightsAdapter.js';
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

const SAMPLE_UPSTREAM = {
  schemaVersion: '1.0',
  pair: 'SOL/USDC',
  asOf: '2026-05-07T12:00:00Z',
  source: 'openclaw',
  runId: 'run-42',
  status: 'FRESH',
  marketRegime: 'UP',
  fundamentalRegime: 'CONSTRUCTIVE',
  recommendedAction: 'hold',
  confidence: 'medium',
  riskLevel: 'normal',
  dataQuality: 'complete',
  clmmPolicy: {
    posture: 'wide',
    rangeBias: 'symmetric',
    rebalanceSensitivity: 'low',
    maxCapitalDeploymentPct: 0.5,
  },
  levels: { supports: [140.5, 138.0], resistances: [155.0, 160.5] },
  reasoning: ['Trend is constructive', 'Vol is muted', 'Funding neutral'],
  sourceRefs: ['msg-1', 'msg-2'],
  expiresAt: '2026-05-07T13:00:00Z',
  payloadHash: 'sha256:abc',
  receivedAtIso: '2026-05-07T12:00:01Z',
  freshness: {
    capturedAtIso: '2026-05-07T12:00:00Z',
    stale: false,
  },
};

describe('CurrentPolicyInsightsAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with parsed PolicyInsightBlock on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);

    const result = await adapter.fetchCurrent();

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.recommendedAction).toBe('hold');
    expect(result.block.clmmPolicy.maxCapitalDeploymentPct).toBe(0.5);
    expect(result.block.levels.supports).toEqual([140.5, 138.0]);
    expect(result.block.sourceRefs).toEqual(['msg-1', 'msg-2']);
    expect(result.block.freshness.capturedAtUnixMs).toBe(Date.parse('2026-05-07T12:00:00Z'));
    expect(result.block.freshness.stale).toBe(false);
  });

  it('hits /v1/insights/sol-usdc/current with no query params', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://regime.example.com/v1/insights/sol-usdc/current');
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_UPSTREAM), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com/', obs.port);
    await adapter.fetchCurrent();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://regime.example.com/v1/insights/sol-usdc/current');
  });

  it('returns kind:"not-found" on 404 with INSIGHT_NOT_FOUND code', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'INSIGHT_NOT_FOUND', message: 'not yet' }), {
        status: 404,
      }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"not-found" on 404 with no body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"store-unavailable" on 503', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 503 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('store-unavailable');
  });

  it('returns kind:"upstream-error" on 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNRESET'));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on AbortError (timeout)', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on unparseable JSON body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not json', { status: 200 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on malformed top-level shape', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ recommendedAction: 'INVALID' }), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on malformed clmmPolicy', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ...SAMPLE_UPSTREAM,
          clmmPolicy: { posture: 'wide', rangeBias: 'symmetric' },
        }),
        { status: 200 },
      ),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on malformed levels', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          ...SAMPLE_UPSTREAM,
          levels: { supports: ['oops'], resistances: [] },
        }),
        { status: 200 },
      ),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on malformed sourceRefs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...SAMPLE_UPSTREAM, sourceRefs: [42] }), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"upstream-error" on malformed freshness', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...SAMPLE_UPSTREAM, freshness: { stale: 'no' } }), {
        status: 200,
      }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('upstream-error');
  });

  it('returns kind:"config-error" when baseUrl is null', async () => {
    const adapter = new CurrentPolicyInsightsAdapter(null, obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('config-error');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('returns kind:"config-error" when baseUrl is malformed', async () => {
    const adapter = new CurrentPolicyInsightsAdapter('not a url', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('config-error');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
