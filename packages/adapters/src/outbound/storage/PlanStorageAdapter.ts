import { and, eq, isNull, lte } from 'drizzle-orm';
import type { Db } from './db.js';
import { positionPlans, planResultOutbox } from './schema/index.js';
import type {
  PlanRepository,
  PlanRequestParams,
  PlanRequestResult,
  PlanResponseParams,
  PlanDecisionParams,
  PlanExecutionLinkParams,
  PlanTerminalOutcomeParams,
  TerminalOutcomeCommitResult,
  PlanResultClaim,
  PlanRetryScheduleParams,
  PlanDeliveryCompletionParams,
  PlanPermanentFailureParams,
  PlanLifecycleStateUpdateParams,
} from '@clmm/application';
import type {
  PositionPlan,
  PlanLifecycleState,
  PlanAction,
  PlanId,
  CanonicalHash,
  PositionId,
  ClockTimestamp,
} from '@clmm/domain';

type StoredPlan = {
  planId: string;
  canonicalHash: string;
  positionId: string;
  walletId: string;
  requestedAt: number;
  attemptId: string | null;
  decisionKind: string | null;
  resultIdempotencyKey: string | null;
  executionOriginJson: Record<string, unknown> | null;
  lifecycleStateJson: Record<string, unknown> | null;
};

function actionKindToString(action: PlanAction): string {
  return action.kind;
}

function rowToStoredPlan(row: {
  planId: string;
  canonicalHash: string;
  positionId: string;
  walletId: string;
  requestedAt: number | string;
  attemptId: string | null;
  decisionKind: string | null;
  resultIdempotencyKey: string | null;
  executionOriginJson: unknown;
  lifecycleStateJson: unknown;
}): StoredPlan {
  return {
    planId: row.planId,
    canonicalHash: row.canonicalHash,
    positionId: row.positionId,
    walletId: row.walletId,
    requestedAt: Number(row.requestedAt),
    attemptId: row.attemptId ?? null,
    decisionKind: row.decisionKind ?? null,
    resultIdempotencyKey: row.resultIdempotencyKey ?? null,
    executionOriginJson: (row.executionOriginJson as Record<string, unknown>) ?? null,
    lifecycleStateJson: (row.lifecycleStateJson as Record<string, unknown>) ?? null,
  };
}

/**
 * `lifecycleStateJson` is the single source of truth for a plan's state; the
 * relational columns (`lifecycle_kind`, `decision_kind`, `execution_origin_json`)
 * are a queryable mirror derived from it, never an independent representation.
 * Every write path funnels through this so the mirror can never drift from
 * the JSON the way it did when transitions patched relational columns alone.
 */
function relationalPatchForState(state: PlanLifecycleState): {
  lifecycleKind: string;
  decisionKind: string | null;
  executionOriginJson: Record<string, unknown> | null;
  lifecycleStateJson: Record<string, unknown>;
} {
  const executionOrigin = 'executionOrigin' in state ? (state.executionOrigin ?? null) : null;
  const decisionKind = 'outcome' in state ? state.outcome.kind : null;
  return {
    lifecycleKind: state.kind,
    decisionKind,
    executionOriginJson: (executionOrigin as unknown as Record<string, unknown>) ?? null,
    lifecycleStateJson: state as unknown as Record<string, unknown>,
  };
}

/**
 * Recovers the `ExecutionOrigin` for a plan that is not itself carrying a
 * fully-formed `PlanLifecycleState` yet (e.g. a row whose only prior write
 * was `acceptResponse`). Never fabricates fields: it either reads the origin
 * already embedded in `lifecycleStateJson`, or reads the raw origin the
 * caller stored via `executionOriginJson`, gated on an attempt having been
 * linked — matching the domain reducer's own gating for result-pending /
 * reported states.
 */
function resolveExecutionOrigin(row: StoredPlan): unknown {
  if (row.lifecycleStateJson && 'executionOrigin' in row.lifecycleStateJson) {
    return (row.lifecycleStateJson as { executionOrigin: unknown }).executionOrigin ?? null;
  }
  if (row.attemptId && row.executionOriginJson) {
    return row.executionOriginJson;
  }
  return null;
}

export class PlanStorageAdapter implements PlanRepository {
  constructor(private readonly db: Db) {}

  async createRequest(params: PlanRequestParams): Promise<PlanRequestResult> {
    const existingRows = await this.db
      .select()
      .from(positionPlans)
      .where(
        and(
          eq(positionPlans.planId, params.planId),
          eq(positionPlans.canonicalHash, params.canonicalHash),
        ),
      );

    if (existingRows.length > 0) {
      return { kind: 'exact-replay' };
    }

    const conflictingRows = await this.db
      .select()
      .from(positionPlans)
      .where(eq(positionPlans.planId, params.planId));

    if (conflictingRows.length > 0) {
      return { kind: 'conflict' };
    }

    const state: PlanLifecycleState = { kind: 'requested' };

    await this.db.insert(positionPlans).values({
      planId: params.planId,
      canonicalHash: params.canonicalHash,
      positionId: params.positionId,
      walletId: params.walletId,
      requestedAt: params.requestedAt,
      actionKind: actionKindToString(params.action),
      actionReasons: [],
      deliveryAttempts: 0,
      ...relationalPatchForState(state),
    });

    return { kind: 'created' };
  }

  async acceptResponse(
    params: PlanResponseParams,
  ): Promise<{ kind: 'accepted' } | { kind: 'conflict-detected' }> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(positionPlans)
        .where(
          and(
            eq(positionPlans.planId, params.planId),
            eq(positionPlans.lifecycleKind, 'requested'),
          ),
        )
        .for('update');

      const [existing] = rows;
      if (!existing) {
        return { kind: 'conflict-detected' };
      }

      const advisoryAction: PlanAction = params.advisoryAction;
      const state: PlanLifecycleState = {
        kind: 'advisory-ready',
        advisoryAction,
        regimeResponse: params.regimeResponse,
      };

      await tx
        .update(positionPlans)
        .set({
          respondedAt: params.respondedAt,
          asOfAt: params.asOfAt,
          expiresAt: params.expiresAt,
          actionReasons: [params.regimeResponse.regime, params.regimeResponse.suitability],
          ...relationalPatchForState(state),
          executionOriginJson: params.executionOriginJson ?? null,
        })
        .where(eq(positionPlans.planId, params.planId));

      return { kind: 'accepted' };
    }) as Promise<{ kind: 'accepted' } | { kind: 'conflict-detected' }>;
  }

  async getCurrentPlan(positionId: PositionId): Promise<PositionPlan | null> {
    const rows = await this.db
      .select()
      .from(positionPlans)
      .where(eq(positionPlans.positionId, positionId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0]!;
    const storedPlan = rowToStoredPlan(row);

    if (storedPlan.lifecycleStateJson === null) {
      throw new Error(`Plan ${storedPlan.planId} has no lifecycle state recorded`);
    }

    return {
      planId: storedPlan.planId as PlanId,
      canonicalHash: storedPlan.canonicalHash as CanonicalHash,
      positionId: storedPlan.positionId as PositionId,
      createdAt: storedPlan.requestedAt as ClockTimestamp,
      state: storedPlan.lifecycleStateJson as unknown as PlanLifecycleState,
    };
  }

  async getPlanActionKind(planId: PlanId): Promise<string | null> {
    const rows = await this.db
      .select({ actionKind: positionPlans.actionKind })
      .from(positionPlans)
      .where(eq(positionPlans.planId, planId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return rows[0]!.actionKind;
  }

  async recordDecision(params: PlanDecisionParams): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(positionPlans)
        .where(eq(positionPlans.planId, params.planId))
        .for('update');

      const [row] = rows;
      if (!row) {
        return;
      }

      const stored = rowToStoredPlan(row);
      const state = {
        kind: 'result-pending',
        outcome: params.decision,
        executionOrigin: resolveExecutionOrigin(stored),
      } as PlanLifecycleState;

      await tx
        .update(positionPlans)
        .set(relationalPatchForState(state))
        .where(eq(positionPlans.planId, params.planId));
    });
  }

  async linkExecutionAttempt(params: PlanExecutionLinkParams): Promise<void> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(positionPlans)
        .where(and(eq(positionPlans.planId, params.planId), isNull(positionPlans.attemptId)))
        .for('update');

      if (rows.length === 0) {
        throw new Error(`Plan ${params.planId} already linked or not found`);
      }

      await tx
        .update(positionPlans)
        .set({ attemptId: params.attemptId })
        .where(eq(positionPlans.planId, params.planId));
    });
  }

  async commitTerminalOutcome(
    params: PlanTerminalOutcomeParams,
  ): Promise<TerminalOutcomeCommitResult> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(positionPlans)
        .where(eq(positionPlans.planId, params.planId))
        .for('update');

      const [row] = rows;
      if (!row) {
        return { kind: 'plan-not-found' };
      }

      const stored = rowToStoredPlan(row);

      // A terminal outcome has already been committed for this plan: treat
      // the call as an idempotent no-op rather than clobbering the existing
      // outcome (and possibly leaving a second, unrelated outbox entry).
      if (stored.resultIdempotencyKey !== null) {
        return { kind: 'committed' };
      }

      const now = params.committedAt;
      const state = {
        kind: 'result-pending',
        outcome: params.outcome,
        executionOrigin: resolveExecutionOrigin(stored),
      } as PlanLifecycleState;

      await tx
        .update(positionPlans)
        .set({
          ...relationalPatchForState(state),
          canonicalResultJson: params.canonicalResult.payload,
          resultIdempotencyKey: params.resultIdempotencyKey,
        })
        .where(eq(positionPlans.planId, params.planId));

      await tx
        .insert(planResultOutbox)
        .values({
          resultId: params.canonicalResult.id,
          planId: params.planId,
          canonicalResultJson: params.canonicalResult.payload,
          idempotencyKey: params.resultIdempotencyKey,
          attemptCount: 0,
          nextAttemptAt: now + 300000,
          createdAt: now,
        })
        .onConflictDoNothing();

      return { kind: 'committed' };
    }) as Promise<TerminalOutcomeCommitResult>;
  }

  async claimDueResult(): Promise<PlanResultClaim | null> {
    const now = Date.now();

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(planResultOutbox)
        .where(and(isNull(planResultOutbox.deliveredAt), lte(planResultOutbox.nextAttemptAt, now)))
        .for('update', { skipLocked: true })
        .limit(1);

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0]!;

      await tx
        .update(planResultOutbox)
        .set({
          attemptCount: Number(row.attemptCount) + 1,
          nextAttemptAt: now + 300000,
        })
        .where(eq(planResultOutbox.resultId, row.resultId));

      return {
        resultId: row.resultId,
        planId: row.planId as PlanId,
        canonicalResult: {
          id: row.resultId,
          payload: row.canonicalResultJson as Record<string, unknown>,
        },
        idempotencyKey: row.idempotencyKey,
        attemptCount: Number(row.attemptCount) + 1,
      };
    }) as Promise<PlanResultClaim | null>;
  }

  async rescheduleRetry(params: PlanRetryScheduleParams): Promise<void> {
    await this.db
      .update(planResultOutbox)
      .set({
        nextAttemptAt: params.nextAttemptAt,
        lastErrorClass: params.lastError ?? null,
      })
      .where(eq(planResultOutbox.resultId, params.resultId));
  }

  async completeDelivery(params: PlanDeliveryCompletionParams): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboxRows = await tx
        .select({ planId: planResultOutbox.planId, deliveredAt: planResultOutbox.deliveredAt })
        .from(planResultOutbox)
        .where(eq(planResultOutbox.resultId, params.resultId))
        .for('update')
        .limit(1);

      if (outboxRows.length === 0) {
        return;
      }

      if (outboxRows[0]!.deliveredAt !== null) {
        return;
      }

      const { planId } = outboxRows[0]!;

      await tx
        .update(planResultOutbox)
        .set({ deliveredAt: params.deliveredAt })
        .where(eq(planResultOutbox.resultId, params.resultId));

      const planRows = await tx
        .select()
        .from(positionPlans)
        .where(eq(positionPlans.planId, planId))
        .for('update');

      const [planRow] = planRows;
      if (!planRow) {
        return;
      }

      const stored = rowToStoredPlan(planRow);
      const storedOutcome = (stored.lifecycleStateJson as { outcome?: { kind: string } } | null)
        ?.outcome;
      const state = {
        kind: 'reported',
        outcome: storedOutcome ?? { kind: 'executed' },
        executionOrigin: resolveExecutionOrigin(stored),
        reportedAt: params.deliveredAt,
      } as PlanLifecycleState;

      await tx
        .update(positionPlans)
        .set({
          ...relationalPatchForState(state),
          deliveredAt: params.deliveredAt,
        })
        .where(eq(positionPlans.planId, planId));
    });
  }

  async recordPermanentFailure(params: PlanPermanentFailureParams): Promise<void> {
    await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(positionPlans)
        .where(eq(positionPlans.planId, params.planId))
        .for('update');

      const [row] = rows;
      if (!row) {
        return;
      }

      const stored = rowToStoredPlan(row);
      const state = {
        kind: 'report-failed',
        outcome: { kind: 'failed' },
        executionOrigin: resolveExecutionOrigin(stored),
      } as PlanLifecycleState;

      await tx
        .update(positionPlans)
        .set({
          ...relationalPatchForState(state),
          lastErrorClass: params.reason,
        })
        .where(eq(positionPlans.planId, params.planId));
    });
  }

  async failDelivery(
    params: PlanPermanentFailureParams & PlanDeliveryCompletionParams,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const outboxRows = await tx
        .select({ planId: planResultOutbox.planId, deliveredAt: planResultOutbox.deliveredAt })
        .from(planResultOutbox)
        .where(eq(planResultOutbox.resultId, params.resultId))
        .for('update')
        .limit(1);

      if (outboxRows.length === 0) {
        return;
      }

      if (outboxRows[0]!.deliveredAt !== null) {
        return;
      }

      const { planId } = outboxRows[0]!;

      await tx
        .update(planResultOutbox)
        .set({ deliveredAt: params.deliveredAt })
        .where(eq(planResultOutbox.resultId, params.resultId));

      const planRows = await tx
        .select()
        .from(positionPlans)
        .where(eq(positionPlans.planId, planId))
        .for('update');

      const [planRow] = planRows;
      if (!planRow) {
        return;
      }

      const stored = rowToStoredPlan(planRow);
      const storedOutcome = (stored.lifecycleStateJson as { outcome?: { kind: string } } | null)
        ?.outcome;
      const state = {
        kind: 'report-failed',
        outcome: storedOutcome ?? { kind: 'failed' },
        executionOrigin: resolveExecutionOrigin(stored),
      } as PlanLifecycleState;

      await tx
        .update(positionPlans)
        .set({
          ...relationalPatchForState(state),
          lastErrorClass: params.reason,
        })
        .where(eq(positionPlans.planId, planId));
    });
  }

  async updateLifecycleState(params: PlanLifecycleStateUpdateParams): Promise<void> {
    await this.db
      .update(positionPlans)
      .set(relationalPatchForState(params.lifecycleState))
      .where(eq(positionPlans.planId, params.planId));
  }
}
