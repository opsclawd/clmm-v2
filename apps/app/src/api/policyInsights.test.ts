import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentPolicyInsight } from './policyInsights.js';
import canonicalCurrentPair from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';

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

function fixtureBlock(): typeof canonicalCurrentPair {
  return JSON.parse(JSON.stringify(canonicalCurrentPair)) as typeof canonicalCurrentPair;
}

describe('fetchCurrentPolicyInsight', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns { policyInsight } on 200 with a valid block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toEqual(block);
    expect(result.unavailableReason).toBeUndefined();
  });

  it('returns { policyInsight: null, unavailableReason } when BFF returns not-found envelope', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'not-found' }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toBeNull();
    expect(result.unavailableReason).toBe('not-found');
  });

  it('returns { policyInsight: null, unavailableReason } for store-unavailable', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'store-unavailable' }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toBeNull();
    expect(result.unavailableReason).toBe('store-unavailable');
  });

  it('returns { policyInsight: null, unavailableReason } for config-error', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'config-error' }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toBeNull();
    expect(result.unavailableReason).toBe('config-error');
  });

  it('returns { policyInsight: null, unavailableReason } for upstream-error', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'upstream-error' }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toBeNull();
    expect(result.unavailableReason).toBe('upstream-error');
  });

  it('returns { policyInsight: null, unavailableReason } for malformed', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: null, unavailableReason: 'malformed' }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight();

    expect(result.policyInsight).toBeNull();
    expect(result.unavailableReason).toBe('malformed');
  });

  it('throws on 200 with malformed top-level block', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: { recommendedAction: 'INVALID' } }),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed policyInsight block');
  });

  it('throws on 200 with malformed clmmPolicy', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();
    (block.clmmPolicy as unknown as Record<string, unknown>)['maxCapitalDeploymentBps'] = 'oops';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed policyInsight block');
  });

  it('throws on 200 with negative maxCapitalDeploymentBps', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();
    (block.clmmPolicy as unknown as Record<string, unknown>)['maxCapitalDeploymentBps'] = -500;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed policyInsight block');
  });

  it('throws on 200 with malformed levels', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();
    (block.levels as unknown as Record<string, unknown>)['supportsUsdcPerSol'] = ['not-a-decimal'];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
  });

  it('throws on non-2xx response', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('boom'),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Could not load policy insights');
  });

  it('throws on invalid JSON body', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('not valid JSON');
  });

  it('aborts immediately when external signal is already aborted', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const controller = new AbortController();
    controller.abort();

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(err);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ policyInsight: fixtureBlock() }),
      });
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight(controller.signal).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Could not load policy insights');
  });

  it('aborts fetch when external signal fires during request', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const controller = new AbortController();

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    }) as typeof fetch;

    const resultPromise = fetchCurrentPolicyInsight(controller.signal);

    controller.abort();

    const result = await resultPromise.catch((reason: unknown) => reason);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('Could not load policy insights');
  });

  it('throws on 200 with non-record (array) body', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ foo: 'bar' }]),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('malformed response');
  });

  it('accepts optional external signal without error when not aborted', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const controller = new AbortController();
    const block = fixtureBlock();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const result = await fetchCurrentPolicyInsight(controller.signal);
    expect(result.policyInsight).toEqual(block);
  });
});
