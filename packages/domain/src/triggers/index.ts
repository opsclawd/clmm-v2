import type {
  PositionId,
  BreachDirection,
  ClockTimestamp,
} from '../shared/index.js';

export type BreachEpisodeId = string & { readonly _brand: 'BreachEpisodeId' };
export type ExitTriggerId = string & { readonly _brand: 'ExitTriggerId' };

export type BreachEpisode = {
  readonly episodeId: BreachEpisodeId;
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly startedAt: ClockTimestamp;
  readonly lastObservedAt: ClockTimestamp;
  readonly activeTriggerId: ExitTriggerId | null;
};

export type ExitTrigger = {
  readonly triggerId: ExitTriggerId;
  readonly positionId: PositionId;
  readonly breachDirection: BreachDirection;
  readonly triggeredAt: ClockTimestamp;
  readonly confirmationEvaluatedAt: ClockTimestamp;
  readonly confirmationPassed: true;
  readonly episodeId: BreachEpisodeId;
};

export type ConfirmationEvaluation = {
  readonly passed: boolean;
  readonly reason: string;
  readonly evaluatedAt: ClockTimestamp;
};
