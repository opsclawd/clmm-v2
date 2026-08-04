import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentEvidence, fetchRawEvidence } from './evidence.js';
import canonicalEvidenceFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json';

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

function fixtureBundle(): typeof canonicalEvidenceFixture {
  return JSON.parse(JSON.stringify(canonicalEvidenceFixture)) as typeof canonicalEvidenceFixture;
}

describe('fetchCurrentEvidence', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests the unchanged pair evidence path when position scope is omitted', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ evidence: fixtureBundle() }),
    }) as typeof fetch;

    await fetchCurrentEvidence();
    expect(fetch).toHaveBeenCalledWith(
      'https://bff.example.test/evidence/sol-usdc/current',
      expect.any(Object),
    );
  });

  it('requests the encoded position evidence path when position scope is supplied', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ evidence: fixtureBundle() }),
    }) as typeof fetch;

    await fetchCurrentEvidence(undefined, {
      walletAddress: 'wallet/address',
      positionId: 'position/address',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://bff.example.test/evidence/sol-usdc/wallet%2Faddress/position%2Faddress/current',
      expect.any(Object),
    );
  });

  it('accepts only a canonical BFF evidence envelope', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const validBundle = fixtureBundle();

    // 1. Valid bundle
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ evidence: validBundle }),
    }) as typeof fetch;

    const validResult = await fetchCurrentEvidence();
    expect(validResult.evidence).toEqual(validBundle);
    expect(validResult.unavailableReason).toBeUndefined();

    // 2. Each allowlisted unavailable reason with null bundle
    const allowlistedReasons = [
      'not-found',
      'store-unavailable',
      'config-error',
      'malformed',
      'upstream-error',
    ] as const;

    for (const reason of allowlistedReasons) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ evidence: null, unavailableReason: reason }),
      }) as typeof fetch;

      const result = await fetchCurrentEvidence();
      expect(result.evidence).toBeNull();
      expect(result.unavailableReason).toBe(reason);
    }

    // 3. Null bundle without a recognized reason (missing reason or unknown reason)
    const malformedNullEnvelopes = [
      { evidence: null },
      { evidence: null, unavailableReason: 'unknown-reason' },
      { evidence: null, unavailableReason: 123 },
    ];

    for (const body of malformedNullEnvelopes) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      }) as typeof fetch;

      const error = await fetchCurrentEvidence().catch((err: unknown) => err);
      expect(error).toBeInstanceOf(Error);
    }

    // 4. Non-record / array envelope
    const nonRecordEnvelopes = [[], 'string-body', 123, null];
    for (const body of nonRecordEnvelopes) {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      }) as typeof fetch;

      const error = await fetchCurrentEvidence().catch((err: unknown) => err);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('malformed response');
    }

    // 5. Invalid JSON response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as typeof fetch;

    const jsonError = await fetchCurrentEvidence().catch((err: unknown) => err);
    expect(jsonError).toBeInstanceOf(Error);
    expect((jsonError as Error).message).toContain('not valid JSON');

    // 6. Non-2xx response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server Error'),
    }) as typeof fetch;

    const httpError = await fetchCurrentEvidence().catch((err: unknown) => err);
    expect(httpError).toBeInstanceOf(Error);
    expect((httpError as Error).message).toContain('HTTP 500');

    // 7. Schema-invalid nested bundle
    const invalidNestedBundle = fixtureBundle();
    (invalidNestedBundle as unknown as Record<string, unknown>)['schemaVersion'] = 'invalid.v99';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ evidence: invalidNestedBundle }),
    }) as typeof fetch;

    const schemaError = await fetchCurrentEvidence().catch((err: unknown) => err);
    expect(schemaError).toBeInstanceOf(Error);
    expect((schemaError as Error).message).toContain('malformed evidence block');
  });

  it('propagates external abort to the evidence request', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    // 1. Already-aborted signal
    const preAbortedController = new AbortController();
    preAbortedController.abort();

    let passedSignal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      passedSignal = init?.signal;
      if (init?.signal?.aborted) {
        const err = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(err);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ evidence: fixtureBundle() }),
      });
    }) as typeof fetch;

    const preAbortedError = await fetchCurrentEvidence(preAbortedController.signal).catch(
      (err: unknown) => err,
    );

    expect(preAbortedError).toBeInstanceOf(Error);
    expect((preAbortedError as Error).message).toContain('request timed out');
    expect(passedSignal?.aborted).toBe(true);

    // 2. In-flight abort signal
    const inFlightController = new AbortController();
    let inFlightSignal: AbortSignal | null | undefined;

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      inFlightSignal = init?.signal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    }) as typeof fetch;

    const pendingPromise = fetchCurrentEvidence(inFlightController.signal);
    inFlightController.abort();

    const inFlightError = await pendingPromise.catch((err: unknown) => err);
    expect(inFlightError).toBeInstanceOf(Error);
    expect((inFlightError as Error).message).toContain('request timed out');
    expect(inFlightSignal?.aborted).toBe(true);
  });
});

describe('fetchRawEvidence', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests the encoded raw evidence endpoint and returns its JSON payload unchanged', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const payload = { schema: 'v1', runId: 'run/with space', telemetry: { nested: true } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    }) as typeof fetch;

    await expect(fetchRawEvidence('run/with space')).resolves.toBe(payload);
    expect(fetch).toHaveBeenCalledWith(
      'https://bff.example.test/insights/sol-usdc/evidence/raw/run%2Fwith%20space',
      {},
    );
  });

  it('returns null when raw evidence is not found', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }) as typeof fetch;

    await expect(fetchRawEvidence('run-123')).resolves.toBeNull();
  });

  it('returns null when the raw evidence endpoint succeeds with JSON null', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
    }) as typeof fetch;

    await expect(fetchRawEvidence('run-123')).resolves.toBeNull();
  });

  it('rejects non-404 HTTP failures and malformed JSON', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
    }) as typeof fetch;

    await expect(fetchRawEvidence('run-123')).rejects.toThrow(
      'Could not load raw evidence: HTTP 502',
    );

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as typeof fetch;

    await expect(fetchRawEvidence('run-123')).rejects.toThrow(
      'Could not load raw evidence: response body was not valid JSON',
    );
  });

  it('passes the caller abort signal to the raw evidence request', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';
    const controller = new AbortController();

    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(err);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    }) as typeof fetch;

    controller.abort();
    await expect(fetchRawEvidence('run-123', controller.signal)).rejects.toThrow(
      'Could not load raw evidence: request aborted',
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://bff.example.test/insights/sol-usdc/evidence/raw/run-123',
      { signal: controller.signal },
    );
  });
});
