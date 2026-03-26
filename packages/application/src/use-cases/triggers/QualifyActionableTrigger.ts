import type { TriggerRepository, ClockPort, IdGeneratorPort } from '../../ports/index.js';
import { qualifyTrigger } from '@clmm/domain';
import type { ExitTrigger, BreachEpisode, BreachEpisodeId, ExitTriggerId } from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

export type QualifyResult =
  | { kind: 'trigger-created'; trigger: ExitTrigger }
  | { kind: 'not-qualified'; reason: string }
  | { kind: 'duplicate-suppressed'; existingTriggerId: ExitTriggerId };

export async function qualifyActionableTrigger(params: {
  observation: BreachObservationResult;
  consecutiveCount: number;
  triggerRepo: TriggerRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<QualifyResult> {
  const { observation, consecutiveCount, triggerRepo, clock, ids } = params;

  const existingId = await triggerRepo.getActiveEpisodeTrigger(
    observation.episodeId as BreachEpisodeId,
  );

  const domainResult = qualifyTrigger({
    positionId: observation.positionId,
    direction: observation.direction,
    observedAt: clock.now(),
    episodeId: observation.episodeId,
    consecutiveOutOfRangeCount: consecutiveCount,
    ...(existingId != null && { existingTriggerIdForEpisode: existingId }),
  });

  if (domainResult.kind === 'not-qualified') {
    return { kind: 'not-qualified', reason: domainResult.reason };
  }

  if (domainResult.kind === 'duplicate-suppressed') {
    return {
      kind: 'duplicate-suppressed',
      existingTriggerId: domainResult.existingTriggerId as ExitTriggerId,
    };
  }

  await triggerRepo.saveTrigger(domainResult.trigger);

  const episode: BreachEpisode = {
    episodeId: observation.episodeId as BreachEpisodeId,
    positionId: observation.positionId,
    direction: observation.direction,
    startedAt: observation.observedAt,
    lastObservedAt: clock.now(),
    activeTriggerId: domainResult.trigger.triggerId,
  };
  await triggerRepo.saveEpisode(episode);

  return { kind: 'trigger-created', trigger: domainResult.trigger };
}
