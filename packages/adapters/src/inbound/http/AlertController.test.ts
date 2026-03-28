import { describe, it, expect } from 'vitest';
import { AlertController } from './AlertController.js';
import { FakeSupportedPositionReadPort, FakeTriggerRepository, FIXTURE_POSITION_IN_RANGE } from '@clmm/testing';
import { makeClockTimestamp, makePositionId } from '@clmm/domain';
import type { SupportedPositionReadPort, TriggerRepository } from '@clmm/application';
import type { BreachEpisodeId, ExitTriggerId } from '@clmm/domain';

const otherPositionId = makePositionId('other-wallet-position');

describe('AlertController', () => {
  it('filters actionable alerts to positions owned by the requested wallet', async () => {
    const triggerRepo = new FakeTriggerRepository();
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const controller = new AlertController(
      triggerRepo as unknown as TriggerRepository,
      positionReadPort as unknown as SupportedPositionReadPort,
    );

    await triggerRepo.saveTrigger({
      triggerId: 'trigger-owned' as ExitTriggerId,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: 'episode-owned' as BreachEpisodeId,
      breachDirection: { kind: 'lower-bound-breach' },
      triggeredAt: makeClockTimestamp(1_000_000),
      confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
      confirmationPassed: true,
    });
    await triggerRepo.saveTrigger({
      triggerId: 'trigger-leaked' as ExitTriggerId,
      positionId: otherPositionId,
      episodeId: 'episode-leaked' as BreachEpisodeId,
      breachDirection: { kind: 'upper-bound-breach' },
      triggeredAt: makeClockTimestamp(1_000_002),
      confirmationEvaluatedAt: makeClockTimestamp(1_000_003),
      confirmationPassed: true,
    });

    const result = await controller.listAlerts(FIXTURE_POSITION_IN_RANGE.walletId);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.triggerId).toBe('trigger-owned');
  });
});
