import type { NotificationPort, IdGeneratorPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';
import type { Db } from '../storage/db.js';
import { notificationEvents } from '../storage/schema/index.js';

export class DurableNotificationEventAdapter implements NotificationPort {
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
  ) {}

  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    const eventId = this.ids.generateId();

    await this.db.insert(notificationEvents).values({
      eventId,
      triggerId: params.triggerId,
      walletId: params.walletId,
      positionId: params.positionId,
      directionKind: params.breachDirection.kind,
      channel: 'none',
      status: 'skipped',
      createdAt: Date.now(),
      attemptedAt: null,
      deliveredAt: null,
      failureReason: null,
    });

    return { deliveredAt: null };
  }
}