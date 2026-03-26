import type { PositionId, BreachDirection, ClockTimestamp } from '../shared/index.js';
import type { BreachEpisodeId, ExitTrigger, ExitTriggerId } from './index.js';

const MVP_CONFIRMATION_THRESHOLD = 3;

export type BreachObservation = {
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly observedAt: ClockTimestamp;
  readonly episodeId: string;
  readonly consecutiveOutOfRangeCount: number;
  readonly existingTriggerIdForEpisode?: string;
};

export type TriggerQualificationResult =
  | {
      readonly kind: 'qualified';
      readonly trigger: ExitTrigger;
    }
  | {
      readonly kind: 'not-qualified';
      readonly reason: string;
    }
  | {
      readonly kind: 'duplicate-suppressed';
      readonly existingTriggerId: string;
    };

export function qualifyTrigger(
  observation: BreachObservation,
): TriggerQualificationResult {
  if (observation.existingTriggerIdForEpisode != null) {
    return {
      kind: 'duplicate-suppressed',
      existingTriggerId: observation.existingTriggerIdForEpisode,
    };
  }

  if (observation.consecutiveOutOfRangeCount < MVP_CONFIRMATION_THRESHOLD) {
    return {
      kind: 'not-qualified',
      reason: `confirmation threshold not met: need ${MVP_CONFIRMATION_THRESHOLD} consecutive observations, got ${observation.consecutiveOutOfRangeCount}`,
    };
  }

  const trigger: ExitTrigger = {
    triggerId: `trigger-${observation.positionId}-${observation.observedAt}` as ExitTriggerId,
    positionId: observation.positionId,
    breachDirection: observation.direction,
    triggeredAt: observation.observedAt,
    confirmationEvaluatedAt: observation.observedAt,
    confirmationPassed: true,
    episodeId: observation.episodeId as BreachEpisodeId,
  };

  return { kind: 'qualified', trigger };
}
