import type { NotificationPort, NotificationDedupPort } from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId } from '@clmm/domain';

export async function dispatchActionableNotification(params: {
  walletId: WalletId;
  positionId: PositionId;
  triggerId: ExitTriggerId;
  breachDirection: BreachDirection;
  notificationPort: NotificationPort;
  notificationDedupPort: NotificationDedupPort;
}): Promise<{ dispatched: boolean }> {
  const { walletId, positionId, triggerId, breachDirection, notificationPort, notificationDedupPort } =
    params;

  const alreadyDispatched = await notificationDedupPort.hasDispatched(triggerId);
  if (alreadyDispatched) {
    return { dispatched: false };
  }

  await notificationPort.sendActionableAlert({
    walletId,
    positionId,
    breachDirection,
    triggerId,
  });

  await notificationDedupPort.markDispatched(triggerId);

  return { dispatched: true };
}
