import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PositionDetailDto, PositionSummaryDto } from '@clmm/application/public';
import { fetchPositionDetail, fetchSupportedPositions } from './positions.js';

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

describe('fetchPositionDetail', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    restoreBffBaseUrl();
    delete (globalThis as { location?: Location }).location;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requests position detail from the configured BFF base URL', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const detail = {
      positionId: 'Position1111111111111111111111111111111111',
      poolId: 'Pool111111111111111111111111111111111111111',
      rangeState: 'below-range',
      hasActionableTrigger: true,
      monitoringStatus: 'active',
      lowerBound: 100,
      upperBound: 200,
      currentPrice: 80,
      triggerId: 'Trigger1111111111111111111111111111111111',
      breachDirection: { kind: 'lower-bound-breach' },
    } as PositionDetailDto;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ position: detail }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchPositionDetail(
        'DemoWallet1111111111111111111111111111111111',
        'Position1111111111111111111111111111111111',
      ),
    ).resolves.toEqual(detail);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/positions/DemoWallet1111111111111111111111111111111111/Position1111111111111111111111111111111111',
      { method: 'GET' },
    );
  });

  it('rejects position detail payloads with NaN bounds or price', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          position: {
            positionId: 'Position1111111111111111111111111111111111',
            poolId: 'Pool111111111111111111111111111111111111111',
            rangeState: 'below-range',
            hasActionableTrigger: false,
            monitoringStatus: 'active',
            lowerBound: Number.NaN,
            upperBound: 200,
            currentPrice: 80,
          },
        }),
    }) as typeof fetch;

    const error = await fetchPositionDetail(
      'DemoWallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load position detail for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed position detail response',
    );
  });

  it('rejects position detail payloads with infinite bounds or price', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          position: {
            positionId: 'Position1111111111111111111111111111111111',
            poolId: 'Pool111111111111111111111111111111111111111',
            rangeState: 'below-range',
            hasActionableTrigger: false,
            monitoringStatus: 'active',
            lowerBound: 100,
            upperBound: Number.POSITIVE_INFINITY,
            currentPrice: 80,
          },
        }),
    }) as typeof fetch;

    const error = await fetchPositionDetail(
      'DemoWallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load position detail for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed position detail response',
    );
  });

  it('rejects position detail payloads that omit the position envelope field', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          error: 'Position data temporarily unavailable.',
        }),
    }) as typeof fetch;

    const error = await fetchPositionDetail(
      'DemoWallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load position detail for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed position detail response',
    );
  });

  it('returns position detail when the payload includes both position data and a warning', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const detail = {
      positionId: 'Position1111111111111111111111111111111111',
      poolId: 'Pool111111111111111111111111111111111111111',
      rangeState: 'below-range',
      hasActionableTrigger: false,
      monitoringStatus: 'active',
      lowerBound: 100,
      upperBound: 200,
      currentPrice: 80,
    } as PositionDetailDto;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          position: detail,
          error: 'Trigger status may be incomplete.',
        }),
    }) as typeof fetch;

    await expect(
      fetchPositionDetail(
        'DemoWallet1111111111111111111111111111111111',
        'Position1111111111111111111111111111111111',
      ),
    ).resolves.toEqual(detail);
  });
});
