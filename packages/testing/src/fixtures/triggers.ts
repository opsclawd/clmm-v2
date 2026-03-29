import type { BreachEpisode, BreachEpisodeId, ExitTrigger, ExitTriggerId } from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import { FIXTURE_POSITION_ID } from './positions.js';

export const FIXTURE_BREACH_EPISODE_ID = 'fixture-episode-1' as BreachEpisodeId;
export const FIXTURE_EXIT_TRIGGER_ID = 'fixture-trigger-1' as ExitTriggerId;

export const FIXTURE_LOWER_BREACH_EPISODE: BreachEpisode = {
  episodeId: FIXTURE_BREACH_EPISODE_ID,
  positionId: FIXTURE_POSITION_ID,
  direction: LOWER_BOUND_BREACH,
  startedAt: makeClockTimestamp(900_000),
  lastObservedAt: makeClockTimestamp(1_000_000),
  activeTriggerId: FIXTURE_EXIT_TRIGGER_ID,
};

export const FIXTURE_LOWER_EXIT_TRIGGER: ExitTrigger = {
  triggerId: FIXTURE_EXIT_TRIGGER_ID,
  positionId: FIXTURE_POSITION_ID,
  breachDirection: LOWER_BOUND_BREACH,
  triggeredAt: makeClockTimestamp(1_000_000),
  confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
  confirmationPassed: true,
  episodeId: FIXTURE_BREACH_EPISODE_ID,
};

export const FIXTURE_UPPER_EXIT_TRIGGER: ExitTrigger = {
  triggerId: 'fixture-trigger-2' as ExitTriggerId,
  positionId: FIXTURE_POSITION_ID,
  breachDirection: UPPER_BOUND_BREACH,
  triggeredAt: makeClockTimestamp(1_000_000),
  confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
  confirmationPassed: true,
  episodeId: 'fixture-episode-2' as BreachEpisodeId,
};
