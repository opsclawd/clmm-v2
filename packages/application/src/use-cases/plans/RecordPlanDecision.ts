import type {
  PlanRepository,
  TriggerRepository,
  ClockPort,
  ObservabilityPort,
  PlanOutcome,
} from '../../ports/index.js';
import type {
  PlanId,
  PositionId,
  WalletId,
  PlanLifecycleState,
  ExitTrigger,
  CanonicalHash,
  PlanAction,
} from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export type RecordPlanDecisionResult =
  | { readonly kind: 'recorded'; readonly resultId: string }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict-detected' }
  | { readonly kind: 'breach-supersedes'; readonly breachDirection: ExitTrigger['breachDirection'] }
  | { readonly kind: 'error'; readonly reason: string };

function isDecisionReplay(
  existingDecision: PlanOutcome | undefined,
  newDecision: PlanOutcome,
): boolean {
  if (!existingDecision) return false;
  return existingDecision.kind === newDecision.kind;
}

function buildCanonicalResult(params: {
  planId: PlanId;
  positionId: PositionId;
  decision: PlanOutcome;
  canonicalHash: CanonicalHash;
}): { id: string; payload: Record<string, unknown> } {
  const { planId, positionId, decision, canonicalHash } = params;
  const payload: Record<string, unknown> = {
    planId,
    positionId,
    decisionKind: decision.kind,
    canonicalHash,
  };

  if (decision.kind === 'acknowledged' || decision.kind === 'stand-down') {
    payload['noOnChainAction'] = true;
  }

  return {
    id: `result-${planId}-${decision.kind}`,
    payload,
  };
}

function getExistingDecisionFromPlan(
  plan: { state: PlanLifecycleState } | null,
): PlanOutcome | undefined {
  if (!plan) return undefined;

  const state = plan.state;
  if (state.kind === 'result-pending' && 'outcome' in state) {
    return state.outcome;
  }
  if (state.kind === 'reported' && 'outcome' in state) {
    return state.outcome;
  }
  if (state.kind === 'report-failed' && 'outcome' in state) {
    return state.outcome;
  }
  return undefined;
}

function isPlanExpired(plan: { state: PlanLifecycleState }, now: number): boolean {
  const state = plan.state;
  if (state.kind !== 'advisory-ready') {
    return false;
  }
  if ('expiresAt' in state && state.expiresAt !== null && state.expiresAt !== undefined) {
    return (state.expiresAt as number) < now;
  }
  return false;
}

function isUnsupportedDecisionForAction(
  action: PlanAction | undefined,
  decision: PlanOutcome,
): boolean {
  if (!action) return false;
  if (action.kind === 'REQUEST_EXIT_CLMM') {
    return decision.kind === 'acknowledged' || decision.kind === 'stand-down';
  }
  return false;
}

function getAdvisoryAction(plan: { state: PlanLifecycleState }): PlanAction | undefined {
  const state = plan.state;
  if (state.kind === 'advisory-ready' || state.kind === 'exit-previewed') {
    return state.advisoryAction;
  }
  return undefined;
}

export async function recordPlanDecision(params: {
  planId: PlanId;
  positionId: PositionId;
  walletId: WalletId;
  decision: PlanOutcome;
  planRepository: PlanRepository;
  triggerRepository: TriggerRepository;
  clock: ClockPort;
  observability: ObservabilityPort;
}): Promise<RecordPlanDecisionResult> {
  const {
    planId,
    positionId,
    walletId,
    decision,
    planRepository,
    triggerRepository,
    clock,
    observability,
  } = params;

  const existingPlan = await planRepository.getCurrentPlan(positionId);

  if (!existingPlan) {
    observability.log('warn', 'RecordPlanDecision: plan not found', { planId, positionId });
    return { kind: 'not-found' };
  }

  if (existingPlan.planId !== planId) {
    observability.log('warn', 'RecordPlanDecision: plan mismatch', {
      planId,
      positionId,
      existingPlanId: existingPlan.planId,
    });
    return { kind: 'not-found' };
  }

  const now = clock.now();
  const isExpired = isPlanExpired(existingPlan, now);
  const advisoryAction = getAdvisoryAction(existingPlan);
  const isUnsupported = isUnsupportedDecisionForAction(advisoryAction, decision);
  const effectiveDecision = isExpired
    ? { kind: 'expired' as const }
    : isUnsupported
      ? { kind: 'rejected' as const }
      : decision;

  const existingDecision = getExistingDecisionFromPlan(existingPlan);

  if (existingDecision && !isDecisionReplay(existingDecision, effectiveDecision)) {
    observability.log('warn', 'RecordPlanDecision: conflicting decision detected', {
      planId,
      existingDecision: existingDecision.kind,
      newDecision: effectiveDecision.kind,
    });
    return { kind: 'conflict-detected' };
  }

  if (isDecisionReplay(existingDecision, effectiveDecision)) {
    const canonicalResult = buildCanonicalResult({
      planId,
      positionId,
      decision: effectiveDecision,
      canonicalHash: existingPlan.canonicalHash,
    });
    observability.log('info', 'RecordPlanDecision: decision replayed idempotently', {
      planId,
      decisionKind: effectiveDecision.kind,
      resultId: canonicalResult.id,
    });
    return { kind: 'recorded', resultId: canonicalResult.id };
  }

  const decidedAt = makeClockTimestamp(now);

  await planRepository.recordDecision({
    planId,
    decision: effectiveDecision,
    decidedAt,
  });

  const triggers = await triggerRepository.listActionableTriggers(walletId);
  const qualifiedTrigger = triggers.find(
    (t) => t.positionId === positionId && t.confirmationPassed,
  );

  if (qualifiedTrigger) {
    observability.log('info', 'RecordPlanDecision: qualified breach supersedes advisory', {
      planId,
      positionId,
      breachDirection: qualifiedTrigger.breachDirection.kind,
    });
    return {
      kind: 'breach-supersedes',
      breachDirection: qualifiedTrigger.breachDirection,
    };
  }

  const canonicalResult = buildCanonicalResult({
    planId,
    positionId,
    decision: effectiveDecision,
    canonicalHash: existingPlan.canonicalHash,
  });

  await planRepository.commitTerminalOutcome({
    planId,
    outcome: effectiveDecision,
    canonicalResult,
    resultIdempotencyKey: canonicalResult.id,
    committedAt: decidedAt,
  });

  observability.log('info', 'RecordPlanDecision: decision recorded', {
    planId,
    positionId,
    decisionKind: effectiveDecision.kind,
    resultId: canonicalResult.id,
  });

  return { kind: 'recorded', resultId: canonicalResult.id };
}
