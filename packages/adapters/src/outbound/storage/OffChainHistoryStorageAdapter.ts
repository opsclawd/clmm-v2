import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { historyEvents } from './schema/index.js';
import type { ExecutionHistoryRepository } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  PositionId,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

export class OffChainHistoryStorageAdapter implements ExecutionHistoryRepository {
  constructor(private readonly db: Db) {}

  async appendEvent(event: HistoryEvent): Promise<void> {
    await this.db.insert(historyEvents).values({
      eventId: event.eventId,
      positionId: event.positionId,
      eventType: event.eventType,
      directionKind: event.breachDirection.kind,
      occurredAt: event.occurredAt,
      lifecycleStateKind: event.lifecycleState?.kind ?? null,
      transactionRefJson: event.transactionReference
        ? (event.transactionReference as unknown as Record<string, unknown>)
        : null,
    }).onConflictDoNothing();
  }

  async getTimeline(positionId: PositionId): Promise<HistoryTimeline> {
    const rows = await this.db
      .select()
      .from(historyEvents)
      .where(eq(historyEvents.positionId, positionId))
      .orderBy(historyEvents.occurredAt);

    const events: HistoryEvent[] = rows.map((row) => {
      const event = {
        eventId: row.eventId,
        positionId: row.positionId as PositionId,
        eventType: row.eventType as HistoryEvent['eventType'],
        breachDirection:
          row.directionKind === 'lower-bound-breach' ? LOWER_BOUND_BREACH : UPPER_BOUND_BREACH,
        occurredAt: makeClockTimestamp(row.occurredAt),
        ...(row.lifecycleStateKind ? { lifecycleState: { kind: row.lifecycleStateKind } } : {}),
        ...(row.transactionRefJson ? { transactionReference: row.transactionRefJson } : {}),
      };
      return event as HistoryEvent;
    });

    return { positionId, events };
  }

  async getOutcomeSummary(_positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
    return null;
  }
}
