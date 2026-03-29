import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { TransactionReference } from '@clmm/domain';

export type SubmitExecutionAttemptResult =
  | { kind: 'submitted'; references: TransactionReference[] }
  | { kind: 'not-found' }
  | { kind: 'invalid-state'; currentState: string };

export async function submitExecutionAttempt(params: {
  attemptId: string;
  signedPayload: Uint8Array;
  executionRepo: ExecutionRepository;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<SubmitExecutionAttemptResult> {
  const { attemptId, signedPayload, executionRepo, submissionPort, historyRepo, clock, ids } = params;

  const attempt = await executionRepo.getAttempt(attemptId);
  if (!attempt) return { kind: 'not-found' };

  if (attempt.lifecycleState.kind !== 'awaiting-signature') {
    return { kind: 'invalid-state', currentState: attempt.lifecycleState.kind };
  }

  const { references } = await submissionPort.submitExecution(signedPayload);

  await executionRepo.updateAttemptState(attemptId, { kind: 'submitted' });

  const firstReference = references[0];
  if (firstReference) {
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: attempt.positionId,
      eventType: 'submitted',
      breachDirection: attempt.breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'submitted' },
      transactionReference: firstReference,
    });
  }

  return { kind: 'submitted', references };
}
