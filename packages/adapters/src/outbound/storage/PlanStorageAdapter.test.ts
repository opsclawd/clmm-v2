import { describe, it, expect } from 'vitest';
import { PlanStorageAdapter } from './PlanStorageAdapter.js';
import { makePositionId, makeWalletId, makeClockTimestamp } from '@clmm/domain';
import type { PlanId, CanonicalHash } from '@clmm/domain';
import type { Db } from './db.js';

type PlanRow = {
  planId: string;
  canonicalHash: string;
  positionId: string;
  walletId: string;
  requestedAt: number;
  respondedAt: number | null;
  asOfAt: number | null;
  expiresAt: number | null;
  actionKind: string;
  actionReasons: string[];
  snapshotFingerprint: string | null;
  lifecycleKind: string;
  decisionKind: string | null;
  attemptId: string | null;
  canonicalResultJson: Record<string, unknown> | null;
  resultIdempotencyKey: string | null;
  deliveryAttempts: number;
  nextAttemptAt: number | null;
  lastErrorClass: string | null;
  deliveredAt: number | null;
  lifecycleStateJson: Record<string, unknown> | null;
};

type OutboxRow = {
  resultId: string;
  planId: string;
  canonicalResultJson: Record<string, unknown>;
  idempotencyKey: string;
  attemptCount: number;
  nextAttemptAt: number;
  lastErrorClass: string | null;
  deliveredAt: number | null;
  createdAt: number;
};

// --- Minimal Drizzle predicate evaluator ---
//
// PlanStorageAdapter builds real drizzle-orm `eq`/`and`/`isNull`/`lte` SQL
// nodes and passes them to `.where(...)`. Rather than ignore predicates (which
// would make e.g. the conflict-vs-exact-replay branches indistinguishable) or
// re-implement Drizzle, this walks the SQL node's `queryChunks` — the same
// internal shape OperationalStorageAdapter.test.ts's fake already inspects —
// to extract (column, operator, value) leaf conditions and evaluate them
// against a plain row object. Supports exactly what this adapter uses:
// equality, `is null`, and `<=`, combined with `and`.
function isColumnLike(node: unknown): node is { name: string } {
  return (
    typeof node === 'object' &&
    node !== null &&
    'name' in node &&
    'table' in node &&
    'columnType' in node
  );
}

function isParamLike(node: unknown): node is { value: unknown } {
  return (
    typeof node === 'object' &&
    node !== null &&
    'value' in node &&
    !('columnType' in node) &&
    !('queryChunks' in node)
  );
}

function matchesPredicate(row: Record<string, unknown>, node: unknown): boolean {
  if (typeof node !== 'object' || node === null || !('queryChunks' in node)) {
    return true;
  }
  const chunks = (node as { queryChunks: unknown[] }).queryChunks;

  let allMatch = true;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (isColumnLike(chunk)) {
      const camelName = chunk.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      const nextChunk = chunks[i + 1];
      const nextText =
        typeof nextChunk === 'object' &&
        nextChunk !== null &&
        'value' in nextChunk &&
        Array.isArray((nextChunk as { value: unknown }).value)
          ? ((nextChunk as { value: string[] }).value[0] ?? '')
          : '';

      if (nextText.includes('is null')) {
        if (row[camelName] !== null && row[camelName] !== undefined) allMatch = false;
        continue;
      }

      const paramChunk = chunks[i + 2];
      if (isParamLike(paramChunk)) {
        if (nextText.includes('<=')) {
          if (!((row[camelName] as number) <= (paramChunk.value as number))) allMatch = false;
        } else {
          if (row[camelName] !== paramChunk.value) allMatch = false;
        }
      }
    } else if (
      typeof chunk === 'object' &&
      chunk !== null &&
      'queryChunks' in chunk &&
      !matchesPredicate(row, chunk)
    ) {
      allMatch = false;
    }
  }
  return allMatch;
}

/**
 * In-memory fake of the two tables PlanStorageAdapter touches, matching this
 * package's established fake-Db convention (see OperationalStorageAdapter.test.ts)
 * rather than a real Postgres connection, which nothing in this package uses.
 * Table identity is distinguished by drizzle's table name symbol.
 */
type PositionPlanRequestStateRow = {
  positionId: string;
  leaseToken: string | null;
  leaseUntil: number | null;
  lastAttemptAt: number | null;
  lastRangeState: string | null;
  lastBreachQualifiedAt: number | null;
  lastClosedCandleAt: number | null;
  updatedAt: number;
};

function makeFakeDb(
  params: {
    planRows?: PlanRow[];
    outboxRows?: OutboxRow[];
    requestStateRows?: PositionPlanRequestStateRow[];
  } = {},
): {
  db: Db;
  plans: PlanRow[];
  outbox: OutboxRow[];
  requestStates: PositionPlanRequestStateRow[];
} {
  const plans: PlanRow[] = params.planRows ?? [];
  const outbox: OutboxRow[] = params.outboxRows ?? [];
  const requestStates: PositionPlanRequestStateRow[] = params.requestStateRows ?? [];

  function tableName(table: unknown): string {
    return (
      (table as { name?: string })?.name ??
      ((table as Record<string | symbol, unknown>)[Symbol.for('drizzle:Name')] as
        | string
        | undefined) ??
      ''
    );
  }

  function rowsFor(table: unknown): Record<string, unknown>[] {
    const name = tableName(table);
    if (name === 'plan_result_outbox') return outbox as Record<string, unknown>[];
    if (name === 'position_plan_request_state') return requestStates as Record<string, unknown>[];
    return plans as Record<string, unknown>[];
  }

  function selectFrom(table: unknown) {
    // Snapshot matched rows as shallow copies: a real SELECT does not see
    // mutations from a later UPDATE in the same transaction, and this
    // adapter relies on that (e.g. claimDueResult reads attemptCount once,
    // then computes +1 for both the UPDATE patch and the return value).
    const filtered = (predicate: unknown) =>
      rowsFor(table)
        .filter((r) => matchesPredicate(r, predicate))
        .map((r) => ({ ...r }));
    return {
      where: (predicate: unknown) => {
        const rows = filtered(predicate);
        const sortedRows = [...rows].sort((a, b) => {
          if (a['requestedAt'] !== b['requestedAt']) {
            return Number(b['requestedAt']) - Number(a['requestedAt']);
          }
          return String(b['planId']).localeCompare(String(a['planId']));
        });
        return {
          for: (_mode: string, _opts?: unknown) => ({
            limit: async (n: number) => sortedRows.slice(0, n),
            then: (resolve: (v: unknown[]) => unknown) => resolve(sortedRows),
          }),
          orderBy: (..._args: unknown[]) => ({
            limit: async (n: number) => sortedRows.slice(0, n),
            then: (resolve: (v: unknown[]) => unknown) => resolve(sortedRows),
          }),
          limit: async (n: number) => sortedRows.slice(0, n),
          then: (resolve: (v: unknown[]) => unknown) => resolve(sortedRows),
        };
      },
    };
  }

  function insertInto(table: unknown) {
    return {
      values: (row: Record<string, unknown>) => {
        const name = tableName(table);
        const idKey =
          name === 'plan_result_outbox'
            ? 'resultId'
            : name === 'position_plan_request_state'
              ? 'positionId'
              : 'planId';

        const insert = () => {
          const target = rowsFor(table);
          if (!target.some((r) => r[idKey] === row[idKey])) {
            target.push(row);
          }
        };

        return {
          onConflictDoNothing: (_config?: unknown) => {
            const beforeLen = rowsFor(table).length;
            insert();
            const afterLen = rowsFor(table).length;
            const inserted = afterLen > beforeLen ? [row] : [];
            return {
              returning: async () => inserted,
              then: (resolve: (v: undefined) => unknown) => resolve(undefined),
            };
          },
          onConflictDoUpdate: async (config: { set: Record<string, unknown> }) => {
            const target = rowsFor(table);
            const existing = target.find((r) => r[idKey] === row[idKey]);
            if (existing) {
              Object.assign(existing, config.set);
            } else {
              target.push({ ...row });
            }
            return undefined;
          },
          then: (resolve: (v: undefined) => unknown) => {
            insert();
            resolve(undefined);
          },
        };
      },
    };
  }

  function updateTable(table: unknown) {
    return {
      set: (patch: Record<string, unknown>) => ({
        where: async (predicate: unknown) => {
          const target = rowsFor(table).filter((r) => matchesPredicate(r, predicate));
          for (const row of target) {
            Object.assign(row, patch);
          }
          return undefined;
        },
      }),
    };
  }

  const db = {
    select: () => ({ from: selectFrom }),
    insert: insertInto,
    update: updateTable,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => ({ from: selectFrom }),
        insert: insertInto,
        update: updateTable,
      };
      return fn(tx);
    },
  };

  return { db: db as unknown as Db, plans, outbox, requestStates };
}

function makePlanRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    walletId: 'wallet-1',
    requestedAt: 1_000,
    respondedAt: null,
    asOfAt: null,
    expiresAt: null,
    actionKind: 'HOLD',
    actionReasons: [],
    snapshotFingerprint: null,
    lifecycleKind: 'requested',
    decisionKind: null,
    attemptId: null,
    canonicalResultJson: null,
    resultIdempotencyKey: null,
    deliveryAttempts: 0,
    nextAttemptAt: null,
    lastErrorClass: null,
    deliveredAt: null,
    lifecycleStateJson: null,
    ...overrides,
  };
}

describe('PlanStorageAdapter', () => {
  describe('plan replay uniqueness', () => {
    it('creates a new row when no plan exists for the planId', async () => {
      const { db, plans } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.createRequest({
        planId: 'plan-1' as PlanId,
        canonicalHash: 'hash-1' as CanonicalHash,
        positionId: makePositionId('position-1'),
        walletId: makeWalletId('wallet-1'),
        requestedAt: makeClockTimestamp(1_000),
        action: { kind: 'HOLD' },
      });

      expect(result).toEqual({ kind: 'created' });
      expect(plans).toHaveLength(1);
      expect(plans[0]?.planId).toBe('plan-1');
    });

    it('returns exact-replay for an identical planId and canonicalHash, without inserting a second row', async () => {
      const { db, plans } = makeFakeDb({
        planRows: [makePlanRow({ planId: 'plan-1', canonicalHash: 'hash-1' })],
      });
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.createRequest({
        planId: 'plan-1' as PlanId,
        canonicalHash: 'hash-1' as CanonicalHash,
        positionId: makePositionId('position-1'),
        walletId: makeWalletId('wallet-1'),
        requestedAt: makeClockTimestamp(2_000),
        action: { kind: 'HOLD' },
      });

      expect(result).toEqual({ kind: 'exact-replay' });
      expect(plans).toHaveLength(1);
    });

    it('returns conflict for the same planId with a different canonicalHash, without inserting a second row', async () => {
      const { db, plans } = makeFakeDb({
        planRows: [makePlanRow({ planId: 'plan-1', canonicalHash: 'hash-1' })],
      });
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.createRequest({
        planId: 'plan-1' as PlanId,
        canonicalHash: 'hash-2' as CanonicalHash,
        positionId: makePositionId('position-1'),
        walletId: makeWalletId('wallet-1'),
        requestedAt: makeClockTimestamp(2_000),
        action: { kind: 'HOLD' },
      });

      expect(result).toEqual({ kind: 'conflict' });
      expect(plans).toHaveLength(1);
    });

    it('creates independent rows for different planIds', async () => {
      const { db, plans } = makeFakeDb({
        planRows: [makePlanRow({ planId: 'plan-1', canonicalHash: 'hash-1' })],
      });
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.createRequest({
        planId: 'plan-2' as PlanId,
        canonicalHash: 'hash-2' as CanonicalHash,
        positionId: makePositionId('position-2'),
        walletId: makeWalletId('wallet-1'),
        requestedAt: makeClockTimestamp(2_000),
        action: { kind: 'HOLD' },
      });

      expect(result).toEqual({ kind: 'created' });
      expect(plans).toHaveLength(2);
    });
  });

  describe('terminal outcome and outbox are atomic', () => {
    it('commits the terminal outcome to the plan and inserts a matching outbox row in one transaction', async () => {
      const { db, plans, outbox } = makeFakeDb({
        planRows: [makePlanRow({ planId: 'plan-1', lifecycleKind: 'result-pending' })],
      });
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.commitTerminalOutcome({
        planId: 'plan-1' as PlanId,
        outcome: { kind: 'executed' },
        canonicalResult: { id: 'result-1', payload: { ok: true } },
        resultIdempotencyKey: 'idem-1',
        committedAt: makeClockTimestamp(5_000),
      });

      expect(result).toEqual({ kind: 'committed' });
      expect(plans[0]?.decisionKind).toBe('executed');
      expect(plans[0]?.canonicalResultJson).toEqual({ ok: true });
      expect(plans[0]?.resultIdempotencyKey).toBe('idem-1');
      expect(outbox).toHaveLength(1);
      expect(outbox[0]?.resultId).toBe('result-1');
      expect(outbox[0]?.planId).toBe('plan-1');
      expect(outbox[0]?.idempotencyKey).toBe('idem-1');
    });

    it('returns plan-not-found and writes nothing when the plan does not exist', async () => {
      const { db, plans, outbox } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.commitTerminalOutcome({
        planId: 'missing-plan' as PlanId,
        outcome: { kind: 'executed' },
        canonicalResult: { id: 'result-1', payload: { ok: true } },
        resultIdempotencyKey: 'idem-1',
        committedAt: makeClockTimestamp(5_000),
      });

      expect(result).toEqual({ kind: 'plan-not-found' });
      expect(plans).toHaveLength(0);
      expect(outbox).toHaveLength(0);
    });

    it('does not insert a second outbox row when the same resultId is committed twice', async () => {
      const { db, outbox } = makeFakeDb({
        planRows: [makePlanRow({ planId: 'plan-1', lifecycleKind: 'result-pending' })],
      });
      const adapter = new PlanStorageAdapter(db);
      const params = {
        planId: 'plan-1' as PlanId,
        outcome: { kind: 'executed' as const },
        canonicalResult: { id: 'result-1', payload: { ok: true } },
        resultIdempotencyKey: 'idem-1',
        committedAt: makeClockTimestamp(5_000),
      };

      await adapter.commitTerminalOutcome(params);
      await adapter.commitTerminalOutcome(params);

      expect(outbox).toHaveLength(1);
    });
  });

  describe('due result claim is exclusive', () => {
    it('claims the due result, incrementing attemptCount by one', async () => {
      const { db, outbox } = makeFakeDb({
        outboxRows: [
          {
            resultId: 'result-1',
            planId: 'plan-1',
            canonicalResultJson: { ok: true },
            idempotencyKey: 'idem-1',
            attemptCount: 0,
            nextAttemptAt: 0,
            lastErrorClass: null,
            deliveredAt: null,
            createdAt: 0,
          },
        ],
      });
      const adapter = new PlanStorageAdapter(db);

      const claim = await adapter.claimDueResult();

      expect(claim).not.toBeNull();
      expect(claim?.resultId).toBe('result-1');
      expect(claim?.planId).toBe('plan-1');
      expect(claim?.idempotencyKey).toBe('idem-1');
      expect(claim?.attemptCount).toBe(1);
      expect(outbox[0]?.attemptCount).toBe(1);
    });

    it('returns null when no result is due', async () => {
      const { db } = makeFakeDb({ outboxRows: [] });
      const adapter = new PlanStorageAdapter(db);

      const claim = await adapter.claimDueResult();

      expect(claim).toBeNull();
    });

    it('does not claim a result that is already delivered', async () => {
      const { db } = makeFakeDb({
        outboxRows: [
          {
            resultId: 'result-1',
            planId: 'plan-1',
            canonicalResultJson: { ok: true },
            idempotencyKey: 'idem-1',
            attemptCount: 1,
            nextAttemptAt: 0,
            lastErrorClass: null,
            deliveredAt: 500,
            createdAt: 0,
          },
        ],
      });
      const adapter = new PlanStorageAdapter(db);

      const claim = await adapter.claimDueResult();

      expect(claim).toBeNull();
    });

    it('does not claim a result whose next attempt is in the future', async () => {
      const farFuture = Date.now() + 60 * 60_000;
      const { db } = makeFakeDb({
        outboxRows: [
          {
            resultId: 'result-1',
            planId: 'plan-1',
            canonicalResultJson: { ok: true },
            idempotencyKey: 'idem-1',
            attemptCount: 0,
            nextAttemptAt: farFuture,
            lastErrorClass: null,
            deliveredAt: null,
            createdAt: 0,
          },
        ],
      });
      const adapter = new PlanStorageAdapter(db);

      const claim = await adapter.claimDueResult();

      expect(claim).toBeNull();
    });
  });

  describe('links one execution attempt exactly once', () => {
    it('links a plan to an execution attempt and rejects a second link', async () => {
      const { db, plans } = makeFakeDb({
        planRows: [makePlanRow({ planId: 'plan-1', lifecycleKind: 'result-pending' })],
      });
      const adapter = new PlanStorageAdapter(db);

      await adapter.linkExecutionAttempt({
        planId: 'plan-1' as PlanId,
        attemptId: 'attempt-1',
        linkedAt: makeClockTimestamp(2_000),
      });

      expect(plans[0]?.attemptId).toBe('attempt-1');

      await expect(
        adapter.linkExecutionAttempt({
          planId: 'plan-1' as PlanId,
          attemptId: 'attempt-2',
          linkedAt: makeClockTimestamp(3_000),
        }),
      ).rejects.toThrow();
    });
  });

  describe('reschedules retry without changing idempotency identity', () => {
    it('updates nextAttemptAt and lastErrorClass while preserving idempotency key and payload', async () => {
      const { db, outbox } = makeFakeDb({
        outboxRows: [
          {
            resultId: 'result-1',
            planId: 'plan-1',
            canonicalResultJson: { ok: true },
            idempotencyKey: 'idem-1',
            attemptCount: 1,
            nextAttemptAt: 1_000,
            lastErrorClass: null,
            deliveredAt: null,
            createdAt: 0,
          },
        ],
      });
      const adapter = new PlanStorageAdapter(db);

      await adapter.rescheduleRetry({
        resultId: 'result-1',
        nextAttemptAt: makeClockTimestamp(5_000),
        lastError: 'NetworkError',
      });

      expect(outbox[0]?.idempotencyKey).toBe('idem-1');
      expect(outbox[0]?.canonicalResultJson).toEqual({ ok: true });
      expect(outbox[0]?.nextAttemptAt).toBe(5_000);
      expect(outbox[0]?.lastErrorClass).toBe('NetworkError');
    });
  });

  describe('getCurrentPlan ordering', () => {
    it('returns the newest plan for a position deterministically', async () => {
      const { db } = makeFakeDb({
        planRows: [
          makePlanRow({
            planId: 'plan-older',
            positionId: 'position-1',
            requestedAt: 1000,
            lifecycleStateJson: { kind: 'requested' },
          }),
          makePlanRow({
            planId: 'plan-newer',
            positionId: 'position-1',
            requestedAt: 2000,
            lifecycleStateJson: { kind: 'requested' },
          }),
        ],
      });
      const adapter = new PlanStorageAdapter(db);

      const plan = await adapter.getCurrentPlan(makePositionId('position-1'));
      expect(plan).not.toBeNull();
      expect(plan?.planId).toBe('plan-newer');
    });
  });

  describe('PlanStorageAdapter - plan request cadence lease', () => {
    it('claims the first request for a position', async () => {
      const { db, requestStates } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const result = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });

      expect(result.kind).toBe('claimed');
      if (result.kind === 'claimed') {
        expect(result.leaseToken).toBeTruthy();
      }
      expect(requestStates).toHaveLength(1);
      expect(requestStates[0]?.positionId).toBe('pos-1');
      expect(requestStates[0]?.leaseUntil).toBe(121_000);
      expect(requestStates[0]?.lastAttemptAt).toBe(1000);
      expect(requestStates[0]?.lastRangeState).toBe('in-range');
    });

    it('suppresses a concurrent request while the lease is active', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      expect(claim1.kind).toBe('claimed');

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(2000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      expect(claim2).toEqual({ kind: 'suppressed', reason: 'active-request' });
    });

    it('claims independent positions concurrently', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-2'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });

      expect(claim1.kind).toBe('claimed');
      expect(claim2.kind).toBe('claimed');
    });

    it('reclaims an expired lease', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      expect(claim1.kind).toBe('claimed');

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(130_000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      expect(claim2.kind).toBe('claimed');
      if (claim1.kind === 'claimed' && claim2.kind === 'claimed') {
        expect(claim2.leaseToken).not.toBe(claim1.leaseToken);
      }
    });

    it('bypasses interval on range-state change', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      if (claim1.kind === 'claimed') {
        await adapter.finishPlanRequest({
          positionId: makePositionId('pos-1'),
          leaseToken: claim1.leaseToken,
          outcome: 'succeeded',
          completedAt: makeClockTimestamp(2000),
        });
      }

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(3000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
      });
      expect(claim2.kind).toBe('claimed');
    });

    it('bypasses interval when a breach becomes qualified', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
        breachQualifiedAt: null,
      });
      if (claim1.kind === 'claimed') {
        await adapter.finishPlanRequest({
          positionId: makePositionId('pos-1'),
          leaseToken: claim1.leaseToken,
          outcome: 'succeeded',
          completedAt: makeClockTimestamp(2000),
        });
      }

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(3000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
        breachQualifiedAt: makeClockTimestamp(3000),
      });
      expect(claim2.kind).toBe('claimed');
    });

    it('bypasses interval for a different qualified breach', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
        breachQualifiedAt: makeClockTimestamp(1000),
      });
      if (claim1.kind === 'claimed') {
        await adapter.finishPlanRequest({
          positionId: makePositionId('pos-1'),
          leaseToken: claim1.leaseToken,
          outcome: 'succeeded',
          completedAt: makeClockTimestamp(2000),
        });
      }

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(3000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
        breachQualifiedAt: makeClockTimestamp(3000),
      });
      expect(claim2.kind).toBe('claimed');
    });

    it('bypasses interval for a newly closed candle', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
        closedCandleAt: makeClockTimestamp(3600),
      });
      if (claim1.kind === 'claimed') {
        await adapter.finishPlanRequest({
          positionId: makePositionId('pos-1'),
          leaseToken: claim1.leaseToken,
          outcome: 'succeeded',
          completedAt: makeClockTimestamp(2000),
        });
      }

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(3000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
        closedCandleAt: makeClockTimestamp(7200),
      });
      expect(claim2.kind).toBe('claimed');
    });

    it('suppresses an unchanged observation inside the interval', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
        breachQualifiedAt: makeClockTimestamp(1000),
        closedCandleAt: makeClockTimestamp(3600),
      });
      if (claim1.kind === 'claimed') {
        await adapter.finishPlanRequest({
          positionId: makePositionId('pos-1'),
          leaseToken: claim1.leaseToken,
          outcome: 'succeeded',
          completedAt: makeClockTimestamp(2000),
        });
      }

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(3000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'below-range',
        breachQualifiedAt: makeClockTimestamp(1000),
        closedCandleAt: makeClockTimestamp(3600),
      });
      expect(claim2).toEqual({ kind: 'suppressed', reason: 'minimum-interval' });
    });

    it('retains lastAttemptAt after failed completion', async () => {
      const { db } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      if (claim1.kind === 'claimed') {
        await adapter.finishPlanRequest({
          positionId: makePositionId('pos-1'),
          leaseToken: claim1.leaseToken,
          outcome: 'failed',
          completedAt: makeClockTimestamp(1500),
        });
      }

      const claim2 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(2000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      expect(claim2).toEqual({ kind: 'suppressed', reason: 'minimum-interval' });
    });

    it('rejects completion with a stale lease token', async () => {
      const { db, requestStates } = makeFakeDb();
      const adapter = new PlanStorageAdapter(db);

      const claim1 = await adapter.claimPlanRequest({
        positionId: makePositionId('pos-1'),
        now: makeClockTimestamp(1000),
        minimumIntervalMs: 900_000,
        leaseDurationMs: 120_000,
        rangeState: 'in-range',
      });
      expect(claim1.kind).toBe('claimed');

      await adapter.finishPlanRequest({
        positionId: makePositionId('pos-1'),
        leaseToken: 'stale-token-xyz',
        outcome: 'succeeded',
        completedAt: makeClockTimestamp(2000),
      });

      expect(requestStates[0]?.leaseToken).toBe((claim1 as { leaseToken: string }).leaseToken);
    });
  });
});
