import { describe, it, expect, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { InsightsDataController } from './InsightsDataController.js';
import {
  FakeSupportedPositionReadPort,
  FakeTriggerRepository,
  FakePricePort,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POOL_DATA,
  FIXTURE_SOL_PRICE_QUOTE,
  FIXTURE_USDC_PRICE_QUOTE,
} from '@clmm/testing';
import { makePoolId, makePositionId } from '@clmm/domain';
import type { SrLevelsReadPort, SrLevelsBlock } from '@clmm/application';
import type { PositionDetail } from '@clmm/domain';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const ALLOWLIST = new Map<string, { symbol: string; source: string }>([
  [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'mco' }],
]);

const WALLET_ID = FIXTURE_POSITION_IN_RANGE.walletId;

function poolDataFor(poolIdStr: string) {
  return { ...FIXTURE_POOL_DATA, poolId: makePoolId(poolIdStr) };
}

function positionInPool(positionIdStr: string, poolIdStr: string) {
  return {
    ...FIXTURE_POSITION_IN_RANGE,
    positionId: makePositionId(positionIdStr),
    poolId: makePoolId(poolIdStr),
  };
}

function detailFor(positionIdStr: string, poolIdStr: string): PositionDetail {
  return {
    ...FIXTURE_POSITION_DETAIL,
    position: positionInPool(positionIdStr, poolIdStr),
    poolData: poolDataFor(poolIdStr),
  };
}

const sampleSrPort: SrLevelsReadPort = { fetchCurrent: vi.fn().mockResolvedValue(null) };

const samplePort = (positions: ReturnType<typeof positionInPool>[]) =>
  ({
    listSupportedPositions: async () => positions,
    getPosition: async () => null,
    getPositionDetail: async (_w: never, positionId: string) => detailFor(positionId, SOL_USDC_POOL_ID),
    getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
  }) as unknown as FakeSupportedPositionReadPort;

const fixedClock = () => 1_700_000_000_000;

describe('InsightsDataController', () => {
  it('throws on construction if the allowlist does not have exactly one entry', () => {
    expect(() =>
      new InsightsDataController(
        new FakeSupportedPositionReadPort([], {}),
        new FakeTriggerRepository(),
        new FakePricePort(),
        sampleSrPort,
        new Map(),
        fixedClock,
      ),
    ).toThrow();
  });

  it('GET pool: returns the pool snapshot', async () => {
    const controller = new InsightsDataController(
      samplePort([]),
      new FakeTriggerRepository(),
      new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    const result = await controller.getPool();
    expect(result.pool.poolId).toBe(SOL_USDC_POOL_ID);
    expect(result.pool.pair).toBe('SOL/USDC');
  });

  it('GET pool: returns 503 with pool_snapshot_unavailable when pool data is null', async () => {
    const controller = new InsightsDataController(
      new FakeSupportedPositionReadPort([], {}),
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getPool();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'pool_snapshot_unavailable',
        pair: 'SOL/USDC',
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET positions/:walletId: returns the snapshot DTO', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const controller = new InsightsDataController(
      samplePort(positions),
      new FakeTriggerRepository(),
      new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    const result = await controller.getPositions(WALLET_ID);
    expect(result.snapshot.walletId).toBe(WALLET_ID);
    expect(result.snapshot.positions).toHaveLength(1);
  });

  it('GET positions/:walletId: returns 503 with position_list_unavailable when listing fails', async () => {
    const port = {
      listSupportedPositions: async () => { throw new Error('rpc'); },
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const controller = new InsightsDataController(
      port,
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getPositions(WALLET_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_list_unavailable',
        walletId: WALLET_ID,
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET positions/:walletId: returns 503 with position_detail_unavailable and positionId on detail failure', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const controller = new InsightsDataController(
      port,
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getPositions(WALLET_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_detail_unavailable',
        positionId: 'pos-broken',
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET bundle/:walletId: returns the bundle DTO', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const block: SrLevelsBlock = {
      briefId: 'b1',
      sourceRecordedAtIso: null,
      summary: null,
      capturedAtUnixMs: 1_700_000_000_000,
      supports: [{ price: 130 }],
      resistances: [{ price: 160 }],
    };
    const srPort: SrLevelsReadPort = { fetchCurrent: vi.fn().mockResolvedValue(block) };

    const controller = new InsightsDataController(
      samplePort(positions),
      new FakeTriggerRepository(),
      new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srPort,
      ALLOWLIST,
      fixedClock,
    );

    const result = await controller.getBundle(WALLET_ID);
    expect(result.bundle.pool.poolId).toBe(SOL_USDC_POOL_ID);
    expect(result.bundle.srLevels).toEqual(block);
    expect(result.bundle.positions).toHaveLength(1);
  });

  it('GET bundle/:walletId: returns 503 with position_detail_unavailable on detail failure', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const controller = new InsightsDataController(
      port,
      new FakeTriggerRepository(),
      new FakePricePort(),
      sampleSrPort,
      ALLOWLIST,
      fixedClock,
    );

    try {
      await controller.getBundle(WALLET_ID);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(503);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_detail_unavailable',
        positionId: 'pos-broken',
        walletId: WALLET_ID,
        poolId: SOL_USDC_POOL_ID,
      });
    }
  });
});