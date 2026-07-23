import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentPolicyInsightsAdapter } from './CurrentPolicyInsightsAdapter.js';
import type { ObservabilityPort } from '@clmm/application';
import canonicalCurrentPair from '../../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import canonicalCurrentPosition from '../../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';

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

describe('CurrentPolicyInsightsAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with the real canonical fixture on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(canonicalCurrentPair), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);

    const result = await adapter.fetchCurrent();

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block).toEqual(canonicalCurrentPair);
  });

  it('returns kind:"block" with the position fixture on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(canonicalCurrentPosition), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);

    const result = await adapter.fetchCurrent();

    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.recommendedAction).toBe('EXIT_TO_SOL');
    expect(result.block.position).not.toBeNull();
  });

  it('hits /v1/insights/sol-usdc/current with no query params', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(canonicalCurrentPair), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://regime.example.com/v1/insights/sol-usdc/current');
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(canonicalCurrentPair), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com/', obs.port);
    await adapter.fetchCurrent();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toBe('https://regime.example.com/v1/insights/sol-usdc/current');
  });

  it('returns kind:"not-found" on 404 with INSIGHT_NOT_FOUND code', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'INSIGHT_NOT_FOUND', message: 'not yet', details: [] },
        }),
        { status: 404 },
      ),
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

  it('returns kind:"malformed" when a 200 payload violates the canonical schema', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ recommendedAction: 'INVALID' }), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('malformed');
  });

  it('logs contract validation failure when returning kind:"malformed"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ recommendedAction: 'INVALID' }), { status: 200 }),
    );
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent();
    expect(obs.logs).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: 'PolicyInsights response failed shape validation',
      }),
    );
  });

  it('returns kind:"malformed" on malformed clmmPolicy', async () => {
    const malformed = {
      ...canonicalCurrentPair,
      clmmPolicy: { rangeBias: 'INVALID' },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('malformed');
  });

  it('returns kind:"malformed" when clmmPolicy maxCapitalDeploymentBps > 10000', async () => {
    const malformed = {
      ...canonicalCurrentPair,
      clmmPolicy: {
        rangeBias: 'MEDIUM',
        rebalanceSensitivity: 'NORMAL',
        maxCapitalDeploymentBps: 15000,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('malformed');
  });

  it('returns kind:"malformed" on malformed levels', async () => {
    const malformed = {
      ...canonicalCurrentPair,
      levels: { supportsUsdcPerSol: ['not-a-number'], resistancesUsdcPerSol: [] },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('malformed');
  });

  it('returns kind:"malformed" on malformed freshness', async () => {
    const malformed = {
      ...canonicalCurrentPair,
      freshness: { status: 'INVALID' },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentPolicyInsightsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('malformed');
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

  it('returns kind:"config-error" when baseUrl uses disallowed protocol', async () => {
    const adapter = new CurrentPolicyInsightsAdapter('ftp://example.com', obs.port);
    const result = await adapter.fetchCurrent();
    expect(result.kind).toBe('config-error');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
