import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';

export class WebPushAdapter implements NotificationPort {
  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    console.warn('WebPushAdapter: stub');
    return { deliveredAt: null };
  }
}
