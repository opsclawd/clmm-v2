import type { ExecutionAttempt, RetryEligibility } from './index.js';

export function evaluateRetryEligibility(
  attempt: ExecutionAttempt,
): RetryEligibility {
  const { lifecycleState, completedSteps } = attempt;

  if (lifecycleState.kind === 'partial') {
    return {
      kind: 'ineligible',
      reason:
        'partial completion: one or more chain steps confirmed; full replay is forbidden',
    };
  }

  if (
    lifecycleState.kind === 'confirmed' ||
    lifecycleState.kind === 'abandoned'
  ) {
    return {
      kind: 'ineligible',
      reason: `${lifecycleState.kind} is a terminal state; no retry possible`,
    };
  }

  if (
    lifecycleState.kind === 'awaiting-signature' ||
    lifecycleState.kind === 'submitted'
  ) {
    return {
      kind: 'ineligible',
      reason: `execution is currently ${lifecycleState.kind}; wait for resolution`,
    };
  }

  if (completedSteps.length > 0) {
    return {
      kind: 'ineligible',
      reason: `${completedSteps.length} chain step(s) already confirmed; full replay forbidden`,
    };
  }

  return {
    kind: 'eligible',
    reason: 'no chain steps confirmed; full retry from refreshed preview is safe',
  };
}
