import type { TriggerRepository } from '@clmm/application';
import type {
  ExitTrigger,
  ExitTriggerId,
  WalletId,
} from '@clmm/domain';

export class FakeTriggerRepository implements TriggerRepository {
  readonly triggers = new Map<string, ExitTrigger>();
  lastListedWalletId: WalletId | null = null;

  async getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    return this.triggers.get(triggerId) ?? null;
  }

  async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    this.lastListedWalletId = walletId;
    return Array.from(this.triggers.values());
  }

  async deleteTrigger(triggerId: ExitTriggerId): Promise<void> {
    this.triggers.delete(triggerId);
  }
}
