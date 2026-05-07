import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CurrentSrThesesAdapter } from './CurrentSrThesesAdapter.js';
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

const SAMPLE_THESIS = {
  asset: 'SOL/USDC',
  timeframe: '4h',
  bias: 'bullish',
  setupType: 'breakout',
  supportLevels: ['132', '128'],
  resistanceLevels: ['148', '152'],
  entryZone: '135-138',
  targets: ['148', '152'],
  invalidation: '128',
  trigger: 'close above 145',
  chartReference: 'https://example.com/chart',
  sourceHandle: 'analyst42',
  sourceChannel: 'twitter',
  sourceKind: 'twitter',
  sourceReliability: 'high',
  rawThesisText: 'SOL looking strong above 145.',
  collectedAt: '2026-05-07T01:00:00Z',
  publishedAt: '2026-05-07T00:30:00Z',
  sourceUrl: 'https://twitter.com/analyst42/status/1',
  notes: 'first thesis of the week',
};

const SAMPLE_BLOCK = {
  schemaVersion: '2.0',
  source: 'openclaw',
  symbol: 'SOL/USDC',
  brief: {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-05-07T00:00:00Z',
    summary: 'Constructive setup forming.',
  },
  capturedAtIso: '2026-05-07T02:00:00Z',
  theses: [SAMPLE_THESIS],
};

describe('CurrentSrThesesAdapter', () => {
  let obs: ReturnType<typeof createFakeObservability>;

  beforeEach(() => {
    obs = createFakeObservability();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns kind:"block" with parsed SrThesesBlock on 200', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.schemaVersion).toBe('2.0');
    expect(result.block.source).toBe('openclaw');
    expect(result.block.symbol).toBe('SOL/USDC');
    expect(result.block.theses).toHaveLength(1);
    expect(result.block.theses[0]!.bias).toBe('bullish');
    expect(result.block.capturedAtUnixMs).toBe(Date.parse('2026-05-07T02:00:00Z'));
  });

  it('hits /v2/sr-levels/current with URL-encoded symbol and source', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/v2/sr-levels/current');
    expect(calledUrl).toContain('symbol=SOL%2FUSDC');
    expect(calledUrl).toContain('source=openclaw');
  });

  it('does not send auth headers (public read)', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit | undefined;
    expect(opts?.headers).toBeUndefined();
  });

  it('returns kind:"config-error" when baseUrl is null', async () => {
    const adapter = new CurrentSrThesesAdapter(null, obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('config-error');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns kind:"config-error" when baseUrl is malformed', async () => {
    const adapter = new CurrentSrThesesAdapter('not a url', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('config-error');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns kind:"not-found" on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"not-found" when 200 body has empty theses array', async () => {
    const emptyBody = { ...SAMPLE_BLOCK, theses: [] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(emptyBody), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('not-found');
  });

  it('returns kind:"config-error" on 400', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'bad' }), { status: 400 }),
    );
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('config-error');
    expect(fetch).toHaveBeenCalledTimes(1); // 400 must not retry
  });

  it('retries once on 503 then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on 500 then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on network error then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on timeout (AbortError) then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new DOMException('aborted', 'AbortError')),
    );
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on malformed JSON then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('not-json', { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on malformed response shape then returns kind:"upstream-error"', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retry succeeds on the second attempt', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(SAMPLE_BLOCK), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns kind:"upstream-error" on invalid capturedAtIso', async () => {
    const bad = { ...SAMPLE_BLOCK, capturedAtIso: 'not-a-date' };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
  });

  it('preserves unknown strings for bias, setupType, and sourceReliability', async () => {
    const exotic = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          ...SAMPLE_THESIS,
          bias: 'mildly-constructive-but-cautious',
          setupType: 'distribution-into-vwap',
          sourceReliability: 'tier-experimental-2026',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(exotic), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.theses[0]!.bias).toBe('mildly-constructive-but-cautious');
    expect(result.block.theses[0]!.setupType).toBe('distribution-into-vwap');
    expect(result.block.theses[0]!.sourceReliability).toBe('tier-experimental-2026');
  });

  it('returns kind:"upstream-fatal" on 401 without retry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns kind:"upstream-fatal" on 403 without retry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns kind:"upstream-fatal" on 405 without retry', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 405 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once on 429 Too Many Requests', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once on 408 Request Timeout', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 408 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects capturedAtIso that parses to unix epoch 0', async () => {
    const epochZero = { ...SAMPLE_BLOCK, capturedAtIso: '1970-01-01T00:00:00.000Z' };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(epochZero), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
  });

  it('preserves nullable fields as null (not stripped)', async () => {
    const allNulls = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          asset: 'SOL/USDC',
          timeframe: '4h',
          bias: null,
          setupType: null,
          supportLevels: [],
          resistanceLevels: [],
          entryZone: null,
          targets: [],
          invalidation: null,
          trigger: null,
          chartReference: null,
          sourceHandle: 'a',
          sourceChannel: null,
          sourceKind: 'twitter',
          sourceReliability: null,
          rawThesisText: null,
          collectedAt: null,
          publishedAt: null,
          sourceUrl: null,
          notes: null,
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(allNulls), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    const t = result.block.theses[0]!;
    expect(t.bias).toBeNull();
    expect(t.setupType).toBeNull();
    expect(t.entryZone).toBeNull();
    expect(t.invalidation).toBeNull();
    expect(t.trigger).toBeNull();
    expect(t.chartReference).toBeNull();
    expect(t.sourceChannel).toBeNull();
    expect(t.sourceReliability).toBeNull();
    expect(t.rawThesisText).toBeNull();
    expect(t.collectedAt).toBeNull();
    expect(t.publishedAt).toBeNull();
    expect(t.sourceUrl).toBeNull();
    expect(t.notes).toBeNull();
  });

  it('rejects thesis with non-string nullable field (bias=123)', async () => {
    const malformed = {
      ...SAMPLE_BLOCK,
      theses: [{ ...SAMPLE_THESIS, bias: 123 }],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects thesis with missing nullable field that should be null (bias absent)', async () => {
    const { bias: _bias, ...thesisWithoutBias } = SAMPLE_THESIS;
    const missing = {
      ...SAMPLE_BLOCK,
      theses: [thesisWithoutBias],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(missing), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.theses[0]!.bias).toBeNull();
  });

  it('rejects block with malformed brief sourceRecordedAtIso (number)', async () => {
    const malformed = {
      ...SAMPLE_BLOCK,
      brief: { ...SAMPLE_BLOCK.brief, sourceRecordedAtIso: 1234567890 },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
  });

  it('rejects block with malformed brief summary (array)', async () => {
    const malformed = {
      ...SAMPLE_BLOCK,
      brief: { ...SAMPLE_BLOCK.brief, summary: ['bad'] },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(malformed), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('upstream-error');
  });

  it('accepts block with brief sourceRecordedAtIso as null', async () => {
    const valid = {
      ...SAMPLE_BLOCK,
      brief: { ...SAMPLE_BLOCK.brief, sourceRecordedAtIso: null },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    const adapter = new CurrentSrThesesAdapter('https://regime.example.com', obs.port);
    const result = await adapter.fetchCurrent('SOL/USDC', 'openclaw');
    expect(result.kind).toBe('block');
    if (result.kind !== 'block') return;
    expect(result.block.brief.sourceRecordedAtIso).toBeNull();
  });
});
