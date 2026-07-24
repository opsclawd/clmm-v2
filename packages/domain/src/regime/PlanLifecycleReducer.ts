import type {
  PositionPlan,
  PlanLifecycleState,
  PlanLifecycleEvent,
  PlanAction,
  ExecutionOrigin,
  RegimeResponse,
  NonExecutedOutcome,
} from './PositionPlan.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '../shared/index.js';
import type { ClockTimestamp } from '../shared/index.js';

export type {
  PositionPlan,
  PlanLifecycleState,
  PlanLifecycleEvent,
  PlanAction,
  ExecutionOrigin,
  RegimeResponse,
} from './PositionPlan.js';

export { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH };
export type { ClockTimestamp };

export { makePlanId, makeCanonicalHash, makePositionPlan } from './PositionPlan.js';

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
): PlanAction {
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
          previewId: event.previewId,
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
      const advisoryAction: PlanAction =
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
              canonicalExitIntent:
                advisoryAction.kind === 'REQUEST_EXIT_CLMM' && advisoryAction.exitIntent
                  ? advisoryAction.exitIntent
                  : 'exit-to-usdc',
            };
      const newState: PlanLifecycleState = {
        kind: 'awaiting-signature',
        advisoryAction,
        executionOrigin,
      };
      const attemptId =
        event.attemptId ??
        (currentState.kind === 'awaiting-signature' || currentState.kind === 'submitted'
          ? currentState.attemptId
          : undefined);
      if (attemptId !== undefined) {
        (newState as { attemptId: string }).attemptId = attemptId;
      }
      return {
        ...plan,
        state: newState,
      };
    }

    case 'submit': {
      if (currentState.kind !== 'awaiting-signature') {
        throw new Error(`Invalid transition: ${currentState.kind} + ${event.kind}`);
      }
      const newState: PlanLifecycleState = {
        kind: 'submitted',
        advisoryAction: currentState.advisoryAction,
        executionOrigin: currentState.executionOrigin,
      };
      if (currentState.attemptId !== undefined) {
        (newState as { attemptId: string }).attemptId = currentState.attemptId;
      }
      return {
        ...plan,
        state: newState,
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
          reportedAt: event.reportedAt ?? (Date.now() as ClockTimestamp),
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
