/**
 * ExpoPushAdapter — best-effort native push notifications
 * Uses Expo Push Notifications API for native mobile delivery.
 */
import * as Notifications from 'expo-notifications';
import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class ExpoPushAdapter implements NotificationPort {
  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    try {
      const expoPushToken = await Notifications.getExpoPushTokenAsync({
        projectId: 'clmm-superpowers',
      });

      const directionText = params.breachDirection.kind === 'lower-bound-breach'
        ? 'below range → exit to USDC'
        : 'above range → exit to SOL';

      const notificationContent: Notifications.NotificationContentInput = {
        title: 'CLMM Position Alert',
        body: `Your position is ${directionText}`,
        data: {
          triggerId: params.triggerId,
          positionId: params.positionId,
          deepLink: `clmmv2://preview/${params.triggerId}/${params.positionId}`,
        },
        sound: 'default',
      };

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null,
      });

      return { deliveredAt: makeClockTimestamp(Date.now()) };
    } catch (error) {
      console.warn('ExpoPushAdapter: failed to send notification', error);
      return { deliveredAt: null };
    }
  }
}
