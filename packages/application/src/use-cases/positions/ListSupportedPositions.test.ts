import { describe, it, expect } from 'vitest';
import { listSupportedPositions } from './ListSupportedPositions.js';
import { tickToPrice, makePositionId } from '@clmm/domain';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POOL_DATA,
} from '@clmm/testing';
import type { LiquidityPosition } from '@clmm/domain';

describe('ListSupportedPositions', () => {
  it('returns enriched summaries with pool data', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(1);
    expect(result.summaryDtos[0]?.tokenPairLabel).toContain('SOL');
    expect(result.summaryDtos[0]?.currentPriceLabel).toMatch(/USDC/);
    expect(result.summaryDtos[0]?.feeRateLabel).toBe('10 bps');
  });

  it('returns empty list when wallet has no positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(0);
    expect(result.summaryDtos).toHaveLength(0);
  });

  it('emits price-space lowerBoundPrice and upperBoundPrice (no tick fields) for the SOL/USDC pool', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    const dto = result.summaryDtos[0]!;
    const expectedLower = tickToPrice(FIXTURE_POSITION_IN_RANGE.bounds.lowerBound, 9, 6);
    const expectedUpper = tickToPrice(FIXTURE_POSITION_IN_RANGE.bounds.upperBound, 9, 6);
    expect(typeof dto.lowerBoundPrice).toBe('number');
    expect(Number.isFinite(dto.lowerBoundPrice)).toBe(true);
    expect(typeof dto.upperBoundPrice).toBe('number');
    expect(Number.isFinite(dto.upperBoundPrice)).toBe(true);
    expect(dto.lowerBoundPrice).toBeLessThan(dto.upperBoundPrice);
    expect(dto.lowerBoundPrice).toBe(expectedLower);
    expect(dto.upperBoundPrice).toBe(expectedUpper);
    expect(dto.lowerBoundLabel).toBe(`USDC ${expectedLower.toFixed(2)}`);
    expect(dto.upperBoundLabel).toBe(`USDC ${expectedUpper.toFixed(2)}`);
    expect(dto).not.toHaveProperty('lowerBound');
    expect(dto).not.toHaveProperty('upperBound');
  });

  it('excludes positions whose pool metadata is missing', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {});

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(0);
    expect(result.poolMetadataFailures).toBeGreaterThan(0);
  });

  it('excludes positions whose pool metadata has null decimals', async () => {
    const poolDataNullDecimals = {
      ...FIXTURE_POOL_DATA,
      tokenPair: { ...FIXTURE_POOL_DATA.tokenPair, decimalsA: null, decimalsB: null },
    };
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: poolDataNullDecimals,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(0);
  });

  it('computes range distance for out-of-range positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE], {
      [FIXTURE_POSITION_BELOW_RANGE.poolId]: FIXTURE_POOL_DATA,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.summaryDtos[0]?.rangeState).toBe('below-range');
    expect(result.summaryDtos[0]?.rangeDistance.belowLowerPercent).toBeGreaterThanOrEqual(0);
  });

  it('counts poolMetadataFailures when getPoolData throws', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {});
    positionReadPort.getPoolData = async () => {
      throw new Error('RPC timeout');
    };

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.positions).toHaveLength(1);
    expect(result.summaryDtos).toHaveLength(0);
    expect(result.poolMetadataFailures).toBeGreaterThan(0);
  });

  it('reports zero poolMetadataFailures when all pool data is available', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.poolMetadataFailures).toBe(0);
    expect(result.summaryDtos).toHaveLength(1);
  });

  it('returns unavailable financial metrics for every returned unique pool', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.financialMetrics).toEqual({
      positionValue: null,
      unclaimedFees: null,
      poolsById: {
        [FIXTURE_POOL_DATA.poolId]: { tvl: null, fees24h: null },
      },
    });
  });

  it('does not derive financial metrics from raw pool liquidity', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA,
    });

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    const highLiquidityPoolData = { ...FIXTURE_POOL_DATA, liquidity: 9999999999n };
    const highLiquidityReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE], {
      [FIXTURE_POSITION_IN_RANGE.poolId]: highLiquidityPoolData,
    });

    const highLiquidityResult = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: highLiquidityReadPort,
    });

    expect(result.financialMetrics).toEqual(highLiquidityResult.financialMetrics);
  });

  it('deduplicates unavailable pool metrics when positions share a pool', async () => {
    const secondPosition: LiquidityPosition = {
      ...FIXTURE_POSITION_IN_RANGE,
      positionId: makePositionId('fixture-pos-2'),
      bounds: { lowerBound: 200, upperBound: 300 },
    };
    const positionReadPort = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE, secondPosition],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
    );

    const result = await listSupportedPositions({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort,
    });

    expect(result.summaryDtos).toHaveLength(2);
    expect(Object.keys(result.financialMetrics.poolsById)).toHaveLength(1);
    expect(result.financialMetrics.poolsById[FIXTURE_POOL_DATA.poolId]).toEqual({
      tvl: null,
      fees24h: null,
    });
  });
});
