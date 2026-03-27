/**
 * ExpoPushAdapter — best-effort native push notifications
 * ⚠️ Use solana-adapter-docs skill for Expo Push Notifications API before implementing
 */
import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';

export class ExpoPushAdapter implements NotificationPort {
  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    const direction = params.breachDirection.kind === 'lower-bound-breach'
      ? 'below range → exit to USDC'
      : 'above range → exit to SOL';
    console.warn('ExpoPushAdapter: stub — invoke solana-adapter-docs for Expo Push API');
    return { deliveredAt: null };
  }
}
