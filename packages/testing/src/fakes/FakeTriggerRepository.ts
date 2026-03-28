import type { TriggerRepository } from '@clmm/application';
import type {
  ExitTrigger,
  BreachEpisode,
  ExitTriggerId,
  BreachEpisodeId,
  WalletId,
} from '@clmm/domain';

export class FakeTriggerRepository implements TriggerRepository {
  readonly triggers = new Map<string, ExitTrigger>();
  readonly episodes = new Map<string, BreachEpisode>();
  readonly episodeTriggerMap = new Map<string, string>();
  lastListedWalletId: WalletId | null = null;

  async saveTrigger(trigger: ExitTrigger): Promise<void> {
    this.triggers.set(trigger.triggerId, trigger);
  }

  async getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    return this.triggers.get(triggerId) ?? null;
  }

  async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    this.lastListedWalletId = walletId;
    return Array.from(this.triggers.values());
  }

  async getActiveEpisodeTrigger(episodeId: BreachEpisodeId): Promise<ExitTriggerId | null> {
    const id = this.episodeTriggerMap.get(episodeId);
    return (id as ExitTriggerId | undefined) ?? null;
  }

  async saveEpisode(episode: BreachEpisode): Promise<void> {
    this.episodes.set(episode.episodeId, episode);
    if (episode.activeTriggerId) {
      this.episodeTriggerMap.set(episode.episodeId, episode.activeTriggerId);
    }
  }

  async deleteTrigger(triggerId: ExitTriggerId): Promise<void> {
    this.triggers.delete(triggerId);
  }
}
