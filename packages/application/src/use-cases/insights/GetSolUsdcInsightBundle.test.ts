import { describe, it, expect } from 'vitest';
import { getSolUsdcInsightBundle } from './GetSolUsdcInsightBundle.js';
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
import {
  makePoolId,
  makePositionId,
  makeClockTimestamp,
} from '@clmm/domain';
import type {
  BreachEpisodeId,
  ExitTriggerId,
  PositionDetail,
} from '@clmm/domain';
import type { SrLevelsReadPort } from '../../ports/index.js';
import type { SrLevelsBlock } from '../../dto/index.js';

const SOL_USDC_POOL_ID = makePoolId('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
const OTHER_POOL_ID = makePoolId('OtherPool11111111111111111111111111111111111');

const now = () => 1_700_000_000_000;

const SR_LEVELS_LOOKUP = { symbol: 'SOL/USDC', source: 'mco' };

function poolDataFor(poolId: typeof SOL_USDC_POOL_ID) {
  return { ...FIXTURE_POOL_DATA, poolId };
}

function positionInPool(positionId: string, poolId: typeof SOL_USDC_POOL_ID) {
  return {
    ...FIXTURE_POSITION_IN_RANGE,
    positionId: makePositionId(positionId),
    poolId,
  };
}

function detailFor(positionId: string, poolId: typeof SOL_USDC_POOL_ID): PositionDetail {
  return {
    ...FIXTURE_POSITION_DETAIL,
    position: positionInPool(positionId, poolId),
    poolData: poolDataFor(poolId),
  };
}

function srBlock(): SrLevelsBlock {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: '2026-04-30T00:00:00Z',
    summary: 'test',
    capturedAtUnixMs: 1_700_000_000_000,
    supports: [{ price: 130 }],
    resistances: [{ price: 160 }],
  };
}

function makeSrPort(impl: SrLevelsReadPort['fetchCurrent']): SrLevelsReadPort {
  return { fetchCurrent: impl };
}

const samplePositionPort = (positions: ReturnType<typeof positionInPool>[]) =>
  ({
    listSupportedPositions: async () => positions,
    getPosition: async () => null,
    getPositionDetail: async (_w: never, positionId: string) =>
      detailFor(positionId, SOL_USDC_POOL_ID),
    getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
  }) as unknown as FakeSupportedPositionReadPort;

describe('getSolUsdcInsightBundle', () => {
  it('returns ok with pool, top-level srLevels, positions, and alerts', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trig-1', {
      triggerId: 'trig-1' as ExitTriggerId,
      positionId: makePositionId('pos-1'),
      episodeId: 'ep-1' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(123),
      confirmationEvaluatedAt: makeClockTimestamp(124),
      confirmationPassed: true,
    });

    const block = srBlock();
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => block),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.pair).toBe('SOL/USDC');
      expect(result.bundle.source).toBe('orca');
      expect(result.bundle.observedAtUnixMs).toBe(1_700_000_000_000);
      expect(result.bundle.pool.poolId).toBe(SOL_USDC_POOL_ID);
      expect(result.bundle.srLevels).toEqual(block);
      expect(result.bundle.positions).toHaveLength(1);
      expect(result.bundle.alerts).toHaveLength(1);
      expect(result.bundle.alerts[0]).toEqual({
        triggerId: 'trig-1',
        positionId: 'pos-1',
        breachDirection: 'lower-bound-breach',
        triggeredAt: 123,
      });
      expect(result.bundle.dataQuality.partial).toBe(false);
      expect(result.bundle.dataQuality.warnings).toEqual([]);
    }
  });

  it('does not copy srLevels onto each position', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => srBlock()),
      now,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const p = result.bundle.positions[0] as Record<string, unknown>;
      expect(p['srLevels']).toBeUndefined();
    }
  });

  it('sets srLevels=null and adds sr_levels_unavailable warning when fetchCurrent throws', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => { throw new Error('rpc'); }),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.srLevels).toBeNull();
      expect(result.bundle.dataQuality.partial).toBe(true);
      expect(
        result.bundle.dataQuality.warnings.find((w) => w.code === 'sr_levels_unavailable'),
      ).toBeDefined();
    }
  });

  it('sets srLevels=null without a warning when fetchCurrent resolves null', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.srLevels).toBeNull();
      expect(
        result.bundle.dataQuality.warnings.find((w) => w.code === 'sr_levels_unavailable'),
      ).toBeUndefined();
    }
  });

  it('excludes alerts whose positionId is outside the filtered allowlisted set', async () => {
    const positions = [positionInPool('pos-in', SOL_USDC_POOL_ID), positionInPool('pos-out', OTHER_POOL_ID)];
    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trig-out', {
      triggerId: 'trig-out' as ExitTriggerId,
      positionId: makePositionId('pos-out'),
      episodeId: 'ep-out' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(99),
      confirmationEvaluatedAt: makeClockTimestamp(100),
      confirmationPassed: true,
    });

    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: samplePositionPort(positions),
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.bundle.positions.map((p) => p.positionId)).toEqual(['pos-in']);
      expect(result.bundle.alerts).toEqual([]);
    }
  });

  it('propagates pool-unavailable from the positions stage', async () => {
    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: new FakeSupportedPositionReadPort([], {}),
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('propagates position-detail-unavailable with the failed positionId', async () => {
    const positions = [positionInPool('pos-broken', SOL_USDC_POOL_ID)];
    const port = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightBundle({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      srLevelsLookup: SR_LEVELS_LOOKUP,
      positionReadPort: port,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      srLevelsReadPort: makeSrPort(async () => null),
      now,
    });
    expect(result.kind).toBe('position-detail-unavailable');
    if (result.kind === 'position-detail-unavailable') {
      expect(result.positionId).toBe('pos-broken');
    }
  });
});