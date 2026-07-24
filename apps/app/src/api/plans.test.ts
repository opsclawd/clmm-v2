import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentPlan, recordPlanDecision, requestPlanPreview, approvePlanExit } from './plans';

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

describe('fetchCurrentPlan', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    delete (globalThis as { location?: Location }).location;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests current plan from the configured BFF base URL', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const plan = {
      planId: 'plan-1',
      canonicalHash: 'hash-1',
      positionId: 'Position1111111111111111111111111111111111',
      state: {
        kind: 'advisory-ready',
        advisoryAction: { kind: 'HOLD' },
        regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(plan),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchCurrentPlan(
      'Wallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    );

    expect(result).toEqual(plan);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/plans/Wallet1111111111111111111111111111111111/Position1111111111111111111111111111111111/current',
      expect.objectContaining({}),
    );
  });

  it('returns null when no plan exists', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await fetchCurrentPlan(
      'Wallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    );

    expect(result).toBeNull();
  });

  it('rejects malformed plan response with missing state', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ planId: 'plan-1', canonicalHash: 'hash-1', positionId: 'pos-1' }),
    }) as typeof fetch;

    const error = await fetchCurrentPlan(
      'Wallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load current plan for this position');
  });

  it('rejects malformed plan response with invalid advisory action', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          planId: 'plan-1',
          canonicalHash: 'hash-1',
          positionId: 'pos-1',
          state: {
            kind: 'advisory-ready',
            advisoryAction: { kind: 'INVALID_ACTION' },
            regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
          },
        }),
    }) as typeof fetch;

    const error = await fetchCurrentPlan(
      'Wallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load current plan for this position');
  });

  it('rejects non-object response', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve('not an object'),
    }) as typeof fetch;

    const error = await fetchCurrentPlan(
      'Wallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load current plan for this position');
  });
});

describe('recordPlanDecision', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts decision to the correct endpoint', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ kind: 'recorded', resultId: 'result-1' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await recordPlanDecision('Wallet1', 'Position1', 'Plan1', 'acknowledged');

    expect(result).toEqual({ kind: 'recorded', resultId: 'result-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/plans/Wallet1/Position1/Plan1/decision',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'acknowledged' }),
      }),
    );
  });

  it('returns not-found when plan does not exist', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ kind: 'not-found' }),
    }) as typeof fetch;

    const result = await recordPlanDecision('Wallet1', 'Position1', 'Plan1', 'acknowledged');

    expect(result).toEqual({ kind: 'not-found' });
  });

  it('returns conflict-detected when decision conflicts', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ kind: 'conflict-detected' }),
    }) as typeof fetch;

    const result = await recordPlanDecision('Wallet1', 'Position1', 'Plan1', 'acknowledged');

    expect(result).toEqual({ kind: 'conflict-detected' });
  });
});

describe('requestPlanPreview', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts to the preview endpoint and returns previewId', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ previewId: 'preview-123' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await requestPlanPreview('Wallet1', 'Position1', 'Plan1');

    expect(result).toEqual({ previewId: 'preview-123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/plans/Wallet1/Position1/Plan1/preview',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects malformed preview response', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ wrongField: 'value' }),
    }) as typeof fetch;

    const error = await requestPlanPreview('Wallet1', 'Position1', 'Plan1').catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not request plan preview');
  });
});

describe('approvePlanExit', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts to the approve endpoint and returns attemptId', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ attemptId: 'attempt-123' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await approvePlanExit('Wallet1', 'Position1', 'Plan1', 'preview-123');

    expect(result).toEqual({ attemptId: 'attempt-123' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/plans/Wallet1/Position1/Plan1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ previewId: 'preview-123' }),
      }),
    );
  });

  it('rejects malformed approve response', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ wrongField: 'value' }),
    }) as typeof fetch;

    const error = await approvePlanExit('Wallet1', 'Position1', 'Plan1', 'preview-123').catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not approve plan exit');
  });
});
