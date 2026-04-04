import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';

export type ReconcileResult =
  | { kind: 'confirmed' }
  | { kind: 'partial'; confirmedSteps: string[] }
  | { kind: 'failed' }
  | { kind: 'pending' };

export async function reconcileExecutionAttempt(params: {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ReconcileResult> {
  const { attemptId, positionId, breachDirection, executionRepo, submissionPort, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

  if (attempt.lifecycleState.kind === 'confirmed') {
    return { kind: 'confirmed' };
  }

  if (attempt.lifecycleState.kind === 'partial') {
    return { kind: 'partial', confirmedSteps: [...attempt.completedSteps] };
  }

  const { confirmedSteps, finalState } = await submissionPort.reconcileExecution(
    [...attempt.transactionReferences],
  );

  if (!finalState) {
    return { kind: 'pending' };
  }

  await executionRepo.updateAttemptState(attemptId, finalState);

  const eventType =
    finalState.kind === 'confirmed' ? 'confirmed' :
    finalState.kind === 'partial' ? 'partial-completion' : 'failed';

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType,
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: finalState,
  });

  if (finalState.kind === 'confirmed') return { kind: 'confirmed' };
  if (finalState.kind === 'partial') return { kind: 'partial', confirmedSteps };
  return { kind: 'failed' };
}
