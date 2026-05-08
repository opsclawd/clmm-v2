import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCurrentRegime,
  RegimeUnsupportedPoolError,
  isRegimeUnsupportedPoolError,
} from './regime';

type ExpoPublicEnv = NodeJS.ProcessEnv & {
  EXPO_PUBLIC_BFF_BASE_URL?: string;
};

const ORIGINAL_FETCH = globalThis.fetch;
const env = process.env as ExpoPublicEnv;
const ORIGINAL_BFF_BASE_URL = env.EXPO_PUBLIC_BFF_BASE_URL;

function restoreBffBaseUrl(): void {
  if (ORIGINAL_BFF_BASE_URL == null) {
    delete env.EXPO_PUBLIC_BFF_BASE_URL;
    return;
  }
  env.EXPO_PUBLIC_BFF_BASE_URL = ORIGINAL_BFF_BASE_URL;
}

function fixtureBlock() {
  return {
    regime: 'UP',
    telemetry: {
      realizedVolShort: 0.007,
      realizedVolLong: 0.0107,
      volRatio: 1.06,
      trendStrength: 0.00018,
      compression: 0.0092,
    },
    clmmSuitability: {
      status: 'ALLOWED',
      reasons: [{ severity: 'INFO', text: 'Trend is clear' }],
    },
    marketReasons: [
      { severity: 'WARN', text: 'Volatility elevated' },
      { severity: 'INFO', text: 'Momentum positive' },
    ],
    freshness: {
      generatedAtUnixMs: 1_745_712_000_000,
      lastCandleUnixMs: 1_745_712_000_000 - 87 * 60_000,
      ageSeconds: 87 * 60,
      softStale: false,
      hardStale: false,
      softStaleSeconds: 75 * 60,
      hardStaleSeconds: 90 * 60,
    },
    metadata: { source: 'geckoterminal', network: 'solana', symbol: 'SOL/USDC', timeframe: '1h' },
  };
}

const POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

describe('fetchCurrentRegime', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { regime } on 200 with a valid regime block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: block }),
    }) as typeof fetch;

    const result = await fetchCurrentRegime(POOL_ID);

    expect(result.regime).toEqual(block);
    expect(result.unavailableReason).toBeUndefined();
  });

  it('throws RegimeUnsupportedPoolError on 404 with "not supported" body', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Pool not supported: BadPool' }),
    }) as typeof fetch;

    const error = await fetchCurrentRegime('BadPool111111111111111111111111111111111111').catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(RegimeUnsupportedPoolError);
    expect(isRegimeUnsupportedPoolError(error)).toBe(true);
  });

  it('returns unavailableReason when BFF responds with null regime and reason', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: null, unavailableReason: 'not-found' }),
    }) as typeof fetch;

    const result = await fetchCurrentRegime(POOL_ID);

    expect(result.regime).toBeNull();
    expect(result.unavailableReason).toBe('not-found');
  });

  it('throws on 200 with a malformed regime block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: { regime: 'INVALID' } }),
    }) as typeof fetch;

    const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed regime block');
  });

  it('narrows RegimeUnsupportedPoolError via isRegimeUnsupportedPoolError', () => {
    const err = new RegimeUnsupportedPoolError('test-pool');
    expect(isRegimeUnsupportedPoolError(err)).toBe(true);
    expect(isRegimeUnsupportedPoolError(new Error('other'))).toBe(false);
  });

  it('throws when the response uses the deprecated top-level trendStrength shape', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const oldShape = {
      regime: 'UP',
      trendStrength: 0.75,
      volRatio: 1.2,
      clmmSuitability: { status: 'ALLOWED', reasons: [] },
      marketReasons: [],
      freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: oldShape }),
    }) as typeof fetch;

    const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed regime block');
  });

  it('throws when the response uses the deprecated capturedAtUnixMs freshness shape', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const block = fixtureBlock();
    const broken: Record<string, unknown> = {
      ...block,
      freshness: { capturedAtUnixMs: 1_745_712_000_000, softStale: false, hardStale: false },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: broken }),
    }) as typeof fetch;

    const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed regime block');
  });

  it('throws when metadata is missing required fields', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const block = fixtureBlock();
    const broken: Record<string, unknown> = { ...block, metadata: { source: 'geckoterminal' } };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: broken }),
    }) as typeof fetch;

    const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed regime block');
  });

  it('throws when optional metadata fields have wrong types', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const block = fixtureBlock();
    const broken: Record<string, unknown> = {
      ...block,
      metadata: { ...block.metadata, configVersion: {}, engineVersion: 123 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ regime: broken }),
    }) as typeof fetch;

    const error = await fetchCurrentRegime(POOL_ID).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed regime block');
  });
});
