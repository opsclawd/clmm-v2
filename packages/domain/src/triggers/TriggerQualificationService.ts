import type { PositionId, BreachDirection, ClockTimestamp } from '../shared/index.js';
import type { BreachEpisodeId, ExitTrigger, ExitTriggerId } from './index.js';

export const MVP_CONFIRMATION_THRESHOLD = 3;

export type ThresholdEvaluation =
  | { readonly kind: 'met' }
  | {
      readonly kind: 'not-met';
      readonly reason: string;
    };

export function evaluateConfirmationThreshold(count: number): ThresholdEvaluation {
  if (count < MVP_CONFIRMATION_THRESHOLD) {
    return {
      kind: 'not-met',
      reason: `confirmation threshold not met: need ${MVP_CONFIRMATION_THRESHOLD} consecutive observations, got ${count}`,
    };
  }

  return { kind: 'met' };
}

export function buildExitTrigger(params: {
  readonly triggerId: ExitTriggerId;
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly observedAt: ClockTimestamp;
  readonly episodeId: BreachEpisodeId;
}): ExitTrigger {
  return {
    triggerId: params.triggerId,
    positionId: params.positionId,
    breachDirection: params.direction,
    triggeredAt: params.observedAt,
    confirmationEvaluatedAt: params.observedAt,
    confirmationPassed: true,
    episodeId: params.episodeId,
  };
}
