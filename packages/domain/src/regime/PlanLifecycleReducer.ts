import type { BreachDirection, PositionId, ClockTimestamp } from '../shared/index.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '../shared/index.js';

export { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH };
export type { ClockTimestamp };

export type PlanId = string & { readonly _brand: 'PlanId' };
export type CanonicalHash = string & { readonly _brand: 'CanonicalHash' };

export type RegimeResponse = {
  readonly kind: 'regime-response';
  readonly regime: 'UP' | 'DOWN' | 'CHOP';
  readonly suitability: 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
};

export type AdvisoryAction =
  | { readonly kind: 'HOLD' }
  | { readonly kind: 'STAND_DOWN' }
  | { readonly kind: 'REQUEST_EXIT_CLMM' };

export type ExecutionOrigin =
  | {
      readonly kind: 'qualified-breach';
      readonly breachDirection: BreachDirection;
    }
  | {
      readonly kind: 'regime-plan';
      readonly planId: PlanId;
      readonly canonicalHash: CanonicalHash;
      readonly canonicalExitIntent: 'exit-to-usdc' | 'exit-to-sol';
    };

export type NonExecutedOutcome =
  | { readonly kind: 'acknowledged' }
  | { readonly kind: 'stand-down' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'position-changed' }
  | { readonly kind: 'rejected' };

export type ExecutedOutcome = { readonly kind: 'executed' } | { readonly kind: 'failed' };

export type ExecutionPlan = {
  readonly steps: readonly { readonly kind: string }[];
  readonly postExitPosture: { readonly kind: 'exit-to-usdc' | 'exit-to-sol' };
  readonly swapInstruction: {
    readonly fromAsset: string;
    readonly toAsset: string;
    readonly policyReason: string;
  };
};

export type PreviewFreshness =
  | { readonly kind: 'fresh'; readonly expiresAt: number }
  | { readonly kind: 'stale' }
  | { readonly kind: 'expired' };

export type PlanLifecycleState =
  | { readonly kind: 'requested' }
  | {
      readonly kind: 'advisory-ready';
      readonly advisoryAction: AdvisoryAction;
      readonly regimeResponse: RegimeResponse;
    }
  | {
      readonly kind: 'exit-previewed';
      readonly advisoryAction: AdvisoryAction;
      readonly preview: {
        readonly plan: ExecutionPlan;
        readonly freshness: PreviewFreshness;
        readonly estimatedAt: number;
      };
      readonly executionOrigin: ExecutionOrigin;
    }
  | {
      readonly kind: 'awaiting-signature';
      readonly advisoryAction: AdvisoryAction;
      readonly executionOrigin: ExecutionOrigin;
    }
  | {
      readonly kind: 'submitted';
      readonly advisoryAction: AdvisoryAction;
      readonly executionOrigin: ExecutionOrigin;
    }
  | {
      readonly kind: 'result-pending';
      readonly outcome: NonExecutedOutcome | ExecutedOutcome;
      readonly executionOrigin: ExecutionOrigin | null;
    }
  | {
      readonly kind: 'reported';
      readonly outcome: ExecutedOutcome;
      readonly executionOrigin: ExecutionOrigin | null;
      readonly reportedAt: ClockTimestamp;
    }
  | {
      readonly kind: 'report-failed';
      readonly outcome: ExecutedOutcome;
      readonly executionOrigin: ExecutionOrigin | null;
    }
  | {
      readonly kind: 'conflict';
      readonly priorPlanId: PlanId;
      readonly canonicalHash: CanonicalHash;
      readonly conflictingHash: CanonicalHash;
    }
  | {
      readonly kind: 'superseded';
      readonly priorPlan: {
        readonly planId: PlanId;
        readonly canonicalHash: CanonicalHash;
        readonly state: PlanLifecycleState;
      };
      readonly breachOrigin: ExecutionOrigin & { readonly kind: 'qualified-breach' };
    };

export type PlanLifecycleEvent =
  | { readonly kind: 'regime-response-received'; readonly regimeResponse: RegimeResponse }
  | { readonly kind: 'acknowledge' }
  | {
      readonly kind: 'preview';
      readonly preview: {
        readonly plan: ExecutionPlan;
        readonly freshness: PreviewFreshness;
        readonly estimatedAt: number;
      };
    }
  | { readonly kind: 'request-signature' }
  | { readonly kind: 'submit' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'expire' }
  | { readonly kind: 'position-changed' }
  | { readonly kind: 'breach-qualified'; readonly breachDirection: BreachDirection }
  | { readonly kind: 'delivery-success'; readonly reportedAt?: ClockTimestamp }
  | { readonly kind: 'retry-scheduled'; readonly reason: string }
  | { readonly kind: 'permanent-rejection'; readonly reason: string };

export interface PositionPlan {
  readonly planId: PlanId;
  readonly canonicalHash: CanonicalHash;
  readonly positionId: PositionId;
  readonly regimeResponse?: RegimeResponse;
  readonly createdAt: ClockTimestamp;
  readonly state: PlanLifecycleState;
}

export function makePlanId(raw: string): PlanId {
  return raw as PlanId;
}

export function makeCanonicalHash(raw: string): CanonicalHash {
  return raw as CanonicalHash;
}

export function makePositionPlan(params: {
  planId: PlanId;
  canonicalHash: CanonicalHash;
  positionId: PositionId;
  createdAt: ClockTimestamp;
}): PositionPlan {
  return {
    planId: params.planId,
    canonicalHash: params.canonicalHash,
    positionId: params.positionId,
    createdAt: params.createdAt,
    state: { kind: 'requested' },
  };
}

function isExecutableState(state: PlanLifecycleState): boolean {
  switch (state.kind) {
    case 'exit-previewed':
    case 'awaiting-signature':
    case 'submitted':
      return true;
    default:
      return false;
  }
}

function isTerminalState(state: PlanLifecycleState): boolean {
  switch (state.kind) {
    case 'reported':
    case 'report-failed':
    case 'conflict':
      return true;
    default:
      return false;
  }
}

function makeAdvisoryAction(
  regime: RegimeResponse['regime'],
  suitability: RegimeResponse['suitability'],
): AdvisoryAction {
  if (suitability === 'BLOCKED' || regime === 'CHOP') {
    return { kind: 'STAND_DOWN' };
  }
  if (suitability === 'ALLOWED' && regime === 'DOWN') {
    return { kind: 'REQUEST_EXIT_CLMM' };
  }
  return { kind: 'HOLD' };
}

export function applyPlanLifecycleTransition(
  plan: PositionPlan,
  event: PlanLifecycleEvent,
): PositionPlan {
  const currentState = plan.state;

  if (isTerminalState(currentState)) {
    throw new Error(
      `FORBIDDEN: terminal state cannot transition; state=${currentState.kind}, event=${event.kind}`,
    );
  }

  switch (event.kind) {
    case 'regime-response-received': {
      if (currentState.kind === 'advisory-ready') {
        const existingRegimeResponse = currentState.regimeResponse;
        const newRegimeResponse = event.regimeResponse;
        const isSameContent =
          existingRegimeResponse.regime === newRegimeResponse.regime &&
          existingRegimeResponse.suitability === newRegimeResponse.suitability;

        if (isSameContent) {
          return plan;
        }
        return {
          ...plan,
          state: {
            kind: 'conflict',
            priorPlanId: plan.planId,
            canonicalHash: plan.canonicalHash,
            conflictingHash: plan.canonicalHash,
          },
        };
      }

      if (currentState.kind !== 'requested') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }

      const advisoryAction = makeAdvisoryAction(
        event.regimeResponse.regime,
        event.regimeResponse.suitability,
      );
      return {
        ...plan,
        regimeResponse: event.regimeResponse,
        state: {
          kind: 'advisory-ready',
          advisoryAction,
          regimeResponse: event.regimeResponse,
        },
      };
    }

    case 'acknowledge': {
      if (currentState.kind !== 'advisory-ready') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      const outcome: NonExecutedOutcome =
        currentState.advisoryAction.kind === 'HOLD'
          ? { kind: 'acknowledged' }
          : { kind: 'stand-down' };
      return {
        ...plan,
        state: {
          kind: 'result-pending',
          outcome,
          executionOrigin: null,
        },
      };
    }

    case 'preview': {
      if (currentState.kind !== 'advisory-ready') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      if (currentState.advisoryAction.kind !== 'REQUEST_EXIT_CLMM') {
        throw new Error(
          `Invalid transition: ${currentState.kind} + ${event.kind} for advisory action ${currentState.advisoryAction.kind}`,
        );
      }
      const executionOrigin: ExecutionOrigin = {
        kind: 'regime-plan',
        planId: plan.planId,
        canonicalHash: plan.canonicalHash,
        canonicalExitIntent: event.preview.plan.postExitPosture.kind,
      };
      return {
        ...plan,
        state: {
          kind: 'exit-previewed',
          advisoryAction: currentState.advisoryAction,
          preview: event.preview,
          executionOrigin,
        },
      };
    }

    case 'request-signature': {
      if (!isExecutableState(currentState)) {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      const advisoryAction: AdvisoryAction =
        currentState.kind === 'exit-previewed' ||
        currentState.kind === 'awaiting-signature' ||
        currentState.kind === 'submitted'
          ? currentState.advisoryAction
          : { kind: 'REQUEST_EXIT_CLMM' };
      const executionOrigin: ExecutionOrigin =
        currentState.kind === 'exit-previewed' ||
        currentState.kind === 'awaiting-signature' ||
        currentState.kind === 'submitted'
          ? currentState.executionOrigin
          : {
              kind: 'regime-plan',
              planId: plan.planId,
              canonicalHash: plan.canonicalHash,
              canonicalExitIntent: 'exit-to-usdc',
            };
      return {
        ...plan,
        state: {
          kind: 'awaiting-signature',
          advisoryAction,
          executionOrigin,
        },
      };
    }

    case 'submit': {
      if (currentState.kind !== 'awaiting-signature') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      return {
        ...plan,
        state: {
          kind: 'submitted',
          advisoryAction: currentState.advisoryAction,
          executionOrigin: currentState.executionOrigin,
        },
      };
    }

    case 'confirm': {
      if (currentState.kind !== 'submitted') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      return {
        ...plan,
        state: {
          kind: 'result-pending',
          outcome: { kind: 'executed' },
          executionOrigin: currentState.executionOrigin,
        },
      };
    }

    case 'expire':
    case 'position-changed': {
      if (
        currentState.kind === 'result-pending' ||
        currentState.kind === 'reported' ||
        currentState.kind === 'report-failed'
      ) {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      const outcome: NonExecutedOutcome =
        event.kind === 'expire' ? { kind: 'expired' } : { kind: 'position-changed' };
      return {
        ...plan,
        state: {
          kind: 'result-pending',
          outcome,
          executionOrigin: null,
        },
      };
    }

    case 'breach-qualified': {
      if (
        currentState.kind === 'result-pending' ||
        currentState.kind === 'reported' ||
        currentState.kind === 'report-failed' ||
        currentState.kind === 'conflict'
      ) {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      const breachOrigin: ExecutionOrigin = {
        kind: 'qualified-breach',
        breachDirection: event.breachDirection,
      };
      return {
        ...plan,
        state: {
          kind: 'superseded',
          priorPlan: {
            planId: plan.planId,
            canonicalHash: plan.canonicalHash,
            state: currentState,
          },
          breachOrigin,
        },
      };
    }

    case 'delivery-success': {
      if (currentState.kind !== 'result-pending') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      return {
        ...plan,
        state: {
          kind: 'reported',
          outcome: { kind: 'executed' },
          executionOrigin: currentState.executionOrigin,
          reportedAt: event.reportedAt ?? (Date.now() as unknown as ClockTimestamp),
        },
      };
    }

    case 'retry-scheduled': {
      if (currentState.kind !== 'result-pending') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      return plan;
    }

    case 'permanent-rejection': {
      if (currentState.kind !== 'result-pending') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      return {
        ...plan,
        state: {
          kind: 'report-failed',
          outcome: { kind: 'failed' },
          executionOrigin: null,
        },
      };
    }

    default: {
      const _exhaustive: never = event;
      throw new Error(`Unhandled event: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
