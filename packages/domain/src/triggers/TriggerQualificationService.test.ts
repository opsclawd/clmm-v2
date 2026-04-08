import { describe, it, expect } from 'vitest';
import {
  evaluateConfirmationThreshold,
  buildExitTrigger,
} from './TriggerQualificationService.js';
import {
  makePositionId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from '../shared/index.js';
import type { BreachEpisodeId, ExitTriggerId } from './index.js';

const posId = makePositionId('pos-1');
const now = makeClockTimestamp(1_000_000);

describe('TriggerQualificationService', () => {
  describe('evaluateConfirmationThreshold', () => {
    it('returns not-met for count below threshold', () => {
      const result = evaluateConfirmationThreshold(2);
      expect(result.kind).toBe('not-met');
      if (result.kind === 'not-met') {
        expect(result.reason).toContain('confirmation');
      }
    });

    it('returns met for count at threshold', () => {
      const result = evaluateConfirmationThreshold(3);
      expect(result).toEqual({ kind: 'met' });
    });

    it('returns met for count above threshold', () => {
      const result = evaluateConfirmationThreshold(4);
      expect(result).toEqual({ kind: 'met' });
    });
  });

  describe('buildExitTrigger', () => {
    it('builds trigger with required shape for lower breach', () => {
      const trigger = buildExitTrigger({
        triggerId: 'trigger-1' as ExitTriggerId,
        positionId: posId,
        direction: LOWER_BOUND_BREACH,
        observedAt: now,
        episodeId: 'episode-1' as BreachEpisodeId,
      });

      expect(trigger).toEqual({
        triggerId: 'trigger-1',
        positionId: posId,
        breachDirection: LOWER_BOUND_BREACH,
        triggeredAt: now,
        confirmationEvaluatedAt: now,
        confirmationPassed: true,
        episodeId: 'episode-1',
      });
    });

    it('preserves upper breach direction', () => {
      const trigger = buildExitTrigger({
        triggerId: 'trigger-2' as ExitTriggerId,
        positionId: posId,
        direction: UPPER_BOUND_BREACH,
        observedAt: now,
        episodeId: 'episode-2' as BreachEpisodeId,
      });

      expect(trigger.breachDirection.kind).toBe('upper-bound-breach');
    });
  });
});
