import type { NotificationPort } from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId } from '@clmm/domain';

export async function dispatchActionableNotification(params: {
  walletId: WalletId;
  positionId: PositionId;
  triggerId: ExitTriggerId;
  breachDirection: BreachDirection;
  notificationPort: NotificationPort;
  notificationDedup?: Map<string, boolean>;
}): Promise<{ dispatched: boolean }> {
  const { walletId, positionId, triggerId, breachDirection, notificationPort, notificationDedup } =
    params;

  if (notificationDedup?.has(triggerId)) {
    return { dispatched: false };
  }

  await notificationPort.sendActionableAlert({
    walletId,
    positionId,
    breachDirection,
    triggerId,
  });

  notificationDedup?.set(triggerId, true);

  return { dispatched: true };
}
