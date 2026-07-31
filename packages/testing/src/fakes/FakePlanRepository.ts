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
  PlanFailDeliveryParams,
  PlanLifecycleStateUpdateParams,
  CanonicalResult,
} from '@clmm/application';
import type {
  PositionPlan,
  PlanLifecycleState,
  PlanId,
  CanonicalHash,
  PositionId,
  WalletId,
  ClockTimestamp,
  PlanAction,
} from '@clmm/domain';

type StoredPlan = {
  planId: PlanId;
  canonicalHash: CanonicalHash;
  positionId: PositionId;
  walletId: WalletId;
  requestedAt: ClockTimestamp;
  respondedAt: ClockTimestamp | null;
  asOfAt: ClockTimestamp | null;
  expiresAt: ClockTimestamp | null;
  actionKind: string;
  actionReasons: string[];
  snapshotFingerprint: string | undefined;
  lifecycleKind: string;
  decisionKind: string | null;
  attemptId: string | null;
  canonicalResultJson: Record<string, unknown> | null;
  resultIdempotencyKey: string | null;
  deliveryAttempts: number;
  nextAttemptAt: ClockTimestamp | null;
  lastErrorClass: string | null;
  deliveredAt: ClockTimestamp | null;
  executionOriginJson: Record<string, unknown> | null;
  lifecycleStateJson: PlanLifecycleState | null;
};

type StoredOutbox = {
  resultId: string;
  planId: PlanId;
  canonicalResult: CanonicalResult;
  idempotencyKey: string;
  attemptCount: number;
  nextAttemptAt: ClockTimestamp;
  lastErrorClass: string | null;
  deliveredAt: ClockTimestamp | null;
  createdAt: ClockTimestamp;
};

/**
 * `lifecycleStateJson` is the single source of truth for a plan's state; the
 * scalar fields (`lifecycleKind`, `decisionKind`, `executionOriginJson`) are a
 * queryable mirror derived from it, never an independent representation.
 * Every write path funnels through this so the mirror can never drift from
 * the JSON the way it did when transitions patched scalar fields alone.
 */
function relationalPatchForState(state: PlanLifecycleState): {
  lifecycleKind: string;
  decisionKind: string | null;
  executionOriginJson: Record<string, unknown> | null;
  lifecycleStateJson: PlanLifecycleState;
} {
  const executionOrigin = 'executionOrigin' in state ? (state.executionOrigin ?? null) : null;
  const decisionKind = 'outcome' in state ? state.outcome.kind : null;
  return {
    lifecycleKind: state.kind,
    decisionKind,
    executionOriginJson: (executionOrigin as unknown as Record<string, unknown>) ?? null,
    lifecycleStateJson: state,
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
function resolveExecutionOrigin(plan: StoredPlan): unknown {
  if (plan.lifecycleStateJson && 'executionOrigin' in plan.lifecycleStateJson) {
    return (plan.lifecycleStateJson as { executionOrigin: unknown }).executionOrigin ?? null;
  }
  if (plan.attemptId && plan.executionOriginJson) {
    return plan.executionOriginJson;
  }
  return null;
}

export class FakePlanRepository implements PlanRepository {
  private plans = new Map<string, StoredPlan>();
  private outbox = new Map<string, StoredOutbox>();
  private resultIdempotencyIndex = new Map<string, string>();

  async createRequest(params: PlanRequestParams): Promise<PlanRequestResult> {
    const existing = this.plans.get(params.planId);
    if (existing) {
      if (existing.canonicalHash === params.canonicalHash) {
        return { kind: 'exact-replay' };
      }
      return { kind: 'conflict' };
    }

    const conflicting = Array.from(this.plans.values()).find((p) => p.planId === params.planId);
    if (conflicting) {
      return { kind: 'conflict' };
    }

    const state: PlanLifecycleState = { kind: 'requested' };

    const plan: StoredPlan = {
      planId: params.planId,
      canonicalHash: params.canonicalHash,
      positionId: params.positionId,
      walletId: params.walletId,
      requestedAt: params.requestedAt,
      respondedAt: null,
      asOfAt: null,
      expiresAt: null,
      actionKind: params.action.kind,
      actionReasons: [],
      snapshotFingerprint: params.snapshotFingerprint,
      attemptId: null,
      canonicalResultJson: null,
      resultIdempotencyKey: null,
      deliveryAttempts: 0,
      nextAttemptAt: null,
      lastErrorClass: null,
      deliveredAt: null,
      ...relationalPatchForState(state),
    };

    this.plans.set(params.planId, plan);
    return { kind: 'created' };
  }

  async acceptResponse(
    params: PlanResponseParams,
  ): Promise<{ kind: 'accepted' } | { kind: 'conflict-detected' }> {
    const plan = this.plans.get(params.planId);
    if (!plan || plan.lifecycleKind !== 'requested') {
      return { kind: 'conflict-detected' };
    }

    const advisoryAction: PlanAction = params.advisoryAction;
    const state: PlanLifecycleState = {
      kind: 'advisory-ready',
      advisoryAction,
      regimeResponse: params.regimeResponse,
    };

    plan.respondedAt = params.respondedAt;
    plan.asOfAt = params.asOfAt;
    plan.expiresAt = params.expiresAt;
    plan.actionReasons = [params.regimeResponse.regime, params.regimeResponse.suitability];
    Object.assign(plan, relationalPatchForState(state));
    plan.executionOriginJson = params.executionOriginJson ?? null;

    return { kind: 'accepted' };
  }

  async getCurrentPlan(positionId: PositionId): Promise<PositionPlan | null> {
    const matchingPlans = Array.from(this.plans.values()).filter(
      (p) => p.positionId === positionId,
    );
    if (matchingPlans.length === 0) {
      return null;
    }
    matchingPlans.sort((a, b) => {
      if (b.requestedAt !== a.requestedAt) {
        return Number(b.requestedAt) - Number(a.requestedAt);
      }
      return b.planId.localeCompare(a.planId);
    });
    const plan = matchingPlans[0]!;

    if (plan.lifecycleStateJson === null) {
      throw new Error(`Plan ${plan.planId} has no lifecycle state recorded`);
    }

    return {
      planId: plan.planId,
      canonicalHash: plan.canonicalHash,
      positionId: plan.positionId,
      createdAt: plan.requestedAt,
      state: plan.lifecycleStateJson,
    };
  }

  async getPlanActionKind(planId: PlanId): Promise<string | null> {
    const plan = this.plans.get(planId);
    return plan?.actionKind ?? null;
  }

  async recordDecision(params: PlanDecisionParams): Promise<void> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      return;
    }

    const state = {
      kind: 'result-pending',
      outcome: params.decision,
      executionOrigin: resolveExecutionOrigin(plan),
    } as PlanLifecycleState;

    Object.assign(plan, relationalPatchForState(state));
  }

  async linkExecutionAttempt(params: PlanExecutionLinkParams): Promise<void> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      throw new Error(`Plan ${params.planId} not found`);
    }
    if (plan.attemptId !== null) {
      throw new Error(`Plan ${params.planId} already linked to attempt ${plan.attemptId}`);
    }
    plan.attemptId = params.attemptId;
  }

  async commitTerminalOutcome(
    params: PlanTerminalOutcomeParams,
  ): Promise<TerminalOutcomeCommitResult> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      return { kind: 'plan-not-found' };
    }

    // A terminal outcome has already been committed for this plan: treat the
    // call as an idempotent no-op rather than clobbering the existing outcome
    // (and possibly leaving a second, unrelated outbox entry).
    if (plan.resultIdempotencyKey !== null) {
      return { kind: 'committed' };
    }

    const state = {
      kind: 'result-pending',
      outcome: params.outcome,
      executionOrigin: resolveExecutionOrigin(plan),
    } as PlanLifecycleState;

    Object.assign(plan, relationalPatchForState(state));
    plan.canonicalResultJson = params.canonicalResult.payload;
    plan.resultIdempotencyKey = params.resultIdempotencyKey;
    plan.deliveryAttempts = 0;
    plan.nextAttemptAt = (params.committedAt + 300000) as ClockTimestamp;

    const outboxEntry: StoredOutbox = {
      resultId: params.canonicalResult.id,
      planId: params.planId,
      canonicalResult: params.canonicalResult,
      idempotencyKey: params.resultIdempotencyKey,
      attemptCount: 0,
      nextAttemptAt: (params.committedAt + 300000) as ClockTimestamp,
      lastErrorClass: null,
      deliveredAt: null,
      createdAt: params.committedAt,
    };

    this.outbox.set(params.canonicalResult.id, outboxEntry);
    this.resultIdempotencyIndex.set(params.resultIdempotencyKey, params.canonicalResult.id);

    return { kind: 'committed' };
  }

  async claimDueResult(): Promise<PlanResultClaim | null> {
    const now = Date.now();
    const due = Array.from(this.outbox.values()).find(
      (o) => o.deliveredAt === null && o.nextAttemptAt <= now,
    );

    if (!due) {
      return null;
    }

    due.attemptCount += 1;
    due.nextAttemptAt = (now + 300000) as ClockTimestamp;

    return {
      resultId: due.resultId,
      planId: due.planId,
      canonicalResult: due.canonicalResult,
      idempotencyKey: due.idempotencyKey,
      attemptCount: due.attemptCount,
    };
  }

  async rescheduleRetry(params: PlanRetryScheduleParams): Promise<void> {
    const outbox = this.outbox.get(params.resultId);
    if (outbox) {
      outbox.nextAttemptAt = params.nextAttemptAt;
      outbox.lastErrorClass = params.lastError ?? null;
    }
  }

  async completeDelivery(params: PlanDeliveryCompletionParams): Promise<void> {
    const outbox = Array.from(this.outbox.values()).find((o) => o.resultId === params.resultId);
    if (!outbox) {
      return;
    }

    if (outbox.deliveredAt !== null) {
      return;
    }

    outbox.deliveredAt = params.deliveredAt;

    const plan = Array.from(this.plans.values()).find(
      (p) =>
        p.resultIdempotencyKey &&
        this.resultIdempotencyIndex.get(p.resultIdempotencyKey) === params.resultId,
    );
    if (!plan) {
      return;
    }

    const storedOutcome =
      plan.lifecycleStateJson && 'outcome' in plan.lifecycleStateJson
        ? plan.lifecycleStateJson.outcome
        : undefined;

    const state = {
      kind: 'reported',
      outcome: storedOutcome ?? { kind: 'executed' },
      executionOrigin: resolveExecutionOrigin(plan),
      reportedAt: params.deliveredAt,
    } as PlanLifecycleState;

    Object.assign(plan, relationalPatchForState(state));
    plan.deliveredAt = params.deliveredAt;
  }

  async recordPermanentFailure(params: PlanPermanentFailureParams): Promise<void> {
    const plan = this.plans.get(params.planId);
    if (!plan) {
      return;
    }

    const state = {
      kind: 'report-failed',
      outcome: { kind: 'failed' },
      executionOrigin: resolveExecutionOrigin(plan),
    } as PlanLifecycleState;

    Object.assign(plan, relationalPatchForState(state));
    plan.lastErrorClass = params.reason;
  }

  async failDelivery(params: PlanFailDeliveryParams): Promise<void> {
    const outbox = Array.from(this.outbox.values()).find((o) => o.resultId === params.resultId);
    if (!outbox) {
      return;
    }

    if (outbox.deliveredAt !== null) {
      return;
    }

    outbox.deliveredAt = params.deliveredAt;

    const plan = this.plans.get(params.planId);
    if (!plan) {
      return;
    }

    const storedOutcome =
      plan.lifecycleStateJson && 'outcome' in plan.lifecycleStateJson
        ? plan.lifecycleStateJson.outcome
        : undefined;

    const state = {
      kind: 'report-failed',
      outcome: storedOutcome ?? { kind: 'failed' },
      executionOrigin: resolveExecutionOrigin(plan),
    } as PlanLifecycleState;

    Object.assign(plan, relationalPatchForState(state));
    plan.lastErrorClass = params.reason;
  }

  async updateLifecycleState(params: PlanLifecycleStateUpdateParams): Promise<void> {
    const plan = this.plans.get(params.planId);
    if (plan) {
      Object.assign(plan, relationalPatchForState(params.lifecycleState));
    }
  }
}
