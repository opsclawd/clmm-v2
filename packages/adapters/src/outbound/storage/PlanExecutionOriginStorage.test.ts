import { describe, it, expect } from 'vitest';
import { OperationalStorageAdapter } from './OperationalStorageAdapter.js';
import { FakeIdGeneratorPort } from '@clmm/testing';
import { makePositionId, LOWER_BOUND_BREACH } from '@clmm/domain';
import type { PlanId, CanonicalHash, ExecutionOrigin } from '@clmm/domain';
import type { Db } from './db.js';

// --- Minimal Drizzle predicate evaluator ---
//
// Same technique as PlanStorageAdapter.test.ts's fake: walks the real
// drizzle-orm eq/and SQL node shape to actually filter rows, rather than
// ignoring predicates (which would make table-scoped lookups indistinguishable).
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
      const paramChunk = chunks[i + 2];
      if (isParamLike(paramChunk) && row[camelName] !== paramChunk.value) {
        allMatch = false;
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

type PreviewRow = Record<string, unknown>;
type AttemptRow = Record<string, unknown>;

/**
 * In-memory fake of the executionPreviews/executionAttempts tables, matching
 * this package's established fake-Db convention (see
 * OperationalStorageAdapter.test.ts, PlanStorageAdapter.test.ts) rather than a
 * real Postgres connection, which nothing in this package uses.
 */
function makeFakeDb(
  params: {
    previewRows?: PreviewRow[];
    attemptRows?: AttemptRow[];
  } = {},
): { db: Db; previews: PreviewRow[]; attempts: AttemptRow[] } {
  const previews: PreviewRow[] = params.previewRows ?? [];
  const attempts: AttemptRow[] = params.attemptRows ?? [];

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
    return tableName(table) === 'execution_attempts' ? attempts : previews;
  }

  function selectFrom(table: unknown) {
    const filtered = (predicate: unknown) =>
      rowsFor(table)
        .filter((r) => matchesPredicate(r, predicate))
        .map((r) => ({ ...r }));
    return {
      where: (predicate: unknown) => {
        const rows = filtered(predicate);
        return { then: (resolve: (v: unknown[]) => unknown) => resolve(rows) };
      },
    };
  }

  function insertInto(table: unknown) {
    return {
      values: (row: Record<string, unknown>) => {
        const idKey = tableName(table) === 'execution_attempts' ? 'attemptId' : 'previewId';
        const target = rowsFor(table);
        return {
          onConflictDoUpdate: async (opts: { set: Record<string, unknown> }) => {
            const existing = target.find((r) => r[idKey] === row[idKey]);
            if (existing) {
              Object.assign(existing, opts.set);
            } else {
              target.push(row);
            }
          },
          then: (resolve: (v: undefined) => unknown) => {
            target.push(row);
            resolve(undefined);
          },
        };
      },
    };
  }

  const db = { select: () => ({ from: selectFrom }), insert: insertInto };
  return { db: db as unknown as Db, previews, attempts };
}

const REGIME_PLAN_ORIGIN: ExecutionOrigin = {
  kind: 'regime-plan',
  planId: 'plan-1' as PlanId,
  canonicalHash: 'hash-1' as CanonicalHash,
  canonicalExitIntent: 'exit-to-usdc',
};

const QUALIFIED_BREACH_ORIGIN: ExecutionOrigin = {
  kind: 'qualified-breach',
  breachDirection: LOWER_BOUND_BREACH,
};

describe('PlanExecutionOriginStorage (regime-plan origin persistence)', () => {
  describe('savePreview / getPreview', () => {
    it('round-trips a regime-plan origin through the preview row', async () => {
      const { db } = makeFakeDb();
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('preview'));

      const { previewId } = await adapter.savePreview(
        makePositionId('position-1'),
        {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'stale' },
          estimatedAt: 1_000,
        },
        REGIME_PLAN_ORIGIN,
      );

      const stored = await adapter.getPreview(previewId);

      expect(stored).not.toBeNull();
      expect(stored?.origin).toEqual(REGIME_PLAN_ORIGIN);
    });

    it('round-trips a qualified-breach origin through the preview row, unaffected by the new plan columns', async () => {
      const { db } = makeFakeDb();
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('preview'));

      const { previewId } = await adapter.savePreview(
        makePositionId('position-1'),
        {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'stale' },
          estimatedAt: 1_000,
        },
        QUALIFIED_BREACH_ORIGIN,
      );

      const stored = await adapter.getPreview(previewId);

      expect(stored).not.toBeNull();
      expect(stored?.origin).toEqual(QUALIFIED_BREACH_ORIGIN);
    });
  });

  describe('saveAttempt / getAttempt', () => {
    it('round-trips a regime-plan origin through the execution attempt row', async () => {
      const { db } = makeFakeDb();
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('attempt'));

      await adapter.saveAttempt({
        attemptId: 'attempt-1',
        positionId: makePositionId('position-1'),
        origin: REGIME_PLAN_ORIGIN,
        lifecycleState: { kind: 'awaiting-signature' },
        completedSteps: [],
        transactionReferences: [],
      });

      const stored = await adapter.getAttempt('attempt-1');

      expect(stored).not.toBeNull();
      expect(stored?.origin).toEqual(REGIME_PLAN_ORIGIN);
      expect(stored?.attemptId).toBe('attempt-1');
    });

    it('round-trips a qualified-breach origin through the execution attempt row', async () => {
      const { db } = makeFakeDb();
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('attempt'));

      await adapter.saveAttempt({
        attemptId: 'attempt-2',
        positionId: makePositionId('position-1'),
        origin: QUALIFIED_BREACH_ORIGIN,
        lifecycleState: { kind: 'awaiting-signature' },
        completedSteps: [],
        transactionReferences: [],
      });

      const stored = await adapter.getAttempt('attempt-2');

      expect(stored).not.toBeNull();
      expect(stored?.origin).toEqual(QUALIFIED_BREACH_ORIGIN);
    });

    it('throws when a stored regime-plan row is missing required plan fields', async () => {
      const { db } = makeFakeDb({
        attemptRows: [
          {
            attemptId: 'attempt-corrupt',
            positionId: 'position-1',
            previewId: null,
            episodeId: null,
            originKind: 'regime-plan',
            directionKind: null,
            planId: null,
            canonicalHash: null,
            canonicalExitIntent: null,
            lifecycleStateKind: 'awaiting-signature',
            completedStepsJson: [],
            transactionRefsJson: [],
          },
        ],
      });
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('attempt'));

      await expect(adapter.getAttempt('attempt-corrupt')).rejects.toThrow(
        'originFromRow: incomplete regime-plan origin row',
      );
    });

    it('throws when a stored regime-plan row has an unrecognized canonicalExitIntent', async () => {
      const { db } = makeFakeDb({
        attemptRows: [
          {
            attemptId: 'attempt-bad-intent',
            positionId: 'position-1',
            previewId: null,
            episodeId: null,
            originKind: 'regime-plan',
            directionKind: null,
            planId: 'plan-1',
            canonicalHash: 'hash-1',
            canonicalExitIntent: 'exit-to-the-moon',
            lifecycleStateKind: 'awaiting-signature',
            completedStepsJson: [],
            transactionRefsJson: [],
          },
        ],
      });
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('attempt'));

      await expect(adapter.getAttempt('attempt-bad-intent')).rejects.toThrow(
        'originFromRow: unknown canonicalExitIntent exit-to-the-moon',
      );
    });

    it('updates an existing attempt in place via onConflictDoUpdate, preserving the regime-plan origin', async () => {
      const { db, attempts } = makeFakeDb();
      const adapter = new OperationalStorageAdapter(db, new FakeIdGeneratorPort('attempt'));

      await adapter.saveAttempt({
        attemptId: 'attempt-3',
        positionId: makePositionId('position-1'),
        origin: REGIME_PLAN_ORIGIN,
        lifecycleState: { kind: 'awaiting-signature' },
        completedSteps: [],
        transactionReferences: [],
      });
      await adapter.saveAttempt({
        attemptId: 'attempt-3',
        positionId: makePositionId('position-1'),
        origin: REGIME_PLAN_ORIGIN,
        lifecycleState: { kind: 'submitted' },
        completedSteps: [],
        transactionReferences: [],
      });

      expect(attempts).toHaveLength(1);
      const stored = await adapter.getAttempt('attempt-3');
      expect(stored?.lifecycleState).toEqual({ kind: 'submitted' });
      expect(stored?.origin).toEqual(REGIME_PLAN_ORIGIN);
    });
  });
});
