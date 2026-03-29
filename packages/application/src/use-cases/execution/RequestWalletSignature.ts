import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  WalletSigningPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, BreachDirection } from '@clmm/domain';

export type RequestWalletSignatureResult =
  | { kind: 'signed'; attemptId: string; signedPayload: Uint8Array }
  | { kind: 'declined'; attemptId: string }
  | { kind: 'interrupted'; attemptId: string };

export async function requestWalletSignature(params: {
  previewId: string;
  walletId: WalletId;
  positionId: PositionId;
  breachDirection: BreachDirection;
  executionRepo: ExecutionRepository;
  prepPort: ExecutionPreparationPort;
  signingPort: WalletSigningPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<RequestWalletSignatureResult> {
  const {
    previewId, walletId, positionId, breachDirection,
    executionRepo, prepPort, signingPort, historyRepo, clock, ids,
  } = params;

  const previewRecord = await executionRepo.getPreview(previewId);
  if (!previewRecord) {
    throw new Error(`Preview not found: ${previewId}`);
  }

  if (positionId !== previewRecord.positionId) {
    throw new Error(`requestWalletSignature: positionId mismatch for preview ${previewId}`);
  }

  if (breachDirection.kind !== previewRecord.breachDirection.kind) {
    throw new Error(`requestWalletSignature: breachDirection mismatch for preview ${previewId}`);
  }

  const attemptId = ids.generateId();

  await executionRepo.saveAttempt({
    attemptId,
    positionId: previewRecord.positionId,
    breachDirection: previewRecord.breachDirection,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: previewRecord.positionId,
    eventType: 'signature-requested',
    breachDirection: previewRecord.breachDirection,
    occurredAt: clock.now(),
    lifecycleState: { kind: 'awaiting-signature' },
  });

  const { serializedPayload } = await prepPort.prepareExecution({
    plan: previewRecord.preview.plan,
    walletId,
    positionId: previewRecord.positionId,
  });

  const sigResult = await signingPort.requestSignature(serializedPayload, walletId);

  if (sigResult.kind === 'declined') {
    await executionRepo.updateAttemptState(attemptId, { kind: 'abandoned' });
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: previewRecord.positionId,
      eventType: 'signature-declined',
      breachDirection: previewRecord.breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'abandoned' },
    });
    return { kind: 'declined', attemptId };
  }

  if (sigResult.kind === 'interrupted') {
    await historyRepo.appendEvent({
      eventId: ids.generateId(),
      positionId: previewRecord.positionId,
      eventType: 'signature-interrupted',
      breachDirection: previewRecord.breachDirection,
      occurredAt: clock.now(),
      lifecycleState: { kind: 'awaiting-signature' },
    });
    return { kind: 'interrupted', attemptId };
  }

  return { kind: 'signed', attemptId, signedPayload: sigResult.signedPayload };
}
