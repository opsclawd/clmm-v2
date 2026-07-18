import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PositionDetailDto,
  PositionListFinancialMetricsDto,
  PositionSummaryDto,
} from '@clmm/application/public';
import { fetchPositionDetail, fetchSupportedPositions } from './positions';

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
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ positions }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      fetchSupportedPositions('DemoWallet1111111111111111111111111111111111'),
    ).resolves.toEqual({
      positions,
      financialMetrics: unavailableMetricsFor('Pool111111111111111111111111111111111111111'),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://bff.example.test/positions/DemoWallet1111111111111111111111111111111111',
      expect.objectContaining({}),
    );
  });

  it('throws a controlled error when EXPO_PUBLIC_BFF_BASE_URL is not set', async () => {
    delete env.EXPO_PUBLIC_BFF_BASE_URL;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toBe(
      'Missing EXPO_PUBLIC_BFF_BASE_URL',
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
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'service unavailable',
    );
  });

  it('throws a controlled error when the BFF payload is malformed', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
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

  it('returns positions with warning when BFF signals partial data', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions,
          warning: 'Some pool data unavailable. Position list may be incomplete.',
        }),
    }) as typeof fetch;

    const result = await fetchSupportedPositions('DemoWallet1111111111111111111111111111111111');

    expect(result.positions).toEqual(positions);
    expect(result.warning).toBe('Some pool data unavailable. Position list may be incomplete.');
  });

  it('throws a controlled error when BFF returns an error field in positions response', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions: [],
          error: 'Unable to fetch positions. Position data temporarily unavailable.',
        }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Unable to fetch positions',
    );
  });

  it('returns positions with error as warning when BFF has partial data and an error', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions,
          error: 'Unable to fetch trigger data. Trigger status may be incomplete.',
        }),
    }) as typeof fetch;

    const result = await fetchSupportedPositions('DemoWallet1111111111111111111111111111111111');

    expect(result.positions).toEqual(positions);
    expect(result.warning).toBe('Unable to fetch trigger data. Trigger status may be incomplete.');
  });

  function unavailableMetricsFor(poolId: string): PositionListFinancialMetricsDto {
    return {
      positionValue: null,
      unclaimedFees: null,
      poolsById: { [poolId]: { tvl: null, fees24h: null } },
    };
  }

  function validPoolMetrics(): {
    tvl: {
      poolId: string & { readonly _brand: 'PoolId' };
      valueUsd: number;
      observedAtUnixMs: number;
      source: string;
      scope: 'whole-orca-pool';
    };
    fees24h: {
      poolId: string & { readonly _brand: 'PoolId' };
      valueUsd: number;
      source: string;
      windowStartUnixMs: number;
      windowEndUnixMs: number;
      scope: 'whole-orca-pool';
    };
  } {
    return {
      tvl: {
        poolId: 'Pool111111111111111111111111111111111111111' as string & {
          readonly _brand: 'PoolId';
        },
        valueUsd: 1000,
        observedAtUnixMs: 1_800_000_000_000,
        source: 'orca',
        scope: 'whole-orca-pool',
      },
      fees24h: {
        poolId: 'Pool111111111111111111111111111111111111111' as string & {
          readonly _brand: 'PoolId';
        },
        valueUsd: 10,
        source: 'orca',
        windowStartUnixMs: 1_799_913_600_000,
        windowEndUnixMs: 1_800_000_000_000,
        scope: 'whole-orca-pool',
      },
    };
  }

  it('normalizes a legacy response without financialMetrics to unavailable metrics for every returned pool', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ positions }),
    }) as typeof fetch;

    const result = await fetchSupportedPositions('DemoWallet1111111111111111111111111111111111');

    expect(result.positions).toEqual(positions);
    expect(result.financialMetrics).toEqual(
      unavailableMetricsFor('Pool111111111111111111111111111111111111111'),
    );
  });

  it('preserves exact zero and populated authoritative financial metrics', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    const financialMetrics: PositionListFinancialMetricsDto = {
      positionValue: {
        valueUsd: 0,
        valuedAtUnixMs: 1_800_000_000_000,
        source: 'orca',
        basis: 'principal-token-amounts',
        scope: 'returned-supported-positions',
        excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
      },
      unclaimedFees: {
        valueUsd: 0,
        valuedAtUnixMs: 1_800_000_000_000,
        source: 'orca',
        basis: 'currently-claimable-trading-fees',
        scope: 'returned-supported-positions',
        excludes: ['rewards', 'collected-fees', 'lifetime-fees'],
      },
      poolsById: { Pool111111111111111111111111111111111111111: validPoolMetrics() },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ positions, financialMetrics }),
    }) as typeof fetch;

    const result = await fetchSupportedPositions('DemoWallet1111111111111111111111111111111111');

    expect(result.positions).toEqual(positions);
    expect(result.financialMetrics).toEqual(financialMetrics);
  });

  it('preserves null financial metrics as unavailable', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    const financialMetrics: PositionListFinancialMetricsDto = {
      positionValue: null,
      unclaimedFees: null,
      poolsById: { Pool111111111111111111111111111111111111111: { tvl: null, fees24h: null } },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ positions, financialMetrics }),
    }) as typeof fetch;

    const result = await fetchSupportedPositions('DemoWallet1111111111111111111111111111111111');

    expect(result.positions).toEqual(positions);
    expect(result.financialMetrics).toEqual(financialMetrics);
  });

  it('rejects malformed non-null financial metrics instead of normalizing them', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions,
          financialMetrics: {
            positionValue: {
              valueUsd: 'not-a-number',
              valuedAtUnixMs: 1000,
              source: 'orca',
              basis: 'principal-token-amounts',
              scope: 'returned-supported-positions',
              excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'],
            },
            unclaimedFees: null,
            poolsById: {
              Pool111111111111111111111111111111111111111: { tvl: null, fees24h: null },
            },
          },
        }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed positions financial metrics',
    );
  });

  it('rejects a present financialMetrics block that omits a returned pool', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions,
          financialMetrics: {
            positionValue: null,
            unclaimedFees: null,
            poolsById: {},
          },
        }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed positions financial metrics',
    );
  });

  it('rejects pool metrics whose embedded pool id differs from the response map key', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const positions = [
      {
        positionId: 'Position1111111111111111111111111111111111',
        poolId: 'Pool111111111111111111111111111111111111111',
        tokenPairLabel: 'SOL / USDC',
        currentPrice: 150,
        currentPriceLabel: 'USDC 150.00',
        feeRateLabel: '30 bps',
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
        lowerBoundLabel: 'USDC 100.00',
        upperBoundLabel: 'USDC 200.00',
        rangeState: 'in-range',
        hasActionableTrigger: false,
        monitoringStatus: 'active',
        rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      },
    ] as PositionSummaryDto[];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          positions,
          financialMetrics: {
            positionValue: null,
            unclaimedFees: null,
            poolsById: {
              Pool111111111111111111111111111111111111111: {
                tvl: {
                  poolId: 'WrongPoolId' as string & { readonly _brand: 'PoolId' },
                  valueUsd: 1000,
                  observedAtUnixMs: 1_800_000_000_000,
                  source: 'orca',
                  scope: 'whole-orca-pool',
                },
                fees24h: null,
              },
            },
          },
        }),
    }) as typeof fetch;

    const error = await fetchSupportedPositions(
      'DemoWallet1111111111111111111111111111111111',
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Could not load supported positions for this wallet');
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(((error as Error & { cause?: Error }).cause as Error).message).toContain(
      'Malformed positions financial metrics',
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
      lowerBoundPrice: 100,
      upperBoundPrice: 200,
      lowerBoundLabel: 'USDC 100.00',
      upperBoundLabel: 'USDC 200.00',
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
      expect.objectContaining({}),
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
            lowerBoundPrice: Number.NaN,
            upperBoundPrice: 200,
            lowerBoundLabel: 'USDC 0.00',
            upperBoundLabel: 'USDC 200.00',
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
            lowerBoundPrice: 100,
            upperBoundPrice: Number.POSITIVE_INFINITY,
            lowerBoundLabel: 'USDC 100.00',
            upperBoundLabel: 'USDC 200.00',
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
      lowerBoundPrice: 100,
      upperBoundPrice: 200,
      lowerBoundLabel: 'USDC 100.00',
      upperBoundLabel: 'USDC 200.00',
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

  it('forward-compat: ignores srLevels if a stale server still attaches it', async () => {
    env.EXPO_PUBLIC_BFF_BASE_URL = 'https://bff.example.test';

    const detail = {
      positionId: 'Position1111111111111111111111111111111111',
      poolId: 'Pool111111111111111111111111111111111111111',
      tokenPairLabel: 'SOL / USDC',
      currentPrice: 150,
      currentPriceLabel: 'USDC 150.00',
      feeRateLabel: '30 bps',
      lowerBoundPrice: 100,
      upperBoundPrice: 200,
      lowerBoundLabel: 'USDC 100.00',
      upperBoundLabel: 'USDC 200.00',
      rangeState: 'in-range',
      rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
      hasActionableTrigger: false,
      monitoringStatus: 'active',
      srLevels: {
        briefId: 'brief-1',
        sourceRecordedAtIso: null,
        summary: null,
        capturedAtUnixMs: 1_000_000,
        supports: [{ price: 90 }],
        resistances: [{ price: 210 }],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ position: detail }),
    }) as typeof fetch;

    const result = await fetchPositionDetail(
      'DemoWallet1111111111111111111111111111111111',
      'Position1111111111111111111111111111111111',
    );

    expect(result.positionId).toBe('Position1111111111111111111111111111111111');
  });
});
