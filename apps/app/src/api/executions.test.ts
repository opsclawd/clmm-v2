import { afterEach, describe, expect, it, vi } from 'vitest';
import { approveExecutionPreview, fetchExecutionSigningPayload, submitExecution } from './executions';

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

describe('approveExecutionPreview', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    delete (globalThis as { location?: Location }).location;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends episodeId without client trigger-derived marker', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          approval: {
            attemptId: 'attempt-1',
            lifecycleState: { kind: 'awaiting-signature' },
            breachDirection: { kind: 'lower-bound-breach' },
          },
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await approveExecutionPreview({
      previewId: 'preview-1',
      walletId: 'wallet-1',
      episodeId: 'episode-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/executions/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          previewId: 'preview-1',
          walletId: 'wallet-1',
          episodeId: 'episode-1',
        }),
      }),
    );
  });
});

describe('submitExecution', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
  });

  it('includes payloadVersion in the request body when provided', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'confirmed' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await submitExecution('attempt-1', 'signed-payload-base64', 'v1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/executions/attempt-1/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ signedPayload: 'signed-payload-base64', payloadVersion: 'v1' }),
      }),
    );
  });

  it('omits payloadVersion from the request body when not provided', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'confirmed' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await submitExecution('attempt-1', 'signed-payload-base64');

    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('payloadVersion');
  });
});

describe('fetchExecutionSigningPayload', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
  });

  it('rejects signing payload DTOs missing payloadVersion', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          signingPayload: {
            attemptId: 'attempt-1',
            serializedPayload: 'base64-payload',
            lifecycleState: { kind: 'awaiting-signature' },
          },
        }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchExecutionSigningPayload('attempt-1')).rejects.toThrow(
      'Malformed execution signing payload response',
    );
  });
});
