import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentEvidenceAdapter } from './CurrentEvidenceAdapter.js';
import type { ObservabilityPort } from '@clmm/application';
import canonicalEvidenceContextual from '../../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json';
import canonicalEvidenceDeterministic from '../../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json';

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

function wrapInEnvelope(bundle: unknown) {
  return {
    schemaVersion: 'envelope.v1',
    items: [{ bundle }],
  };
}

describe('CurrentEvidenceAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the validated bundle from a realistic 200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(wrapInEnvelope(canonicalEvidenceContextual)), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-internal-token',
      obs.port,
    );

    const result = await adapter.fetchCurrent();

    expect(result).toEqual({ kind: 'block', block: canonicalEvidenceContextual });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns a deterministic-only bundle from a realistic 200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(wrapInEnvelope(canonicalEvidenceDeterministic)), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-internal-token',
      obs.port,
    );

    const result = await adapter.fetchCurrent();

    expect(result).toEqual({ kind: 'block', block: canonicalEvidenceDeterministic });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('maps malformed 200 responses or invalid bundles to malformed', async () => {
    const cases: Array<[string, unknown]> = [
      ['non-object body', null],
      ['array body', []],
      ['missing items array', { schemaVersion: 'envelope.v1' }],
      ['empty items array', { schemaVersion: 'envelope.v1', items: [] }],
      ['missing bundle in item', { schemaVersion: 'envelope.v1', items: [{}] }],
      [
        'invalid bundle inside envelope',
        wrapInEnvelope({ ...canonicalEvidenceContextual, schemaVersion: 'invalid' }),
      ],
    ];

    for (const [_case, body] of cases) {
      vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      const adapter = new CurrentEvidenceAdapter(
        'https://regime.example.com',
        'test-token',
        obs.port,
      );

      await expect(adapter.fetchCurrent(), _case).resolves.toEqual({ kind: 'malformed' });
    }
  });

  it('requests pair evidence without position query parameters when scope is omitted', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(wrapInEnvelope(canonicalEvidenceContextual)), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'secret-internal-token',
      obs.port,
    );
    await adapter.fetchCurrent();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://regime.example.com/v1/evidence/sol-usdc/current',
    );
  });

  it('requests position evidence with all four encoded scope parameters when scope is provided', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(wrapInEnvelope(canonicalEvidenceContextual)), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'secret-internal-token',
      obs.port,
    );
    await adapter.fetchCurrent({
      walletAddress: 'wallet-address',
      whirlpoolAddress: 'whirlpool-address',
      positionId: 'position-id',
    });

    const calledUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(calledUrl.pathname).toBe('/v1/evidence/sol-usdc/current');
    expect(Object.fromEntries(calledUrl.searchParams)).toEqual({
      scope: 'position',
      walletAddress: 'wallet-address',
      whirlpoolAddress: 'whirlpool-address',
      positionId: 'position-id',
    });
  });

  it('hits /v1/evidence/sol-usdc/current with exact header and no query params', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(wrapInEnvelope(canonicalEvidenceContextual)), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'secret-internal-token',
      obs.port,
    );

    await adapter.fetchCurrent();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0]!;
    expect(calledUrl).toBe('https://regime.example.com/v1/evidence/sol-usdc/current');
    const headers = (calledInit?.headers ?? {}) as Record<string, string>;
    expect(headers['X-CLMM-Internal-Token']).toBe('secret-internal-token');
  });

  it('strips trailing slashes from baseUrl', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(wrapInEnvelope(canonicalEvidenceContextual)), { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com///',
      'secret-internal-token',
      obs.port,
    );

    await adapter.fetchCurrent();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = vi.mocked(fetch).mock.calls[0]!;
    expect(calledUrl).toBe('https://regime.example.com/v1/evidence/sol-usdc/current');
  });

  it('maps missing configuration to config-error without fetching', async () => {
    const adapter1 = new CurrentEvidenceAdapter(null, 'test-token', obs.port);
    const result1 = await adapter1.fetchCurrent();
    expect(result1.kind).toBe('config-error');

    const adapter2 = new CurrentEvidenceAdapter('https://regime.example.com', null, obs.port);
    const result2 = await adapter2.fetchCurrent();
    expect(result2.kind).toBe('config-error');

    const adapter3 = new CurrentEvidenceAdapter('not-a-valid-url', 'test-token', obs.port);
    const result3 = await adapter3.fetchCurrent();
    expect(result3.kind).toBe('config-error');

    const adapter4 = new CurrentEvidenceAdapter('ftp://regime.example.com', 'test-token', obs.port);
    const result4 = await adapter4.fetchCurrent();
    expect(result4.kind).toBe('config-error');

    expect(fetch).toHaveBeenCalledTimes(0);
    expect(obs.logs.length).toBeGreaterThanOrEqual(4);
  });

  it('maps evidence status responses without retry', async () => {
    // 404 test
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-token',
      obs.port,
    );

    const res404 = await adapter.fetchCurrent();
    expect(res404.kind).toBe('not-found');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // 503 test
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));
    const res503 = await adapter.fetchCurrent();
    expect(res503.kind).toBe('store-unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // 500 (other non-2xx) test
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    const res500 = await adapter.fetchCurrent();
    expect(res500.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // Malformed JSON (unparseable 200) test
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{invalid-json', { status: 200 }));
    const resUnparseable = await adapter.fetchCurrent();
    expect(resUnparseable.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // Timeout (AbortError) test
    vi.mocked(fetch).mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );
    const resTimeout = await adapter.fetchCurrent();
    expect(resTimeout.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // Network error test
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNRESET'));
    const resNetwork = await adapter.fetchCurrent();
    expect(resNetwork.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not log evidence bundle contents or internal tokens when logging degraded outcomes', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ secretData: 'super-secret', pair: 'INVALID' }), {
        status: 200,
      }),
    );
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'super-secret-token',
      obs.port,
    );

    await adapter.fetchCurrent();

    expect(obs.logs.length).toBeGreaterThan(0);
    for (const log of obs.logs) {
      expect(log.message).not.toContain('super-secret');
      expect(log.message).not.toContain('super-secret-token');
      if (log.context) {
        expect(JSON.stringify(log.context)).not.toContain('super-secret');
        expect(JSON.stringify(log.context)).not.toContain('super-secret-token');
      }
    }
  });

  it('getRawEvidence sends the encoded runId and internal token to the raw evidence endpoint', async () => {
    const rawPayload = { runId: 'run/with space', data: 123 };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(rawPayload), { status: 200 }));
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com/',
      'secret-internal-token',
      obs.port,
    );

    await adapter.getRawEvidence('run/with space');

    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0]!;
    expect(calledUrl).toBe(
      'https://regime.example.com/v1/evidence/sol-usdc/raw/run%2Fwith%20space',
    );
    const headers = (calledInit?.headers ?? {}) as Record<string, string>;
    expect(headers['X-CLMM-Internal-Token']).toBe('secret-internal-token');
    const urlObj = new URL(calledUrl as string);
    expect(urlObj.search).toBe('');
  });

  it('getRawEvidence returns the upstream JSON payload unchanged for a 200 response', async () => {
    const rawPayload = {
      runId: 'run/with space',
      telemetry: { undocumentedMetric: [1, 2, 3] },
      extra: { preserved: true },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(rawPayload), { status: 200 }));
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-internal-token',
      obs.port,
    );

    const result = await adapter.getRawEvidence('run/with space');

    expect(result).toEqual({ kind: 'ok', payload: rawPayload });
  });

  it('getRawEvidence maps an upstream 404 to not-found without retry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }));
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-token',
      obs.port,
    );

    const result = await adapter.getRawEvidence('run-123');

    expect(result).toEqual({ kind: 'not-found' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('getRawEvidence preserves an upstream 500 status without retry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-token',
      obs.port,
    );

    const result = await adapter.getRawEvidence('run-123');

    expect(result).toEqual({ kind: 'upstream-error', status: 500 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('getRawEvidence maps missing or invalid configuration to config-error without fetching', async () => {
    const adapter1 = new CurrentEvidenceAdapter(null, 'test-token', obs.port);
    const result1 = await adapter1.getRawEvidence('run-123');
    expect(result1).toEqual({ kind: 'config-error' });

    const adapter2 = new CurrentEvidenceAdapter('https://regime.example.com', null, obs.port);
    const result2 = await adapter2.getRawEvidence('run-123');
    expect(result2).toEqual({ kind: 'config-error' });

    const adapter3 = new CurrentEvidenceAdapter('not-a-valid-url', 'test-token', obs.port);
    const result3 = await adapter3.getRawEvidence('run-123');
    expect(result3).toEqual({ kind: 'config-error' });

    const adapter4 = new CurrentEvidenceAdapter('ftp://regime.example.com', 'test-token', obs.port);
    const result4 = await adapter4.getRawEvidence('run-123');
    expect(result4).toEqual({ kind: 'config-error' });

    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it('getRawEvidence maps invalid 200 JSON and transport failures to a statusless upstream-error', async () => {
    const adapter = new CurrentEvidenceAdapter(
      'https://regime.example.com',
      'test-token',
      obs.port,
    );

    // Invalid JSON from 200
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{invalid-json', { status: 200 }));
    const resUnparseable = await adapter.getRawEvidence('run-123');
    expect(resUnparseable).toEqual({ kind: 'upstream-error' });
    expect(resUnparseable).not.toHaveProperty('status');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // Abort/Timeout
    vi.mocked(fetch).mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );
    const resTimeout = await adapter.getRawEvidence('run-123');
    expect(resTimeout).toEqual({ kind: 'upstream-error' });
    expect(resTimeout).not.toHaveProperty('status');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockClear();

    // Network rejection
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNRESET'));
    const resNetwork = await adapter.getRawEvidence('run-123');
    expect(resNetwork).toEqual({ kind: 'upstream-error' });
    expect(resNetwork).not.toHaveProperty('status');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('getRawEvidence never logs the raw payload or internal token on degraded outcomes', async () => {
    const secretBody = 'super-secret-raw-body-content';
    const secretToken = 'super-secret-internal-token-value';

    vi.mocked(fetch).mockResolvedValue(
      new Response(`{invalid-json: ${secretBody}}`, { status: 200 }),
    );
    const adapter = new CurrentEvidenceAdapter('https://regime.example.com', secretToken, obs.port);

    await adapter.getRawEvidence('run-123');

    expect(obs.logs.length).toBeGreaterThan(0);
    for (const log of obs.logs) {
      expect(log.message).not.toContain(secretBody);
      expect(log.message).not.toContain(secretToken);
      if (log.context) {
        expect(JSON.stringify(log.context)).not.toContain(secretBody);
        expect(JSON.stringify(log.context)).not.toContain(secretToken);
      }
    }
  });
});
