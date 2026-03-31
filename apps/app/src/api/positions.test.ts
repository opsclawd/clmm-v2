import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PositionSummaryDto } from '@clmm/application/public';
import { fetchSupportedPositions } from './positions.js';

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

describe('fetchSupportedPositions', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    delete (globalThis as { location?: Location }).location;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests supported positions from the configured BFF base URL', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
      },
    ] as PositionSummaryDto[];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ positions }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchSupportedPositions('DemoWallet1111111111111111111111111111111111'),
    ).resolves.toEqual(positions);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/positions/DemoWallet1111111111111111111111111111111111',
      { method: 'GET' },
    );
  });

  it('falls back to the current web origin protocol and hostname on port 3001', async () => {
    vi.stubGlobal('location', { origin: 'https://app.example.test:8081' });

    const positions = [] as PositionSummaryDto[];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ positions }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchSupportedPositions('DemoWallet1111111111111111111111111111111111'),
    ).resolves.toEqual(positions);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.example.test:3001/positions/DemoWallet1111111111111111111111111111111111',
      { method: 'GET' },
    );
  });

  it('throws a controlled error when no BFF base URL can be resolved', async () => {
    vi.stubGlobal('location', undefined);

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'EXPO_PUBLIC_BFF_BASE_URL must be configured when no web origin is available',
    );
  });

  it('throws a controlled error when the BFF request fails and preserves the cause', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('service unavailable'),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain('HTTP 503');
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'service unavailable',
    );
  });

  it('throws a controlled error when the BFF payload is malformed', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        positions: [
          {
            positionId: 123,
            poolId: 'Pool111111111111111111111111111111111111111',
            rangeState: 'in-range',
            hasActionableTrigger: false,
            monitoringStatus: 'active',
          },
        ],
      }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed positions response',
    );
  });
});
