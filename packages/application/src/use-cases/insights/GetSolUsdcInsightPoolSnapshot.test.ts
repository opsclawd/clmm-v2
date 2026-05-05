import { describe, it, expect } from 'vitest';
import { getSolUsdcInsightPoolSnapshot } from './GetSolUsdcInsightPoolSnapshot.js';
import { FakeSupportedPositionReadPort, FIXTURE_POOL_DATA } from '@clmm/testing';
import { makePoolId } from '@clmm/domain';

const SOL_USDC_POOL_ID = makePoolId('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');

describe('getSolUsdcInsightPoolSnapshot', () => {
  it('returns ok with a populated SOL/USDC pool snapshot', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([], {
      [SOL_USDC_POOL_ID]: { ...FIXTURE_POOL_DATA, poolId: SOL_USDC_POOL_ID },
    });
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.pool.poolId).toBe(SOL_USDC_POOL_ID);
      expect(result.pool.pair).toBe('SOL/USDC');
      expect(result.pool.source).toBe('orca');
      expect(result.pool.observedAtUnixMs).toBe(1_700_000_000_000);
      expect(result.pool.tickCurrentIndex).toBe(FIXTURE_POOL_DATA.tickCurrentIndex);
      expect(result.pool.tickSpacing).toBe(FIXTURE_POOL_DATA.tickSpacing);
      expect(result.pool.feeRate).toBe(FIXTURE_POOL_DATA.feeRate);
      expect(result.pool.sqrtPrice).toBe(FIXTURE_POOL_DATA.sqrtPrice.toString());
      expect(result.pool.poolLiquidity).toBe(FIXTURE_POOL_DATA.liquidity.toString());
      expect(result.pool.priceSource).toBe('orca_whirlpool_sqrt_price');
      expect(result.pool.currentPrice).toBeGreaterThan(0);
    }
  });

  it('returns pool-unavailable when getPoolData resolves null', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([], {});
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('returns pool-unavailable when getPoolData throws', async () => {
    const positionReadPort = {
      listSupportedPositions: async () => [],
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => {
        throw new Error('rpc timeout');
      },
    } as unknown as FakeSupportedPositionReadPort;
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('returns pool-unavailable when token decimals are missing', async () => {
    const noDecimalsPool = {
      ...FIXTURE_POOL_DATA,
      poolId: SOL_USDC_POOL_ID,
      tokenPair: { ...FIXTURE_POOL_DATA.tokenPair, decimalsA: null, decimalsB: null },
    };
    const positionReadPort = new FakeSupportedPositionReadPort([], {
      [SOL_USDC_POOL_ID]: noDecimalsPool,
    });
    const result = await getSolUsdcInsightPoolSnapshot({
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      now: () => 1_700_000_000_000,
    });
    expect(result.kind).toBe('pool-unavailable');
  });
});
