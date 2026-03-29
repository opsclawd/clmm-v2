import type { ExecutionRepository } from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';

export type ResumeExecutionAttemptResult =
  | { kind: 'resumable'; attemptId: string; positionId: PositionId; breachDirection: BreachDirection }
  | { kind: 'submitted-pending'; attemptId: string; positionId: PositionId; breachDirection: BreachDirection }
  | { kind: 'not-found' }
  | { kind: 'not-resumable'; currentState: string };

const TERMINAL_STATES = new Set(['confirmed', 'abandoned', 'partial']);

export async function resumeExecutionAttempt(params: {
  attemptId: string;
  executionRepo: ExecutionRepository;
}): Promise<ResumeExecutionAttemptResult> {
  const { attemptId, executionRepo } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  const currentState = attempt.lifecycleState.kind;

  if (TERMINAL_STATES.has(currentState)) {
    return { kind: 'not-resumable', currentState };
  }

  if (currentState === 'submitted') {
    return {
      kind: 'submitted-pending',
      attemptId: attempt.attemptId,
      positionId: attempt.positionId,
      breachDirection: attempt.breachDirection,
    };
  }

  if (currentState === 'awaiting-signature' || currentState === 'previewed') {
    return {
      kind: 'resumable',
      attemptId: attempt.attemptId,
      positionId: attempt.positionId,
      breachDirection: attempt.breachDirection,
    };
  }

  // failed/expired can be retried via new preview, not resumed
  return { kind: 'not-resumable', currentState };
}
