import type { NotificationPort, NotificationDedupPort } from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId, ClockTimestamp } from '@clmm/domain';

export async function dispatchActionableNotification(params: {
  walletId: WalletId;
  positionId: PositionId;
  triggerId: ExitTriggerId;
  breachDirection: BreachDirection;
  notificationPort: NotificationPort;
  notificationDedupPort: NotificationDedupPort;
}): Promise<{ dispatched: boolean; deliveredAt: ClockTimestamp | null }> {
  const { walletId, positionId, triggerId, breachDirection, notificationPort, notificationDedupPort } =
    params;

  const alreadyDispatched = await notificationDedupPort.hasDispatched(triggerId);
  if (alreadyDispatched) {
    return { dispatched: false, deliveredAt: null };
  }

  const { deliveredAt } = await notificationPort.sendActionableAlert({
    walletId,
    positionId,
    breachDirection,
    triggerId,
  });

  await notificationDedupPort.markDispatched(triggerId);

  return { dispatched: true, deliveredAt };
}
