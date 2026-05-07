import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentPolicyInsight } from './policyInsights.js';

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
    schemaVersion: '1.0',
    pair: 'SOL/USDC',
    asOf: '2026-05-07T00:00:00Z',
    source: 'openclaw',
    runId: 'run-1',
    status: 'FRESH',
    marketRegime: 'UP',
    fundamentalRegime: 'NEUTRAL',
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
    levels: { supports: [140.5], resistances: [155.0] },
    reasoning: ['Trend constructive'],
    sourceRefs: ['msg-1'],
    expiresAt: '2026-05-07T01:00:00Z',
    payloadHash: 'h',
    receivedAtIso: '2026-05-07T00:00:01Z',
    freshness: { capturedAtUnixMs: 1_700_000_000_000, stale: false },
  };
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
    (block.clmmPolicy as unknown as Record<string, unknown>)['maxCapitalDeploymentPct'] = 'oops';
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
    (block.levels as unknown as Record<string, unknown>)['supports'] = ['oops'];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ policyInsight: block }),
    }) as typeof fetch;

    const error = await fetchCurrentPolicyInsight().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
  });

  it('throws on 200 with malformed sourceRefs', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const block = fixtureBlock();
    (block as unknown as Record<string, unknown>)['sourceRefs'] = [42];
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

  it('does not accept a poolId parameter', () => {
    type Args = Parameters<typeof fetchCurrentPolicyInsight>;
    const _empty: Args = [] as const;
    expect(_empty.length).toBe(0);
  });
});
