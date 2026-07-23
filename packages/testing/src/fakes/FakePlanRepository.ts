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
      lifecycleKind: 'requested',
      decisionKind: null,
      attemptId: null,
      canonicalResultJson: null,
      resultIdempotencyKey: null,
      deliveryAttempts: 0,
      nextAttemptAt: null,
      lastErrorClass: null,
      deliveredAt: null,
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

    plan.respondedAt = params.respondedAt;
    plan.asOfAt = params.asOfAt;
    plan.expiresAt = params.expiresAt;
    plan.actionKind = 'HOLD';
    plan.actionReasons = [params.regimeResponse.regime, params.regimeResponse.suitability];
    plan.lifecycleKind = 'advisory-ready';

    return { kind: 'accepted' };
  }

  async getCurrentPlan(positionId: PositionId): Promise<PositionPlan | null> {
    const plan = Array.from(this.plans.values()).find((p) => p.positionId === positionId);
    if (!plan) {
      return null;
    }

    return this.buildPositionPlan(plan);
  }

  async recordDecision(params: PlanDecisionParams): Promise<void> {
    const plan = this.plans.get(params.planId);
    if (plan) {
      plan.decisionKind = params.decision.kind;
      plan.lifecycleKind = 'result-pending';
    }
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

    plan.decisionKind = params.outcome.kind;
    plan.lifecycleKind = 'result-pending';
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
    if (outbox) {
      outbox.deliveredAt = params.deliveredAt;
    }

    const plan = Array.from(this.plans.values()).find(
      (p) =>
        p.resultIdempotencyKey &&
        this.resultIdempotencyIndex.get(p.resultIdempotencyKey) === params.resultId,
    );
    if (plan) {
      plan.lifecycleKind = 'reported';
      plan.deliveredAt = params.deliveredAt;
    }
  }

  async recordPermanentFailure(params: PlanPermanentFailureParams): Promise<void> {
    const plan = this.plans.get(params.planId);
    if (plan) {
      plan.lifecycleKind = 'report-failed';
      plan.lastErrorClass = params.reason;
    }
  }

  private buildPositionPlan(plan: StoredPlan): PositionPlan {
    const state = this.buildLifecycleState(plan);
    return {
      planId: plan.planId,
      canonicalHash: plan.canonicalHash,
      positionId: plan.positionId,
      createdAt: plan.requestedAt,
      state,
    };
  }

  private buildLifecycleState(plan: StoredPlan): PlanLifecycleState {
    switch (plan.lifecycleKind) {
      case 'requested':
        return { kind: 'requested' };
      case 'advisory-ready':
        return {
          kind: 'advisory-ready',
          advisoryAction: { kind: plan.actionKind } as PlanAction,
          regimeResponse: {
            kind: 'regime-response',
            regime: (plan.actionReasons[0] as 'UP' | 'DOWN' | 'CHOP') ?? 'UP',
            suitability:
              (plan.actionReasons[1] as 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN') ?? 'UNKNOWN',
          },
        };
      case 'exit-previewed':
        return {
          kind: 'exit-previewed',
          advisoryAction: { kind: plan.actionKind } as PlanAction,
          preview: {
            plan: {
              steps: [],
              postExitPosture: { kind: 'exit-to-usdc' },
              swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
            },
            freshness: { kind: 'stale' },
            estimatedAt: plan.asOfAt ?? plan.requestedAt,
          },
          executionOrigin: {
            kind: 'regime-plan',
            planId: plan.planId,
            canonicalHash: plan.canonicalHash,
            canonicalExitIntent: 'exit-to-usdc',
          },
        };
      case 'awaiting-signature':
        return {
          kind: 'awaiting-signature',
          advisoryAction: { kind: plan.actionKind } as PlanAction,
          executionOrigin: {
            kind: 'regime-plan',
            planId: plan.planId,
            canonicalHash: plan.canonicalHash,
            canonicalExitIntent: 'exit-to-usdc',
          },
        };
      case 'submitted':
        return {
          kind: 'submitted',
          advisoryAction: { kind: plan.actionKind } as PlanAction,
          executionOrigin: {
            kind: 'regime-plan',
            planId: plan.planId,
            canonicalHash: plan.canonicalHash,
            canonicalExitIntent: 'exit-to-usdc',
          },
        };
      case 'result-pending': {
        const outcomeKind = plan.decisionKind ?? 'acknowledged';
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
          executionOrigin: plan.attemptId
            ? {
                kind: 'regime-plan',
                planId: plan.planId,
                canonicalHash: plan.canonicalHash,
                canonicalExitIntent: 'exit-to-usdc',
              }
            : null,
        };
      }
      case 'reported':
        return {
          kind: 'reported',
          outcome: { kind: 'executed' },
          executionOrigin: plan.attemptId
            ? {
                kind: 'regime-plan',
                planId: plan.planId,
                canonicalHash: plan.canonicalHash,
                canonicalExitIntent: 'exit-to-usdc',
              }
            : null,
          reportedAt: plan.deliveredAt ?? plan.requestedAt,
        };
      case 'report-failed':
        return {
          kind: 'report-failed',
          outcome: { kind: 'failed' },
          executionOrigin: null,
        };
      case 'conflict':
        return {
          kind: 'conflict',
          priorPlanId: plan.planId,
          canonicalHash: plan.canonicalHash,
          conflictingHash: plan.canonicalHash,
        };
      case 'superseded':
        return {
          kind: 'superseded',
          priorPlan: {
            planId: plan.planId,
            canonicalHash: plan.canonicalHash,
            state: { kind: 'requested' },
          },
          breachOrigin: {
            kind: 'qualified-breach',
            breachDirection: { kind: 'lower-bound-breach' },
          },
        };
      default:
        return { kind: 'requested' };
    }
  }
}
