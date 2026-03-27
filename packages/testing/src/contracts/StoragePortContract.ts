/**
 * Contract test: any TriggerRepository implementation must satisfy these behaviors.
 * Import this in adapter-specific test files and pass the real adapter under test.
 */
import { describe, it, expect } from 'vitest';
import type { TriggerRepository } from '@clmm/application';
import {
  FIXTURE_POSITION_ID,
} from '../fixtures/positions.js';
import {
  LOWER_BOUND_BREACH,
  makeClockTimestamp,
} from '@clmm/domain';
import type { ExitTrigger, ExitTriggerId, BreachEpisodeId } from '@clmm/domain';

export function runTriggerRepositoryContract(
  factory: () => TriggerRepository,
): void {
  describe('TriggerRepository contract', () => {
    it('saves and retrieves a trigger', async () => {
      const repo = factory();
      const trigger: ExitTrigger = {
        triggerId: 'contract-trigger-1' as ExitTriggerId,
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        triggeredAt: makeClockTimestamp(1_000_000),
        confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
        confirmationPassed: true,
        episodeId: 'contract-ep-1' as BreachEpisodeId,
      };
      await repo.saveTrigger(trigger);
      const fetched = await repo.getTrigger('contract-trigger-1' as ExitTriggerId);
      expect(fetched?.triggerId).toBe('contract-trigger-1');
      expect(fetched?.breachDirection.kind).toBe('lower-bound-breach');
    });

    it('returns null for unknown trigger', async () => {
      const repo = factory();
      const result = await repo.getTrigger('nonexistent' as ExitTriggerId);
      expect(result).toBeNull();
    });

    it('suppresses duplicate episode via getActiveEpisodeTrigger', async () => {
      const repo = factory();
      const trigger: ExitTrigger = {
        triggerId: 'dup-trigger-1' as ExitTriggerId,
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        triggeredAt: makeClockTimestamp(1_000_000),
        confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
        confirmationPassed: true,
        episodeId: 'dup-ep-1' as BreachEpisodeId,
      };
      await repo.saveTrigger(trigger);
      await repo.saveEpisode({
        episodeId: 'dup-ep-1' as BreachEpisodeId,
        positionId: FIXTURE_POSITION_ID,
        direction: LOWER_BOUND_BREACH,
        startedAt: makeClockTimestamp(1_000_000),
        lastObservedAt: makeClockTimestamp(1_000_000),
        activeTriggerId: trigger.triggerId,
      });
      const existing = await repo.getActiveEpisodeTrigger('dup-ep-1' as BreachEpisodeId);
      expect(existing).toBe('dup-trigger-1');
    });
  });
}
