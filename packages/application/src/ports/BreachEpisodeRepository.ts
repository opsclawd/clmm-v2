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
  | { readonly kind: 'no-op' }
  | {
      readonly kind: 'episode-closed-recovered';
      readonly closedEpisodeId: BreachEpisodeId;
      readonly direction: BreachDirection;
    }
  | {
      readonly kind: 'episode-started';
      readonly episodeId: BreachEpisodeId;
      readonly direction: BreachDirection;
      readonly consecutiveCount: number;
    }
  | {
      readonly kind: 'episode-continued';
      readonly episodeId: BreachEpisodeId;
      readonly direction: BreachDirection;
      readonly consecutiveCount: number;
    }
  | {
      readonly kind: 'episode-reversed';
      readonly closedEpisodeId: BreachEpisodeId;
      readonly oldDirection: BreachDirection;
      readonly newEpisodeId: BreachEpisodeId;
      readonly newDirection: BreachDirection;
      readonly consecutiveCount: number;
    };

export type FinalizationResult =
  | { readonly kind: 'qualified'; readonly triggerId: ExitTriggerId }
  | { readonly kind: 'duplicate-suppressed'; readonly existingTriggerId: ExitTriggerId };

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
