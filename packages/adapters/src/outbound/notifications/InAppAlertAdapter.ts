/**
 * InAppAlertAdapter
 *
 * Stores actionable alerts in-memory for in-app display when push delivery
 * was delayed or unavailable. The application layer queries this when the
 * app becomes active.
 */
import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

type PendingAlert = {
  positionId: PositionId;
  breachDirection: BreachDirection;
  triggerId: ExitTriggerId;
  receivedAt: ClockTimestamp;
};

const pendingAlerts: PendingAlert[] = [];

export function getPendingInAppAlerts(): readonly PendingAlert[] {
  return pendingAlerts;
}

export function clearInAppAlert(triggerId: ExitTriggerId): void {
  const idx = pendingAlerts.findIndex((a) => a.triggerId === triggerId);
  if (idx >= 0) pendingAlerts.splice(idx, 1);
}

export class InAppAlertAdapter implements NotificationPort {
  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    pendingAlerts.push({
      positionId: params.positionId,
      breachDirection: params.breachDirection,
      triggerId: params.triggerId,
      receivedAt: makeClockTimestamp(Date.now()),
    });
    return { deliveredAt: makeClockTimestamp(Date.now()) };
  }
}
