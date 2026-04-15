import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { TransactionReference, ExecutionStep } from '@clmm/domain';

export type SubmitExecutionAttemptResult =
  | { kind: 'submitted'; references: TransactionReference[] }
  | { kind: 'expired'; currentState: 'expired' }
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

  const preparedPayload = await executionRepo.getPreparedPayload(attemptId);
  const now = clock.now();
  if (preparedPayload && now >= preparedPayload.expiresAt) {
    await executionRepo.updateAttemptState(attemptId, { kind: 'expired' });
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: attempt.positionId,
      eventType: 'preview-expired',
      breachDirection: attempt.breachDirection,
      occurredAt: now,
      lifecycleState: { kind: 'expired' },
    });

    return { kind: 'expired', currentState: 'expired' };
  }

  let plannedStepKinds: ReadonlyArray<ExecutionStep['kind']> = ['swap-assets'];
  if (attempt.previewId) {
    const previewRecord = await executionRepo.getPreview(attempt.previewId);
    if (previewRecord) {
      plannedStepKinds = previewRecord.preview.plan.steps.map((s) => s.kind);
    }
  }

  const { references } = await submissionPort.submitExecution(signedPayload, plannedStepKinds);

  await executionRepo.saveAttempt({
    ...attempt,
    lifecycleState: { kind: 'submitted' },
    transactionReferences: [...references],
  });

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
