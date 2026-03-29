import { describe, it, expect, beforeEach } from 'vitest';
import { acknowledgeAlert } from './AcknowledgeAlert.js';
import { FakeTriggerRepository, FIXTURE_POSITION_ID } from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { ExitTrigger, ExitTriggerId, BreachEpisodeId, WalletId } from '@clmm/domain';

function makeFixtureTrigger(id: string): ExitTrigger {
  return {
    triggerId: id as ExitTriggerId,
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    triggeredAt: makeClockTimestamp(1_000_000),
    confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
    confirmationPassed: true,
    episodeId: 'ep-ack-1' as BreachEpisodeId,
  };
}

describe('AcknowledgeAlert', () => {
  let triggerRepo: FakeTriggerRepository;

  beforeEach(async () => {
    triggerRepo = new FakeTriggerRepository();
    await triggerRepo.saveTrigger(makeFixtureTrigger('trigger-ack-1'));
  });

  it('acknowledges an existing trigger and removes it', async () => {
    const result = await acknowledgeAlert({
      triggerId: 'trigger-ack-1' as ExitTriggerId,
      triggerRepo,
    });
    expect(result.kind).toBe('acknowledged');
    expect(triggerRepo.triggers.size).toBe(0);
  });

  it('returns not-found for an unknown triggerId', async () => {
    const result = await acknowledgeAlert({
      triggerId: 'no-such-trigger' as ExitTriggerId,
      triggerRepo,
    });
    expect(result.kind).toBe('not-found');
  });

  it('trigger no longer appears in listActionableTriggers after acknowledgement', async () => {
    await acknowledgeAlert({ triggerId: 'trigger-ack-1' as ExitTriggerId, triggerRepo });
    const remaining = await triggerRepo.listActionableTriggers('any-wallet' as WalletId);
    expect(remaining).toHaveLength(0);
  });
});
