import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentSrLevelsAdapter } from './CurrentSrLevelsAdapter.js';
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

const SAMPLE_RESPONSE = {
  briefId: 'brief-123',
  sourceRecordedAtIso: '2025-01-01T00:00:00Z',
  summary: 'Test summary',
  capturedAtIso: '2025-01-15T12:00:00Z',
  supports: [{ price: 100 }, { price: 90 }],
  resistances: [{ price: 200 }, { price: 210 }],
};

describe('CurrentSrLevelsAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns sorted SrLevelsBlock on happy path', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).not.toBeNull();
    expect(result!['briefId']).toBe('brief-123');
    expect(result!['summary']).toBe('Test summary');
    expect(result!['sourceRecordedAtIso']).toBe('2025-01-01T00:00:00Z');
    expect(result!.supports).toEqual([{ price: 90 }, { price: 100 }]);
    expect(result!.resistances).toEqual([{ price: 200 }, { price: 210 }]);
    expect(result!['capturedAtUnixMs']).toBe(Date.parse('2025-01-15T12:00:00Z'));
  });

  it('URL-encodes symbol and source parameters', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent('SOL/USDC', 'mco');

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('symbol=SOL%2FUSDC');
    expect(calledUrl).toContain('source=mco');
  });

  it('does not send auth headers (public read)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_RESPONSE), { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent('SOL/USDC', 'mco');

    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit | undefined;
    expect(opts?.headers).toBeUndefined();
  });

  it('returns block with empty arrays when supports/resistances are empty', async () => {
    const emptyResponse = { ...SAMPLE_RESPONSE, supports: [], resistances: [] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(emptyResponse), { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).not.toBeNull();
    expect(result!.supports).toEqual([]);
    expect(result!.resistances).toEqual([]);
  });

  it('sorts unsorted prices defensively', async () => {
    const unsortedResponse = {
      ...SAMPLE_RESPONSE,
      supports: [{ price: 300 }, { price: 100 }, { price: 200 }],
      resistances: [{ price: 600 }, { price: 400 }, { price: 500 }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(unsortedResponse), { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result!.supports.map((s) => s.price)).toEqual([100, 200, 300]);
    expect(result!.resistances.map((r) => r.price)).toEqual([400, 500, 600]);
  });

  it('returns null on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).toBeNull();
  });

  it('returns null and logs warn on 500', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).toBeNull();
    expect(obs.logs).toHaveLength(1);
    expect(obs.logs[0]!.level).toBe('warn');
    expect(obs.logs[0]!.message).toContain('status 500');
  });

  it('returns null and logs warn on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).toBeNull();
    expect(obs.logs).toHaveLength(1);
    expect(obs.logs[0]!.level).toBe('warn');
    expect(obs.logs[0]!.message).toBe('SR levels fetch error');
  });

  it('returns null and logs warn on malformed JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not-json', { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).toBeNull();
    expect(obs.logs).toHaveLength(1);
    expect(obs.logs[0]!.level).toBe('warn');
  });

  it('returns null and logs warn on wrong shape JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).toBeNull();
    expect(obs.logs).toHaveLength(1);
    expect(obs.logs[0]!.message).toContain('unexpected shape');
  });

  it('returns null on 2s timeout (AbortError)', async () => {
    vi.mocked(fetch).mockImplementation((_input: string | URL | Request, _init?: RequestInit) => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      return Promise.reject(err);
    });

    const adapter = new CurrentSrLevelsAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'mco');

    expect(result).toBeNull();
  });

  it('returns null when baseUrl is null, logs warn on first call only', async () => {
    const adapter = new CurrentSrLevelsAdapter(null, obs.port);

    const result1 = await adapter.fetchCurrent('SOL/USDC', 'mco');
    expect(result1).toBeNull();
    expect(obs.logs).toHaveLength(1);
    expect(obs.logs[0]!.message).toContain('no REGIME_ENGINE_BASE_URL');

    const result2 = await adapter.fetchCurrent('SOL/USDC', 'mco');
    expect(result2).toBeNull();
    expect(obs.logs).toHaveLength(1);
  });
});
