import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeNotificationPort implements NotificationPort {
  readonly dispatched: Array<{
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }> = [];

  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    this.dispatched.push(params);
    return { deliveredAt: makeClockTimestamp(Date.now()) };
  }
}
