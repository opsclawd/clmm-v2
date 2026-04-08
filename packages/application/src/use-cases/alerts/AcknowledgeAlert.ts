import type { TriggerRepository } from '../../ports/index.js';
import type { ExitTriggerId } from '@clmm/domain';

export type AcknowledgeAlertResult =
  | { kind: 'acknowledged' }
  | { kind: 'not-found' };

export async function acknowledgeAlert(params: {
  triggerId: ExitTriggerId;
  triggerRepo: TriggerRepository;
}): Promise<AcknowledgeAlertResult> {
  const trigger = await params.triggerRepo.getTrigger(params.triggerId);
  if (!trigger) return { kind: 'not-found' };
  await params.triggerRepo.deleteTrigger(params.triggerId);
  return { kind: 'acknowledged' };
}
