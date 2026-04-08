import type {
  SupportedPositionReadPort,
  ClockPort,
  BreachEpisodeRepository,
} from '../../ports/index.js';
import type {
  WalletId,
  BreachDirection,
  PositionId,
  BreachEpisodeId,
  ClockTimestamp,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

export type BreachObservationResult = {
  positionId: PositionId;
  direction: BreachDirection;
  observedAt: ClockTimestamp;
  episodeId: BreachEpisodeId;
  consecutiveCount: number;
};

export type AbandonmentDirective = {
  positionId: PositionId;
  episodeId: BreachEpisodeId;
  reason: 'position-recovered' | 'direction-reversed';
};

export type ScanResult = {
  observations: BreachObservationResult[];
  abandonments: AbandonmentDirective[];
};

export async function scanPositionsForBreaches(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
  clock: ClockPort;
  episodeRepo: BreachEpisodeRepository;
}): Promise<ScanResult> {
  const { walletId, positionReadPort, clock, episodeRepo } = params;
  const positions = await positionReadPort.listSupportedPositions(walletId);
  const now = makeClockTimestamp(Math.floor(clock.now() / 60_000) * 60_000);
  const observations: BreachObservationResult[] = [];
  const abandonments: AbandonmentDirective[] = [];

  for (const position of positions) {
    const rangeKind = position.rangeState.kind;

    if (rangeKind === 'in-range') {
      const transition = await episodeRepo.recordInRange(position.positionId, now);
      if (transition.kind === 'episode-closed-recovered') {
        abandonments.push({
          positionId: position.positionId,
          episodeId: transition.closedEpisodeId,
          reason: 'position-recovered',
        });
      }
      continue;
    }

    const direction: BreachDirection =
      rangeKind === 'below-range' ? LOWER_BOUND_BREACH : UPPER_BOUND_BREACH;
    const transition = await episodeRepo.recordOutOfRange(position.positionId, direction, now);

    if (transition.kind === 'episode-reversed') {
      abandonments.push({
        positionId: position.positionId,
        episodeId: transition.closedEpisodeId,
        reason: 'direction-reversed',
      });
      observations.push({
        positionId: position.positionId,
        direction: transition.newDirection,
        observedAt: now,
        episodeId: transition.newEpisodeId,
        consecutiveCount: transition.consecutiveCount,
      });
    } else if (transition.kind === 'episode-started' || transition.kind === 'episode-continued') {
      observations.push({
        positionId: position.positionId,
        direction: transition.direction,
        observedAt: now,
        episodeId: transition.episodeId,
        consecutiveCount: transition.consecutiveCount,
      });
    }
  }

  return { observations, abandonments };
}
