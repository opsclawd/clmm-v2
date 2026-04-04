import type { BreachEpisodeRepository, IdGeneratorPort } from '../../ports/index.js';
import {
  evaluateConfirmationThreshold,
  buildExitTrigger,
  type ExitTrigger,
  type ExitTriggerId,
} from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

export type QualifyResult =
  | { kind: 'trigger-created'; trigger: ExitTrigger }
  | { kind: 'not-qualified'; reason: string }
  | { kind: 'duplicate-suppressed'; existingTriggerId: ExitTriggerId };

export async function qualifyActionableTrigger(params: {
  observation: BreachObservationResult;
  episodeRepo: BreachEpisodeRepository;
  ids: IdGeneratorPort;
}): Promise<QualifyResult> {
  const { observation, episodeRepo, ids } = params;

  const thresholdResult = evaluateConfirmationThreshold(observation.consecutiveCount);
  if (thresholdResult.kind === 'not-met') {
    return { kind: 'not-qualified', reason: thresholdResult.reason };
  }

  const trigger = buildExitTrigger({
    triggerId: ids.generateId() as ExitTriggerId,
    positionId: observation.positionId,
    direction: observation.direction,
    observedAt: observation.observedAt,
    episodeId: observation.episodeId,
  });

  const finalization = await episodeRepo.finalizeQualification(observation.episodeId, trigger);
  if (finalization.kind === 'duplicate-suppressed') {
    return {
      kind: 'duplicate-suppressed',
      existingTriggerId: finalization.existingTriggerId,
    };
  }

  return { kind: 'trigger-created', trigger };
}
