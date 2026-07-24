import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db.js';
import { historyEvents, walletPositionOwnership } from './schema/index.js';
import type { ExecutionHistoryRepository } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  ExecutionOrigin,
  PositionId,
  WalletId,
  PlanId,
  CanonicalHash,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

type HistoryEventRow = typeof historyEvents.$inferSelect;

function mapOriginFromRow(row: {
  originKind: string;
  directionKind: string | null;
  planId: string | null;
  canonicalHash: string | null;
  canonicalExitIntent: string | null;
}): ExecutionOrigin {
  if (row.originKind === 'regime-plan') {
    if (!row.planId || !row.canonicalHash || !row.canonicalExitIntent) {
      throw new Error('mapOriginFromRow: incomplete regime-plan origin row');
    }
    if (row.canonicalExitIntent !== 'exit-to-usdc' && row.canonicalExitIntent !== 'exit-to-sol') {
      throw new Error(`mapOriginFromRow: unknown canonicalExitIntent ${row.canonicalExitIntent}`);
    }
    return {
      kind: 'regime-plan',
      planId: row.planId as PlanId,
      canonicalHash: row.canonicalHash as CanonicalHash,
      canonicalExitIntent: row.canonicalExitIntent,
    };
  }

  const breachDirection =
    row.directionKind === 'lower-bound-breach'
      ? LOWER_BOUND_BREACH
      : row.directionKind === 'upper-bound-breach'
        ? UPPER_BOUND_BREACH
        : (() => {
            throw new Error(`mapOriginFromRow: unknown directionKind ${row.directionKind}`);
          })();

  return { kind: 'qualified-breach', breachDirection };
}

function mapHistoryEventRow(row: HistoryEventRow): HistoryEvent {
  const origin = mapOriginFromRow(row);

  const baseEvent = {
    eventId: row.eventId,
    positionId: row.positionId as PositionId,
    eventType: row.eventType as HistoryEvent['eventType'],
    origin,
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
  constructor(private readonly db: Db) {}

  async appendEvent(event: HistoryEvent): Promise<void> {
    const origin = event.origin;
    await this.db
      .insert(historyEvents)
      .values({
        eventId: event.eventId,
        positionId: event.positionId,
        eventType: event.eventType,
        originKind: origin.kind,
        directionKind: origin.kind === 'qualified-breach' ? origin.breachDirection.kind : null,
        planId: origin.kind === 'regime-plan' ? origin.planId : null,
        canonicalHash: origin.kind === 'regime-plan' ? origin.canonicalHash : null,
        canonicalExitIntent: origin.kind === 'regime-plan' ? origin.canonicalExitIntent : null,
        occurredAt: event.occurredAt,
        lifecycleStateKind: event.lifecycleState?.kind ?? null,
        transactionRefJson: event.transactionReference
          ? (event.transactionReference as unknown as Record<string, unknown>)
          : null,
      })
      .onConflictDoNothing();
  }

  async recordWalletPositionOwnership(
    walletId: WalletId,
    positionId: PositionId,
    observedAt: number,
  ): Promise<void> {
    await this.db
      .insert(walletPositionOwnership)
      .values({
        walletId,
        positionId,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
      })
      .onConflictDoUpdate({
        target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
        set: { lastSeenAt: observedAt },
      });
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
    const terminalRow = [...rows].reverse().find((r) => terminalEventTypes.includes(r.eventType));

    if (!terminalRow) return null;

    const origin = mapOriginFromRow(terminalRow);

    const lifecycleStateKind = terminalRow.lifecycleStateKind;
    if (!lifecycleStateKind) return null;

    const txRefs = rows
      .filter((r) => r.transactionRefJson != null)
      .map((r) => r.transactionRefJson as { signature: string; stepKind: string });

    return {
      positionId,
      origin,
      finalState: { kind: lifecycleStateKind } as ExecutionOutcomeSummary['finalState'],
      transactionReferences: txRefs as ExecutionOutcomeSummary['transactionReferences'],
      completedAt: makeClockTimestamp(terminalRow.occurredAt),
    };
  }
}
