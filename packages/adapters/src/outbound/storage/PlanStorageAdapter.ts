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
  RegimeResponse,
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
  executionOriginJson: Record<string, unknown> | null;
  lifecycleStateJson: Record<string, unknown> | null;
};

function actionKindToString(action: PlanAction): string {
  return action.kind;
}

function stringToAction(kind: string): PlanAction {
  if (kind === 'HOLD' || kind === 'STAND_DOWN' || kind === 'REQUEST_EXIT_CLMM') {
    return { kind } as PlanAction;
  }
  throw new Error(`Unknown action kind: ${kind}`);
}

function buildPlanLifecycleState(row: StoredPlan): PlanLifecycleState {
  switch (row.lifecycleKind as PlanLifecycleState['kind']) {
    case 'requested':
      return { kind: 'requested' };
    case 'advisory-ready':
      return {
        kind: 'advisory-ready',
        advisoryAction: stringToAction(row.actionKind),
        regimeResponse: {
          kind: 'regime-response',
          regime: (row.actionReasons[0] as RegimeResponse['regime']) ?? 'UP',
          suitability: (row.actionReasons[1] as RegimeResponse['suitability']) ?? 'UNKNOWN',
        },
      };
    case 'exit-previewed':
    case 'awaiting-signature':
    case 'submitted':
    case 'result-pending':
    case 'reported': {
      const executionOrigin = row.executionOriginJson as
        | {
            kind: 'regime-plan';
            planId: string;
            canonicalHash: string;
            canonicalExitIntent: string;
          }
        | { kind: 'qualified-breach'; breachDirection: { kind: string } }
        | null;
      if (!executionOrigin) {
        throw new Error(
          `Missing executionOrigin for plan ${row.planId} in state ${row.lifecycleKind}`,
        );
      }
      if (executionOrigin.kind === 'regime-plan') {
        const regimePlanOrigin = executionOrigin;
        return buildRegimePlanState(row, regimePlanOrigin);
      } else {
        const breachOrigin = executionOrigin;
        return buildBreachOriginState(row, breachOrigin);
      }
    }
    case 'report-failed': {
      return {
        kind: 'report-failed',
        outcome: { kind: 'failed' },
        executionOrigin: null,
      };
    }
    case 'conflict':
      return {
        kind: 'conflict',
        priorPlanId: row.planId as PlanId,
        canonicalHash: row.canonicalHash as CanonicalHash,
        conflictingHash: row.canonicalHash as CanonicalHash,
      };
    case 'superseded': {
      const executionOrigin = row.executionOriginJson as {
        kind: 'qualified-breach';
        breachDirection: { kind: string };
      } | null;
      if (!executionOrigin || executionOrigin.kind !== 'qualified-breach') {
        throw new Error(`Missing or invalid breachOrigin for superseded plan ${row.planId}`);
      }
      return {
        kind: 'superseded',
        priorPlan: {
          planId: row.planId as PlanId,
          canonicalHash: row.canonicalHash as CanonicalHash,
          state: { kind: 'requested' },
        },
        breachOrigin: {
          kind: 'qualified-breach',
          breachDirection: executionOrigin.breachDirection as
            | { kind: 'lower-bound-breach' }
            | { kind: 'upper-bound-breach' },
        },
      };
    }
    default:
      return { kind: 'requested' };
  }
}

function buildRegimePlanState(
  row: StoredPlan,
  origin: {
    kind: 'regime-plan';
    planId: string;
    canonicalHash: string;
    canonicalExitIntent: string;
  },
): PlanLifecycleState {
  const base = {
    kind: 'regime-plan' as const,
    planId: origin.planId as PlanId,
    canonicalHash: origin.canonicalHash as CanonicalHash,
    canonicalExitIntent: origin.canonicalExitIntent as 'exit-to-usdc' | 'exit-to-sol',
  };

  switch (row.lifecycleKind as PlanLifecycleState['kind']) {
    case 'exit-previewed':
      return {
        kind: 'exit-previewed',
        advisoryAction: stringToAction(row.actionKind),
        preview: {
          plan: {
            steps: [],
            postExitPosture: { kind: origin.canonicalExitIntent as 'exit-to-usdc' | 'exit-to-sol' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'stale' },
          estimatedAt: row.asOfAt ?? row.requestedAt,
        },
        executionOrigin: base,
      };
    case 'awaiting-signature':
      return {
        kind: 'awaiting-signature',
        advisoryAction: stringToAction(row.actionKind),
        executionOrigin: base,
      };
    case 'submitted':
      return {
        kind: 'submitted',
        advisoryAction: stringToAction(row.actionKind),
        executionOrigin: base,
      };
    case 'result-pending': {
      const outcomeKind = row.decisionKind ?? 'acknowledged';
      const outcome =
        outcomeKind === 'executed'
          ? { kind: 'executed' as const }
          : outcomeKind === 'failed'
            ? { kind: 'failed' as const }
            : {
                kind: outcomeKind as
                  | 'acknowledged'
                  | 'stand-down'
                  | 'expired'
                  | 'position-changed'
                  | 'rejected',
              };
      return {
        kind: 'result-pending',
        outcome,
        executionOrigin: row.attemptId ? base : null,
      };
    }
    case 'reported':
      return {
        kind: 'reported',
        outcome: { kind: 'executed' },
        executionOrigin: row.attemptId ? base : null,
        reportedAt: (row.deliveredAt ?? row.requestedAt) as ClockTimestamp,
      };
    default:
      throw new Error(`Unexpected lifecycle kind ${row.lifecycleKind} for regime-plan origin`);
  }
}

function buildBreachOriginState(
  row: StoredPlan,
  origin: { kind: 'qualified-breach'; breachDirection: { kind: string } },
): PlanLifecycleState {
  switch (row.lifecycleKind as PlanLifecycleState['kind']) {
    case 'exit-previewed':
      return {
        kind: 'exit-previewed',
        advisoryAction: stringToAction(row.actionKind),
        preview: {
          plan: {
            steps: [],
            postExitPosture: {
              kind:
                origin.breachDirection.kind === 'lower-bound-breach'
                  ? 'exit-to-usdc'
                  : ('exit-to-sol' as 'exit-to-usdc' | 'exit-to-sol'),
            },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'stale' },
          estimatedAt: row.asOfAt ?? row.requestedAt,
        },
        executionOrigin: {
          kind: 'qualified-breach',
          breachDirection: origin.breachDirection as
            | { kind: 'lower-bound-breach' }
            | { kind: 'upper-bound-breach' },
        },
      };
    default:
      throw new Error(`Unexpected lifecycle kind ${row.lifecycleKind} for breach-origin`);
  }
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

    await this.db.insert(positionPlans).values({
      planId: params.planId,
      canonicalHash: params.canonicalHash,
      positionId: params.positionId,
      walletId: params.walletId,
      requestedAt: params.requestedAt,
      actionKind: actionKindToString(params.action),
      actionReasons: [],
      lifecycleKind: 'requested',
      deliveryAttempts: 0,
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

      await tx
        .update(positionPlans)
        .set({
          respondedAt: params.respondedAt,
          asOfAt: params.asOfAt,
          expiresAt: params.expiresAt,
          actionKind: 'HOLD',
          actionReasons: [params.regimeResponse.regime, params.regimeResponse.suitability],
          lifecycleKind: 'advisory-ready',
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
    const storedPlan: StoredPlan = {
      planId: row.planId,
      canonicalHash: row.canonicalHash,
      positionId: row.positionId,
      walletId: row.walletId,
      requestedAt: Number(row.requestedAt),
      respondedAt: row.respondedAt ? Number(row.respondedAt) : null,
      asOfAt: row.asOfAt ? Number(row.asOfAt) : null,
      expiresAt: row.expiresAt ? Number(row.expiresAt) : null,
      actionKind: row.actionKind,
      actionReasons: Array.isArray(row.actionReasons) ? (row.actionReasons as string[]) : [],
      snapshotFingerprint: row.snapshotFingerprint ?? null,
      lifecycleKind: row.lifecycleKind,
      decisionKind: row.decisionKind ?? null,
      attemptId: row.attemptId ?? null,
      canonicalResultJson: row.canonicalResultJson as Record<string, unknown> | null,
      resultIdempotencyKey: row.resultIdempotencyKey ?? null,
      deliveryAttempts: Number(row.deliveryAttempts),
      nextAttemptAt: row.nextAttemptAt ? Number(row.nextAttemptAt) : null,
      lastErrorClass: row.lastErrorClass ?? null,
      deliveredAt: row.deliveredAt ? Number(row.deliveredAt) : null,
      executionOriginJson: (row.executionOriginJson as Record<string, unknown>) ?? null,
      lifecycleStateJson: (row.lifecycleStateJson as Record<string, unknown>) ?? null,
    };

    return {
      planId: storedPlan.planId as PlanId,
      canonicalHash: storedPlan.canonicalHash as CanonicalHash,
      positionId: storedPlan.positionId as PositionId,
      createdAt: storedPlan.requestedAt as ClockTimestamp,
      state:
        storedPlan.lifecycleStateJson !== null
          ? (storedPlan.lifecycleStateJson as PlanLifecycleState)
          : buildPlanLifecycleState(storedPlan),
    };
  }

  async recordDecision(params: PlanDecisionParams): Promise<void> {
    await this.db
      .update(positionPlans)
      .set({
        decisionKind: params.decision.kind,
        lifecycleKind: 'result-pending',
      })
      .where(eq(positionPlans.planId, params.planId));
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

      const [plan] = rows;
      if (!plan) {
        return { kind: 'plan-not-found' };
      }

      const lifecycleKind = 'result-pending';

      const now = params.committedAt;

      await tx
        .update(positionPlans)
        .set({
          decisionKind: params.outcome.kind,
          lifecycleKind,
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
        .select({ planId: planResultOutbox.planId })
        .from(planResultOutbox)
        .where(eq(planResultOutbox.resultId, params.resultId))
        .for('update')
        .limit(1);

      if (outboxRows.length === 0) {
        return;
      }

      const { planId } = outboxRows[0]!;

      await tx
        .update(planResultOutbox)
        .set({ deliveredAt: params.deliveredAt })
        .where(eq(planResultOutbox.resultId, params.resultId));

      await tx
        .update(positionPlans)
        .set({
          lifecycleKind: 'reported',
          deliveredAt: params.deliveredAt,
        })
        .where(eq(positionPlans.planId, planId));
    });
  }

  async recordPermanentFailure(params: PlanPermanentFailureParams): Promise<void> {
    await this.db
      .update(positionPlans)
      .set({
        lifecycleKind: 'report-failed',
        lastErrorClass: params.reason,
      })
      .where(eq(positionPlans.planId, params.planId));
  }

  async updateLifecycleState(params: PlanLifecycleStateUpdateParams): Promise<void> {
    await this.db
      .update(positionPlans)
      .set({
        lifecycleStateJson: params.lifecycleState as unknown as Record<string, unknown>,
      })
      .where(eq(positionPlans.planId, params.planId));
  }
}
