import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCurrentSrTheses,
  SrThesesUnsupportedPoolError,
  isSrThesesUnsupportedPoolError,
} from './srTheses.js';

type ExpoPublicEnv = NodeJS.ProcessEnv & {
  EXPO_PUBLIC_BFF_BASE_URL?: string;
};

const env = process.env as ExpoPublicEnv;
const ORIGINAL_BFF_BASE_URL = env.EXPO_PUBLIC_BFF_BASE_URL;

function restoreBffBaseUrl(): void {
  if (ORIGINAL_BFF_BASE_URL == null) {
    delete env.EXPO_PUBLIC_BFF_BASE_URL;
    return;
  }
  env.EXPO_PUBLIC_BFF_BASE_URL = ORIGINAL_BFF_BASE_URL;
}

const POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const UNSUPPORTED_POOL_ID = 'Pool111111111111111111111111111111111111111';

const SAMPLE_BLOCK = {
  schemaVersion: '2.0',
  source: 'openclaw',
  symbol: 'SOL/USDC',
  brief: { briefId: 'brief-1', sourceRecordedAtIso: null, summary: null },
  capturedAtIso: '2026-05-07T00:00:00Z',
  capturedAtUnixMs: Date.parse('2026-05-07T00:00:00Z'),
  theses: [
    {
      asset: 'SOL/USDC',
      timeframe: '4h',
      bias: 'bullish',
      setupType: 'breakout',
      supportLevels: ['132'],
      resistanceLevels: ['148'],
      entryZone: '135-138',
      targets: ['148'],
      invalidation: '128',
      trigger: 'close above 145',
      chartReference: null,
      sourceHandle: 'analyst42',
      sourceChannel: 'twitter',
      sourceKind: 'twitter',
      sourceReliability: 'high',
      rawThesisText: 'SOL strong above 145.',
      collectedAt: '2026-05-07T01:00:00Z',
      publishedAt: '2026-05-07T00:30:00Z',
      sourceUrl: null,
      notes: null,
    },
  ],
};

describe('fetchCurrentSrTheses', () => {
  beforeEach(() => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    restoreBffBaseUrl();
    vi.restoreAllMocks();
  });

  it('returns { srTheses: block } on a valid 200 envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: SAMPLE_BLOCK }), { status: 200 }),
    );
    const result = await fetchCurrentSrTheses(POOL_ID);
    expect(result.srTheses).not.toBeNull();
    expect(result.srTheses!.symbol).toBe('SOL/USDC');
    expect(result.unavailableReason).toBeUndefined();
  });

  it('returns { srTheses: null, unavailableReason } for each documented reason', async () => {
    for (const reason of ['not-found', 'config-error', 'upstream-error'] as const) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ srTheses: null, unavailableReason: reason }), {
          status: 200,
        }),
      );
      const result = await fetchCurrentSrTheses(POOL_ID);
      expect(result).toEqual({ srTheses: null, unavailableReason: reason });
    }
  });

  it('throws SrThesesUnsupportedPoolError when BFF returns 404 with "not supported" body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: `Pool not supported: ${UNSUPPORTED_POOL_ID}` }), {
        status: 404,
      }),
    );
    const error = await fetchCurrentSrTheses(UNSUPPORTED_POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SrThesesUnsupportedPoolError);
    expect(isSrThesesUnsupportedPoolError(error)).toBe(true);
  });

  it('throws a generic endpoint-not-found error on 404 without "not supported" body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 }),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isSrThesesUnsupportedPoolError(error)).toBe(false);
    expect((error as Error).message).toContain('endpoint not found');
  });

  it('throws on 5xx with detail message', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('boom');
  });

  it('throws timeout error on AbortError', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.reject(new DOMException('aborted', 'AbortError')),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timed out');
  });

  it('rejects malformed envelope (non-object body)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify('not-an-object'), { status: 200 }),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect((error as Error).message).toContain('malformed response');
  });

  it('rejects malformed srTheses block (wrong schemaVersion)', async () => {
    const bad = { ...SAMPLE_BLOCK, schemaVersion: '1.0' };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: bad }), { status: 200 }),
    );
    const error = await fetchCurrentSrTheses(POOL_ID).catch((e: unknown) => e);
    expect((error as Error).message).toContain('malformed srTheses block');
  });

  it('accepts unknown bias / setupType / sourceReliability strings', async () => {
    const exotic = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          ...SAMPLE_BLOCK.theses[0],
          bias: 'mildly-constructive-but-cautious',
          setupType: 'distribution-into-vwap',
          sourceReliability: 'tier-experimental-2026',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: exotic }), { status: 200 }),
    );
    const result = await fetchCurrentSrTheses(POOL_ID);
    expect(result.srTheses!.theses[0]!.bias).toBe('mildly-constructive-but-cautious');
    expect(result.srTheses!.theses[0]!.setupType).toBe('distribution-into-vwap');
    expect(result.srTheses!.theses[0]!.sourceReliability).toBe('tier-experimental-2026');
  });

  it('accepts nullable string fields as null', async () => {
    const allNulls = {
      ...SAMPLE_BLOCK,
      theses: [
        {
          ...SAMPLE_BLOCK.theses[0],
          bias: null,
          setupType: null,
          entryZone: null,
          invalidation: null,
          trigger: null,
          chartReference: null,
          sourceChannel: null,
          sourceReliability: null,
          rawThesisText: null,
          collectedAt: null,
          publishedAt: null,
          sourceUrl: null,
          notes: null,
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ srTheses: allNulls }), { status: 200 }),
    );
    const result = await fetchCurrentSrTheses(POOL_ID);
    expect(result.srTheses!.theses[0]!.bias).toBeNull();
    expect(result.srTheses!.theses[0]!.setupType).toBeNull();
    expect(result.srTheses!.theses[0]!.sourceReliability).toBeNull();
    expect(result.srTheses!.theses[0]!.entryZone).toBeNull();
  });
});
