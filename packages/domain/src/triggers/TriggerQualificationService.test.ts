import { describe, it, expect } from 'vitest';
import {
  qualifyTrigger,
  type BreachObservation,
  type TriggerQualificationResult,
} from './TriggerQualificationService.js';
import {
  makePositionId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from '../shared/index.js';

const posId = makePositionId('pos-1');
const now = makeClockTimestamp(1_000_000);

const baseObservation: BreachObservation = {
  positionId: posId,
  direction: LOWER_BOUND_BREACH,
  observedAt: now,
  episodeId: 'episode-1',
  consecutiveOutOfRangeCount: 3,
};

describe('TriggerQualificationService', () => {
  describe('MVP confirmation rule: requires 3 consecutive out-of-range observations', () => {
    it('qualifies a lower-bound breach when count meets threshold', () => {
      const result = qualifyTrigger(baseObservation);
      expect(result.kind).toBe('qualified');
    });

    it('does not qualify when below threshold', () => {
      const result = qualifyTrigger({
        ...baseObservation,
        consecutiveOutOfRangeCount: 2,
      });
      expect(result.kind).toBe('not-qualified');
      if (result.kind === 'not-qualified') {
        expect(result.reason).toContain('confirmation');
      }
    });

    it('qualifies an upper-bound breach when count meets threshold', () => {
      const result = qualifyTrigger({
        ...baseObservation,
        direction: UPPER_BOUND_BREACH,
      });
      expect(result.kind).toBe('qualified');
    });

    it('preserves breach direction in qualified trigger', () => {
      const lower = qualifyTrigger({ ...baseObservation, direction: LOWER_BOUND_BREACH });
      const upper = qualifyTrigger({ ...baseObservation, direction: UPPER_BOUND_BREACH });
      expect(lower.kind).toBe('qualified');
      expect(upper.kind).toBe('qualified');
      if (lower.kind === 'qualified') {
        expect(lower.trigger.breachDirection.kind).toBe('lower-bound-breach');
      }
      if (upper.kind === 'qualified') {
        expect(upper.trigger.breachDirection.kind).toBe('upper-bound-breach');
      }
    });
  });

  describe('episode idempotency', () => {
    it('suppresses duplicate trigger for the same episode', () => {
      const existingTriggerId = 'trigger-existing';
      const result = qualifyTrigger({
        ...baseObservation,
        existingTriggerIdForEpisode: existingTriggerId,
      });
      expect(result.kind).toBe('duplicate-suppressed');
      if (result.kind === 'duplicate-suppressed') {
        expect(result.existingTriggerId).toBe(existingTriggerId);
      }
    });

    it('does not suppress when no existing trigger for episode', () => {
      const { existingTriggerIdForEpisode: _unused, ...observationWithoutTriggerId } = baseObservation;
      const result = qualifyTrigger(observationWithoutTriggerId);
      expect(result.kind).toBe('qualified');
    });
  });

  describe('qualified trigger has required fields', () => {
    it('trigger includes positionId, breachDirection, triggeredAt, confirmationEvaluatedAt', () => {
      const result = qualifyTrigger(baseObservation);
      expect(result.kind).toBe('qualified');
      if (result.kind === 'qualified') {
        const { trigger } = result;
        expect(trigger.positionId).toBe(posId);
        expect(trigger.breachDirection).toBe(LOWER_BOUND_BREACH);
        expect(typeof trigger.triggeredAt).toBe('number');
        expect(typeof trigger.confirmationEvaluatedAt).toBe('number');
        expect(trigger.confirmationPassed).toBe(true);
      }
    });
  });
});
