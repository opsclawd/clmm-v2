import { describe, it, expect } from 'vitest';
import { getSolUsdcInsightPositions } from './GetSolUsdcInsightPositions.js';
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
import type { SupportedPositionReadPort, PricePort } from '../../ports/index.js';

const SOL_USDC_POOL_ID = makePoolId('Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE');
const OTHER_POOL_ID = makePoolId('OtherPool11111111111111111111111111111111111');

const now = () => 1_700_000_000_000;

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

describe('getSolUsdcInsightPositions', () => {
  it('returns pool-unavailable when the pool snapshot fails', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([], {});
    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });
    expect(result.kind).toBe('pool-unavailable');
  });

  it('returns position-list-unavailable when listSupportedPositions throws', async () => {
    const positionReadPort = {
      listSupportedPositions: async () => { throw new Error('rpc unreachable'); },
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });
    expect(result.kind).toBe('position-list-unavailable');
  });

  it('filters out positions not in the allowlisted SOL/USDC pool and never reads their detail', async () => {
    const inPoolPosition = positionInPool('pos-in', SOL_USDC_POOL_ID);
    const outOfPoolPosition = positionInPool('pos-out', OTHER_POOL_ID);

    const detailReads: string[] = [];
    const positionReadPort = {
      listSupportedPositions: async () => [inPoolPosition, outOfPoolPosition],
      getPosition: async () => null,
      getPositionDetail: async (_w: never, positionId: string) => {
        detailReads.push(positionId);
        return detailFor(positionId, SOL_USDC_POOL_ID);
      },
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions).toHaveLength(1);
      expect(result.snapshot.positions[0]!.positionId).toBe('pos-in');
    }
    expect(detailReads).toEqual(['pos-in']);
  });

  it('returns an empty positions list with partial=false when no positions match', async () => {
    const onlyOther = positionInPool('pos-other', OTHER_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [onlyOther],
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions).toEqual([]);
      expect(result.snapshot.dataQuality.partial).toBe(false);
      expect(result.snapshot.dataQuality.warnings).toEqual([]);
    }
  });

  it('returns position-detail-unavailable with the failed positionId', async () => {
    const inPool = positionInPool('pos-broken', SOL_USDC_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [inPool],
      getPosition: async () => null,
      getPositionDetail: async () => null,
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort(),
      now,
    });

    expect(result.kind).toBe('position-detail-unavailable');
    if (result.kind === 'position-detail-unavailable') {
      expect(result.positionId).toBe('pos-broken');
    }
  });

  it('attaches actionable trigger fields and normalizes breachDirection', async () => {
    const inPool = positionInPool('pos-trig', SOL_USDC_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [inPool],
      getPosition: async () => null,
      getPositionDetail: async () => detailFor('pos-trig', SOL_USDC_POOL_ID),
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const triggerRepo = new FakeTriggerRepository();
    triggerRepo.triggers.set('trig-1', {
      triggerId: 'trig-1' as ExitTriggerId,
      positionId: makePositionId('pos-trig'),
      episodeId: 'ep-1' as BreachEpisodeId,
      breachDirection: { kind: 'upper-bound-breach' },
      triggeredAt: makeClockTimestamp(123),
      confirmationEvaluatedAt: makeClockTimestamp(124),
      confirmationPassed: true,
    });

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const p = result.snapshot.positions[0]!;
      expect(p.hasActionableTrigger).toBe(true);
      expect(p.triggerId).toBe('trig-1');
      expect(p.breachDirection).toBe('upper-bound-breach');
    }
  });

  it('adds actionable_triggers_unavailable warning when trigger fetch fails', async () => {
    const inPool = positionInPool('pos-trig', SOL_USDC_POOL_ID);
    const positionReadPort = {
      listSupportedPositions: async () => [inPool],
      getPosition: async () => null,
      getPositionDetail: async () => detailFor('pos-trig', SOL_USDC_POOL_ID),
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    const triggerRepo = {
      getTrigger: async () => null,
      listActionableTriggers: async () => { throw new Error('db down'); },
      deleteTrigger: async () => undefined,
    } as unknown as FakeTriggerRepository;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo,
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions[0]!.hasActionableTrigger).toBe(false);
      expect(result.snapshot.dataQuality.partial).toBe(true);
      expect(
        result.snapshot.dataQuality.warnings.find((w) => w.code === 'actionable_triggers_unavailable'),
      ).toBeDefined();
    }
  });

  it('reads position details sequentially (one in flight at a time)', async () => {
    const ids = ['a', 'b', 'c'];
    const positions = ids.map((id) => positionInPool(id, SOL_USDC_POOL_ID));
    let inFlight = 0;
    let maxInFlight = 0;

    const positionReadPort = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async (_w: never, positionId: string) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return detailFor(positionId, SOL_USDC_POOL_ID);
      },
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as FakeSupportedPositionReadPort;

    await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: new FakePricePort([FIXTURE_SOL_PRICE_QUOTE, FIXTURE_USDC_PRICE_QUOTE]),
      now,
    });

    expect(maxInFlight).toBe(1);
  });

  it('returns ok with null fee USD and warnings when price port throws', async () => {
    const positions = [positionInPool('pos-1', SOL_USDC_POOL_ID)];
    const positionReadPort = {
      listSupportedPositions: async () => positions,
      getPosition: async () => null,
      getPositionDetail: async () => detailFor('pos-1', SOL_USDC_POOL_ID),
      getPoolData: async () => poolDataFor(SOL_USDC_POOL_ID),
    } as unknown as SupportedPositionReadPort;
    const throwingPricePort = {
      getPrices: async () => { throw new Error('price rpc failed'); },
    } as unknown as PricePort;

    const result = await getSolUsdcInsightPositions({
      walletId: FIXTURE_POSITION_IN_RANGE.walletId,
      poolId: SOL_USDC_POOL_ID,
      positionReadPort,
      triggerRepo: new FakeTriggerRepository(),
      pricePort: throwingPricePort,
      now,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.snapshot.positions).toHaveLength(1);
      expect(result.snapshot.positions[0]!.unclaimedFeesUsd).toBeNull();
      expect(result.snapshot.dataQuality.warnings.find((w) => w.code === 'fee_reward_usd_unavailable')).toBeDefined();
    }
  });
});