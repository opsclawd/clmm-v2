import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PositionPlanRequestJobHandler } from './PositionPlanRequestJobHandler.js';
import {
  FakeSupportedPositionReadPort,
  FakeTriggerRepository,
  FakePlanRepository,
  FakeRegimePlanPort,
  FakeExecutionHistoryRepository,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeObservabilityPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_ID,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';
import type { ResolveRegimePlanRequestConfigResult } from '@clmm/application';

import inRangeFixture from '../../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

describe('PositionPlanRequestJobHandler', () => {
  let positionReadPort: FakeSupportedPositionReadPort;
  let triggerRepo: FakeTriggerRepository;
  let planRepo: FakePlanRepository;
  let regimePlanPort: FakeRegimePlanPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let config: ResolveRegimePlanRequestConfigResult;

  beforeEach(() => {
    positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    triggerRepo = new FakeTriggerRepository();
    planRepo = new FakePlanRepository();
    regimePlanPort = new FakeRegimePlanPort();
    historyRepo = new FakeExecutionHistoryRepository();
    clock = new FakeClockPort(1_000_000);
    ids = new FakeIdGeneratorPort('plan-job');
    observability = new FakeObservabilityPort();
    config = {
      kind: 'configured',
      config: inRangeFixture.config,
    };
  });

  function buildHandler(): PositionPlanRequestJobHandler {
    return new PositionPlanRequestJobHandler(
      positionReadPort,
      triggerRepo,
      planRepo,
      regimePlanPort,
      historyRepo,
      clock,
      ids,
      observability,
      config,
    );
  }

  it('handler passes wallet and position to RequestPositionPlan', async () => {
    const handler = buildHandler();
    const getPositionSpy = vi.spyOn(positionReadPort, 'getPosition');

    await handler.handle({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
    });

    expect(getPositionSpy).toHaveBeenCalledWith(FIXTURE_WALLET_ID, FIXTURE_POSITION_ID);
  });

  it('handler treats typed degradation as a completed job', async () => {
    const handler = buildHandler();
    // Simulate degraded status by asking for plan of non-existent position
    await handler.handle({
      walletId: FIXTURE_WALLET_ID,
      positionId: 'non-existent-position' as unknown as typeof FIXTURE_POSITION_ID,
    });

    // Should complete without throwing, logging info/warn
    const logs = observability.logs;
    expect(logs.some((l) => l.message.includes('PositionPlanRequestJobHandler completed'))).toBe(
      true,
    );
  });

  it('handler rethrows unexpected errors for pg-boss retry', async () => {
    const handler = buildHandler();
    vi.spyOn(positionReadPort, 'getPosition').mockRejectedValueOnce(
      new Error('Database network error'),
    );

    await expect(
      handler.handle({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
      }),
    ).rejects.toThrow('Database network error');
  });
});
