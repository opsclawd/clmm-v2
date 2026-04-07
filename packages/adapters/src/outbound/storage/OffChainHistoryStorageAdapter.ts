import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db.js';
import { historyEvents, walletPositionOwnership } from './schema/index.js';
import type { ExecutionHistoryRepository, SupportedPositionReadPort } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  PositionId,
  WalletId,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

type HistoryEventRow = typeof historyEvents.$inferSelect;

function mapHistoryEventRow(row: HistoryEventRow): HistoryEvent {
  const breachDirection =
    row.directionKind === 'lower-bound-breach'
      ? LOWER_BOUND_BREACH
      : row.directionKind === 'upper-bound-breach'
        ? UPPER_BOUND_BREACH
        : (() => {
            throw new Error(`mapHistoryEventRow: unknown directionKind ${row.directionKind}`);
          })();

  const baseEvent = {
    eventId: row.eventId,
    positionId: row.positionId as PositionId,
    eventType: row.eventType as HistoryEvent['eventType'],
    breachDirection,
    occurredAt: makeClockTimestamp(row.occurredAt),
  };

  const event: HistoryEvent = row.lifecycleStateKind
    ? Object.assign(baseEvent, {
        lifecycleState: { kind: row.lifecycleStateKind } as HistoryEvent['lifecycleState'],
        ...(row.transactionRefJson ? { transactionReference: row.transactionRefJson } : {}),
      })
    : row.transactionRefJson
      ? Object.assign(baseEvent, { transactionReference: row.transactionRefJson })
      : baseEvent;

  return event;
}

export class OffChainHistoryStorageAdapter implements ExecutionHistoryRepository {
  constructor(
    private readonly db: Db,
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

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

  async getWalletHistory(walletId: WalletId): Promise<readonly HistoryEvent[]> {
    const ownershipRows = await this.db
      .select()
      .from(walletPositionOwnership)
      .where(eq(walletPositionOwnership.walletId, walletId));

    const positionIds = ownershipRows.map((row) => row.positionId);
    if (positionIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(historyEvents)
      .where(inArray(historyEvents.positionId, positionIds))
      .orderBy(historyEvents.occurredAt, historyEvents.eventId);

    return rows.map(mapHistoryEventRow);
  }

  async getTimeline(positionId: PositionId): Promise<HistoryTimeline> {
    const rows = await this.db
      .select()
      .from(historyEvents)
      .where(eq(historyEvents.positionId, positionId))
      .orderBy(historyEvents.occurredAt, historyEvents.eventId);

    const events: HistoryEvent[] = rows.map(mapHistoryEventRow);

    return { positionId, events };
  }

  async getOutcomeSummary(positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
    const rows = await this.db
      .select()
      .from(historyEvents)
      .where(eq(historyEvents.positionId, positionId))
      .orderBy(historyEvents.occurredAt);

    if (rows.length === 0) return null;

    // Find the last terminal event (confirmed, failed, partial-completion, abandoned)
    const terminalEventTypes = ['confirmed', 'failed', 'partial-completion', 'abandoned'];
    const terminalRow = [...rows].reverse().find(
      (r) => terminalEventTypes.includes(r.eventType),
    );

    if (!terminalRow) return null;

    const breachDirection =
      terminalRow.directionKind === 'lower-bound-breach'
        ? LOWER_BOUND_BREACH
        : terminalRow.directionKind === 'upper-bound-breach'
          ? UPPER_BOUND_BREACH
          : (() => {
              throw new Error(`getOutcomeSummary: unknown directionKind ${terminalRow.directionKind}`);
            })();

    const lifecycleStateKind = terminalRow.lifecycleStateKind;
    if (!lifecycleStateKind) return null;

    const txRefs = rows
      .filter((r) => r.transactionRefJson != null)
      .map((r) => r.transactionRefJson as { signature: string; stepKind: string });

    return {
      positionId,
      breachDirection,
      finalState: { kind: lifecycleStateKind } as ExecutionOutcomeSummary['finalState'],
      transactionReferences: txRefs as ExecutionOutcomeSummary['transactionReferences'],
      completedAt: makeClockTimestamp(terminalRow.occurredAt),
    };
  }
}
