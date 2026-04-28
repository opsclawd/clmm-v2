import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentSrLevels, SrLevelsUnsupportedPoolError, isSrLevelsUnsupportedPoolError } from './srLevels';

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
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-04-27T00:00:00Z',
    summary: 'Bullish continuation.',
    capturedAtUnixMs: 1_745_712_000_000,
    supports: [{ price: 132.4 }],
    resistances: [{ price: 148.2 }],
  };
}

describe('fetchCurrentSrLevels', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { srLevels } when the BFF responds with a populated block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ srLevels: block }),
    }) as typeof fetch;

    const result = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');

    expect(result).toEqual({ srLevels: block });
  });

  it('returns { srLevels: null } when the BFF responds with null (transient unavailability)', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ srLevels: null }),
    }) as typeof fetch;

    const result = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111');

    expect(result).toEqual({ srLevels: null });
  });

  it('throws SrLevelsUnsupportedPoolError on 404 with "not supported" body', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Pool not supported: BadPool' }),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Unsupported11111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SrLevelsUnsupportedPoolError);
    expect(isSrLevelsUnsupportedPoolError(error)).toBe(true);
  });

  it('throws a generic transient error on 404 without "not supported" body (stale/misrouted BFF)', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Not Found' }),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SrLevelsUnsupportedPoolError);
    expect((error as Error).message).toContain('endpoint not found');
  });

  it('throws a generic transient error on 404 with non-JSON body', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SrLevelsUnsupportedPoolError);
    expect((error as Error).message).toContain('unexpected 404');
  });

  it('throws a generic transient error on 5xx', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SrLevelsUnsupportedPoolError);
    expect(isSrLevelsUnsupportedPoolError(error)).toBe(false);
  });

  it('throws a generic error when the payload is malformed', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ srLevels: { briefId: 'b', supports: 'not-an-array', resistances: [] } }),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SrLevelsUnsupportedPoolError);
    expect(isSrLevelsUnsupportedPoolError(error)).toBe(false);
  });

  it('throws a timeout error when the fetch is aborted (DOMException-like)', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const abortError = { name: 'AbortError', message: 'The operation was aborted.' };
    globalThis.fetch = vi.fn().mockRejectedValue(abortError) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timed out');
  });

  it('throws a timeout error when the fetch is aborted (plain object without DOMException)', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const abortLike = { name: 'AbortError' };
    globalThis.fetch = vi.fn().mockRejectedValue(abortLike) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timed out');
  });

  it('rejects srLevels blocks with non-positive prices', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        srLevels: { ...fixtureBlock(), supports: [{ price: 0 }], resistances: [] },
      }),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed');
  });

  it('rejects srLevels blocks with zero capturedAtUnixMs', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        srLevels: { ...fixtureBlock(), capturedAtUnixMs: 0 },
      }),
    }) as typeof fetch;

    const error = await fetchCurrentSrLevels('Pool111111111111111111111111111111111111111')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed');
  });
});