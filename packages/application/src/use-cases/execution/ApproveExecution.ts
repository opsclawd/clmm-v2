import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  WalletSigningPort,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection } from '@clmm/domain';

export type ApproveExecutionResult =
  | { kind: 'submitted'; attemptId: string; references: Array<{ signature: string; stepKind: string }> }
  | { kind: 'declined'; attemptId: string }
  | { kind: 'interrupted'; attemptId: string };

export async function approveExecution(params: {
  previewId: string;
  walletId: WalletId;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  prepPort: ExecutionPreparationPort;
  signingPort: WalletSigningPort;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ApproveExecutionResult> {
  const {
    previewId, walletId, positionId, breachDirection,
    executionRepo, prepPort, signingPort, submissionPort, historyRepo, clock, ids,
  } = params;

  const attemptId = ids.generateId();
  const preview = await executionRepo.getPreview(previewId);

  if (!preview) {
    throw new Error(`Preview not found: ${previewId}`);
  }

  await executionRepo.saveAttempt({
    attemptId,
    positionId,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType: 'signature-requested',
    breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'awaiting-signature' },
  });

  const { serializedPayload } = await prepPort.prepareExecution(preview.plan, walletId);

  const sigResult = await signingPort.requestSignature(serializedPayload, walletId);

  if (sigResult.kind === 'declined') {
    await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId,
      eventType: 'signature-declined',
      breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'abandoned' },
    });
    return { kind: 'declined', attemptId };
  }

  if (sigResult.kind === 'interrupted') {
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId,
      eventType: 'signature-interrupted',
      breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'awaiting-signature' },
    });
    return { kind: 'interrupted', attemptId };
  }

  const { references } = await submissionPort.submitExecution(sigResult.signedPayload);

  await executionRepo.updateAttemptState(attemptId, { kind: 'submitted' });
  const firstReference = references[0];
  if (firstReference) {
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId,
      eventType: 'submitted',
      breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'submitted' },
      transactionReference: firstReference,
    });
  }

  return { kind: 'submitted', attemptId, references };
}
