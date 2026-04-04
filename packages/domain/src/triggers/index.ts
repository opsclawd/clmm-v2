import type {
  PositionId,
  BreachDirection,
  ClockTimestamp,
} from '../shared/index.js';

export type BreachEpisodeId = string & { readonly _brand: 'BreachEpisodeId' };
export type ExitTriggerId = string & { readonly _brand: 'ExitTriggerId' };

export type BreachEpisodeStatus = 'open' | 'closed';
export type EpisodeCloseReason = 'position-recovered' | 'direction-reversed';

export type BreachEpisode = {
  readonly episodeId: BreachEpisodeId;
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly status: BreachEpisodeStatus;
  readonly startedAt: ClockTimestamp;
  readonly lastObservedAt: ClockTimestamp;
  readonly consecutiveCount: number;
  readonly triggerId: ExitTriggerId | null;
  readonly closedAt: ClockTimestamp | null;
  readonly closeReason: EpisodeCloseReason | null;
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
