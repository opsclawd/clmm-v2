import type { TriggerRepository } from '../../ports/index.js';
import type { WalletId, ExitTrigger } from '@clmm/domain';

export type ListActionableAlertsResult = {
  triggers: ExitTrigger[];
};

export async function listActionableAlerts(params: {
  walletId: WalletId;
  triggerRepo: TriggerRepository;
}): Promise<ListActionableAlertsResult> {
  const triggers = await params.triggerRepo.listActionableTriggers(params.walletId);
  return { triggers };
}
