import type {
  PositionId,
  BreachDirection,
  BreachEpisodeId,
  ClockTimestamp,
  BreachEpisode,
  ExitTrigger,
  ExitTriggerId,
} from '@clmm/domain';

export type EpisodeTransition =
  | { kind: 'no-op' }
  | {
      kind: 'episode-closed-recovered';
      closedEpisodeId: BreachEpisodeId;
      direction: BreachDirection;
    }
  | {
      kind: 'episode-started';
      episodeId: BreachEpisodeId;
      direction: BreachDirection;
      consecutiveCount: number;
    }
  | {
      kind: 'episode-continued';
      episodeId: BreachEpisodeId;
      direction: BreachDirection;
      consecutiveCount: number;
    }
  | {
      kind: 'episode-reversed';
      closedEpisodeId: BreachEpisodeId;
      oldDirection: BreachDirection;
      newEpisodeId: BreachEpisodeId;
      newDirection: BreachDirection;
      consecutiveCount: number;
    };

export type FinalizationResult =
  | { kind: 'qualified'; triggerId: ExitTriggerId }
  | { kind: 'duplicate-suppressed'; existingTriggerId: ExitTriggerId };

export interface BreachEpisodeRepository {
  recordInRange(positionId: PositionId, observedAt: ClockTimestamp): Promise<EpisodeTransition>;
  recordOutOfRange(
    positionId: PositionId,
    direction: BreachDirection,
    observedAt: ClockTimestamp,
  ): Promise<EpisodeTransition>;
  getOpenEpisode(positionId: PositionId): Promise<BreachEpisode | null>;
  finalizeQualification(
    episodeId: BreachEpisodeId,
    trigger: ExitTrigger,
  ): Promise<FinalizationResult>;
}
