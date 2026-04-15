import { Inject, Injectable } from '@nestjs/common';
import { dispatchActionableNotification } from '@clmm/application';
import type {
  NotificationPort,
  NotificationDedupPort,
  ObservabilityPort,
  ClockPort,
} from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId } from '@clmm/domain';
import {
  NOTIFICATION_PORT,
  NOTIFICATION_DEDUP_PORT,
  OBSERVABILITY_PORT,
  CLOCK_PORT,
} from './tokens.js';

type NotificationPayload = {
  triggerId: string;
  walletId: string;
  positionId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
};

@Injectable()
export class NotificationDispatchJobHandler {
  static readonly JOB_NAME = 'dispatch-notification';

  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notificationPort: NotificationPort,
    @Inject(NOTIFICATION_DEDUP_PORT)
    private readonly dedupPort: NotificationDedupPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  async handle(data: NotificationPayload): Promise<void> {
    try {
      const direction: BreachDirection = { kind: data.directionKind };
      const startedAt = this.clock.now();

      const result = await dispatchActionableNotification({
        walletId: data.walletId as WalletId,
        positionId: data.positionId as PositionId,
        triggerId: data.triggerId as ExitTriggerId,
        breachDirection: direction,
        notificationPort: this.notificationPort,
        notificationDedupPort: this.dedupPort,
      });

      if (result.deliveredAt !== null) {
        const completedAt = this.clock.now();
        this.observability.recordDeliveryTiming({
          triggerId: data.triggerId,
          dispatchedAt: startedAt,
          deliveredAt: completedAt,
          durationMs: completedAt - startedAt,
          channel: 'push',
        });
      }

      this.observability.log(
        'info',
        `Notification dispatch for trigger ${data.triggerId}: dispatched=${result.dispatched}`,
      );
    } catch (error: unknown) {
      // Notification failure is non-fatal: trigger exists in DB regardless
      this.observability.log('error', `Notification dispatch failed for trigger ${data.triggerId}`, {
        triggerId: data.triggerId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT rethrow -- notification failure should not cause pg-boss retry
    }
  }
}
