import { describe, it, expect, beforeEach } from 'vitest';
import { listActionableAlerts } from './ListActionableAlerts.js';
import {
  FakeTriggerRepository,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTrigger, ExitTriggerId, BreachEpisodeId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

function makeFixtureTrigger(): ExitTrigger {
  return {
    triggerId: 'trigger-alert-1' as ExitTriggerId,
    positionId: FIXTURE_POSITION_ID,
    breachDirection: LOWER_BOUND_BREACH,
    triggeredAt: makeClockTimestamp(1_000_000),
    confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
    confirmationPassed: true,
    episodeId: 'ep-alert-1' as BreachEpisodeId,
  };
}

describe('ListActionableAlerts', () => {
  let triggerRepo: FakeTriggerRepository;

  beforeEach(() => {
    triggerRepo = new FakeTriggerRepository();
  });

  it('returns empty list when no triggers exist', async () => {
    const result = await listActionableAlerts({ walletId: FIXTURE_WALLET_ID, triggerRepo });
    expect(result.triggers).toHaveLength(0);
  });

  it('returns triggers that have been saved', async () => {
    const trigger = makeFixtureTrigger();
    triggerRepo.triggers.set(trigger.triggerId, trigger);
    const result = await listActionableAlerts({ walletId: FIXTURE_WALLET_ID, triggerRepo });
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]?.breachDirection.kind).toBe('lower-bound-breach');
  });

  it('includes triggerId and positionId in results', async () => {
    const trigger = makeFixtureTrigger();
    triggerRepo.triggers.set(trigger.triggerId, trigger);
    const result = await listActionableAlerts({ walletId: FIXTURE_WALLET_ID, triggerRepo });
    expect(result.triggers[0]?.triggerId).toBeDefined();
    expect(result.triggers[0]?.positionId).toBe(FIXTURE_POSITION_ID);
  });

  it('passes walletId through to the repository lookup', async () => {
    await listActionableAlerts({ walletId: FIXTURE_WALLET_ID, triggerRepo });
    expect(triggerRepo.lastListedWalletId).toBe(FIXTURE_WALLET_ID);
  });
});
