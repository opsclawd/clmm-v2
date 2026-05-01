import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { InsightsDataController } from './InsightsDataController.js';
import { InsightsApiKeyGuard } from './InsightsApiKeyGuard.js';
import type { ExecutionContext } from '@nestjs/common';
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
import type { SrLevelsReadPort, SrLevelsBlock, SupportedPositionReadPort, TriggerRepository, PricePort } from '@clmm/application';
import type { PositionDetail } from '@clmm/domain';

const SOL_USDC_POOL_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
const ALLOWLIST = new Map<string, { symbol: string; source: string }>([
  [SOL_USDC_POOL_ID, { symbol: 'SOL/USDC', source: 'mco' }],
]);

const VALID_WALLET_ID_RAW = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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
  }) as unknown as SupportedPositionReadPort;

const fixedClock = () => 1_700_000_000_000;

function makeController(overrides?: {
  positions?: ReturnType<typeof positionInPool>[];
  positionReadPort?: SupportedPositionReadPort;
  triggerRepo?: TriggerRepository;
  pricePort?: PricePort;
  srLevelsReadPort?: SrLevelsReadPort;
  allowlist?: Map<string, { symbol: string; source: string }>;
}) {
  return new InsightsDataController(
    overrides?.positionReadPort ?? samplePort(overrides?.positions ?? []),
    overrides?.triggerRepo ?? new FakeTriggerRepository(),
    overrides?.pricePort ?? new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
    overrides?.srLevelsReadPort ?? sampleSrPort,
    overrides?.allowlist ?? ALLOWLIST,
    fixedClock,
  );
}

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
    ).toThrow(/exactly 1 allowlist entry/);
  });

  it('GET pool: returns the pool snapshot', async () => {
    const controller = makeController();
    const result = await controller.getPool();
    expect(result.pool.poolId).toBe(SOL_USDC_POOL_ID);
    expect(result.pool.pair).toBe('SOL/USDC');
  });

  it('GET pool: returns 503 with pool_snapshot_unavailable when pool data is null', async () => {
    const controller = makeController({
      positionReadPort: new FakeSupportedPositionReadPort([], {}) as unknown as SupportedPositionReadPort,
      pricePort: new FakePricePort(),
    });

    try {
      await controller.getPool();
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
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
    const controller = makeController({ positions });
    const result = await controller.getPositions(VALID_WALLET_ID_RAW);
    expect(result.snapshot.walletId).toBe(VALID_WALLET_ID_RAW);
    expect(result.snapshot.positions).toHaveLength(1);
  });

  it('GET positions/:walletId: returns 503 with position_list_unavailable when listing fails', async () => {
    const port = {
      listSupportedPositions: async () => { throw new Error('rpc'); },
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as SupportedPositionReadPort;

    const controller = makeController({ positionReadPort: port, pricePort: new FakePricePort() });

    try {
      await controller.getPositions(VALID_WALLET_ID_RAW);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_list_unavailable',
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET positions/:walletId: returns 503 with position_detail_unavailable on detail failure', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as SupportedPositionReadPort;

    const controller = makeController({ positionReadPort: port, pricePort: new FakePricePort() });

    try {
      await controller.getPositions(VALID_WALLET_ID_RAW);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_detail_unavailable',
        poolId: SOL_USDC_POOL_ID,
        positionId: 'pos-broken',
        retryable: true,
      });
    }
  });

  it('GET positions/:walletId: returns 400 for invalid walletId format', async () => {
    const controller = makeController();
    try {
      await controller.getPositions('not-a-valid-base58!');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'invalid_wallet_id',
        retryable: false,
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
    const controller = makeController({ positions, srLevelsReadPort: srPort });
    const result = await controller.getBundle(VALID_WALLET_ID_RAW);
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
    } as unknown as SupportedPositionReadPort;

    const controller = makeController({ positionReadPort: port, pricePort: new FakePricePort() });

    try {
      await controller.getBundle(VALID_WALLET_ID_RAW);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpErr.getResponse()).toMatchObject({
        code: 'position_detail_unavailable',
        poolId: SOL_USDC_POOL_ID,
        positionId: 'pos-broken',
      });
    }
  });

  it('GET bundle/:walletId: returns 503 with position_list_unavailable when listing fails', async () => {
    const port = {
      listSupportedPositions: async () => { throw new Error('rpc'); },
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as SupportedPositionReadPort;

    const controller = makeController({ positionReadPort: port, pricePort: new FakePricePort() });

    try {
      await controller.getBundle(VALID_WALLET_ID_RAW);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'position_list_unavailable',
        poolId: SOL_USDC_POOL_ID,
        retryable: true,
      });
    }
  });

  it('GET bundle/:walletId: returns 400 for invalid walletId format', async () => {
    const controller = makeController();
    try {
      await controller.getBundle('@@@invalid@@@');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'invalid_wallet_id',
        retryable: false,
      });
    }
  });
});

function makeMockContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('InsightsApiKeyGuard', () => {
  it('allows request when x-insights-api-key matches', () => {
    const guard = new InsightsApiKeyGuard('test-secret-key');
    const context = makeMockContext({ 'x-insights-api-key': 'test-secret-key' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws 401 when x-insights-api-key does not match', () => {
    const guard = new InsightsApiKeyGuard('test-secret-key');
    const context = makeMockContext({ 'x-insights-api-key': 'wrong-key' });
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    try {
      guard.canActivate(context);
    } catch (err) {
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it('throws 401 when x-insights-api-key header is missing', () => {
    const guard = new InsightsApiKeyGuard('test-secret-key');
    const context = makeMockContext({});
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it('throws 401 when configured key is empty', () => {
    const guard = new InsightsApiKeyGuard('');
    const context = makeMockContext({ 'x-insights-api-key': 'any-key' });
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });
});