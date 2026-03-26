import type { NotificationPort, ClockPort } from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId } from '@clmm/domain';

export async function dispatchActionableNotification(params: {
  walletId: WalletId;
  positionId: PositionId;
  triggerId: ExitTriggerId;
  breachDirection: BreachDirection;
  notificationPort: NotificationPort;
  clock: ClockPort;
}): Promise<void> {
  const { walletId, positionId, triggerId, breachDirection, notificationPort } = params;
  await notificationPort.sendActionableAlert({
    walletId,
    positionId,
    breachDirection,
    triggerId,
  });
}
