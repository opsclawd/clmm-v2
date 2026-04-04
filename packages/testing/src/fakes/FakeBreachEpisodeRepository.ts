import type { BreachEpisodeRepository, EpisodeTransition, FinalizationResult } from '@clmm/application';
import type {
  BreachDirection,
  BreachEpisode,
  BreachEpisodeId,
  ClockTimestamp,
  ExitTrigger,
  PositionId,
} from '@clmm/domain';

export class FakeBreachEpisodeRepository implements BreachEpisodeRepository {
  static episodeCounter = 0;

  static resetCounter(): void {
    FakeBreachEpisodeRepository.episodeCounter = 0;
  }

  readonly episodes = new Map<string, BreachEpisode>();
  readonly openEpisodeIdsByPosition = new Map<string, string>();

  async recordInRange(positionId: PositionId, observedAt: ClockTimestamp): Promise<EpisodeTransition> {
    const openEpisode = this.getStoredOpenEpisode(positionId);
    if (!openEpisode) {
      return { kind: 'no-op' };
    }

    const closeTimestamp =
      Number(observedAt) > Number(openEpisode.lastObservedAt)
        ? observedAt
        : openEpisode.lastObservedAt;

    const closedEpisode: BreachEpisode = {
      ...openEpisode,
      status: 'closed',
      lastObservedAt: closeTimestamp,
      closedAt: closeTimestamp,
      closeReason: 'position-recovered',
    };

    this.episodes.set(openEpisode.episodeId, closedEpisode);
    this.openEpisodeIdsByPosition.delete(positionId);

    return {
      kind: 'episode-closed-recovered',
      closedEpisodeId: openEpisode.episodeId,
      direction: openEpisode.direction,
    };
  }

  async recordOutOfRange(
    positionId: PositionId,
    direction: BreachDirection,
    observedAt: ClockTimestamp,
  ): Promise<EpisodeTransition> {
    const openEpisode = this.getStoredOpenEpisode(positionId);

    if (!openEpisode) {
      return this.startEpisode(positionId, direction, observedAt, 'episode-started');
    }

    if (openEpisode.direction.kind === direction.kind) {
      if (Number(observedAt) <= Number(openEpisode.lastObservedAt)) {
        return { kind: 'no-op' };
      }

      const continuedEpisode: BreachEpisode = {
        ...openEpisode,
        lastObservedAt: observedAt,
        consecutiveCount: openEpisode.consecutiveCount + 1,
      };

      this.episodes.set(openEpisode.episodeId, continuedEpisode);

      return {
        kind: 'episode-continued',
        episodeId: openEpisode.episodeId,
        direction,
        consecutiveCount: continuedEpisode.consecutiveCount,
      };
    }

    const closedEpisode: BreachEpisode = {
      ...openEpisode,
      status: 'closed',
      lastObservedAt: observedAt,
      closedAt: observedAt,
      closeReason: 'direction-reversed',
    };
    this.episodes.set(openEpisode.episodeId, closedEpisode);
    this.openEpisodeIdsByPosition.delete(positionId);

    const started = this.createOpenEpisode(positionId, direction, observedAt);
    this.episodes.set(started.episodeId, started);
    this.openEpisodeIdsByPosition.set(positionId, started.episodeId);

    return {
      kind: 'episode-reversed',
      closedEpisodeId: openEpisode.episodeId,
      oldDirection: openEpisode.direction,
      newEpisodeId: started.episodeId,
      newDirection: direction,
      consecutiveCount: started.consecutiveCount,
    };
  }

  async getOpenEpisode(positionId: PositionId): Promise<BreachEpisode | null> {
    const openEpisode = this.getStoredOpenEpisode(positionId);
    if (!openEpisode) {
      return null;
    }

    return { ...openEpisode };
  }

  async finalizeQualification(episodeId: BreachEpisodeId, trigger: ExitTrigger): Promise<FinalizationResult> {
    const episode = this.episodes.get(episodeId);
    if (!episode) {
      throw new Error(`Unknown breach episode: ${episodeId}`);
    }

    if (episode.triggerId) {
      return {
        kind: 'duplicate-suppressed',
        existingTriggerId: episode.triggerId,
      };
    }

    this.episodes.set(episodeId, {
      ...episode,
      triggerId: trigger.triggerId,
    });

    return {
      kind: 'qualified',
      triggerId: trigger.triggerId,
    };
  }

  private startEpisode(
    positionId: PositionId,
    direction: BreachDirection,
    observedAt: ClockTimestamp,
    transitionKind: 'episode-started',
  ): EpisodeTransition {
    const episode = this.createOpenEpisode(positionId, direction, observedAt);
    this.episodes.set(episode.episodeId, episode);
    this.openEpisodeIdsByPosition.set(positionId, episode.episodeId);

    return {
      kind: transitionKind,
      episodeId: episode.episodeId,
      direction,
      consecutiveCount: episode.consecutiveCount,
    };
  }

  private createOpenEpisode(
    positionId: PositionId,
    direction: BreachDirection,
    observedAt: ClockTimestamp,
  ): BreachEpisode {
    return {
      episodeId: this.nextEpisodeId(),
      positionId,
      direction,
      status: 'open',
      startedAt: observedAt,
      lastObservedAt: observedAt,
      consecutiveCount: 1,
      triggerId: null,
      closedAt: null,
      closeReason: null,
    };
  }

  private getStoredOpenEpisode(positionId: PositionId): BreachEpisode | null {
    const episodeId = this.openEpisodeIdsByPosition.get(positionId);
    if (!episodeId) {
      return null;
    }

    return this.episodes.get(episodeId) ?? null;
  }

  private nextEpisodeId(): BreachEpisodeId {
    FakeBreachEpisodeRepository.episodeCounter += 1;
    return `episode-${FakeBreachEpisodeRepository.episodeCounter}` as BreachEpisodeId;
  }
}
