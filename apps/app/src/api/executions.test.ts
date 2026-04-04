import { afterEach, describe, expect, it, vi } from 'vitest';
import { approveExecutionPreview } from './executions';

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
        headers: expect.any(Headers),
      }),
    );
  });
});
