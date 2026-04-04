import type { TransactionReference, WalletId } from '@clmm/domain';
import {
  requestWalletSignature,
  submitExecutionAttempt,
  recordSignatureDecline,
  recordSignatureInterruption,
} from '@clmm/application';
import type {
  ClockPort,
  ExecutionHistoryRepository,
  ExecutionPreparationPort,
  ExecutionRepository,
  ExecutionSubmissionPort,
  IdGeneratorPort,
  WalletSigningPort,
} from '@clmm/application';

export type ScenarioApprovalOutcome =
  | { kind: 'submitted'; attemptId: string; references: TransactionReference[] }
  | { kind: 'declined'; attemptId: string }
  | { kind: 'interrupted'; attemptId: string };

export async function runApprovalFlow(params: {
  previewId: string;
  walletId: WalletId;
  executionRepo: ExecutionRepository;
  prepPort: ExecutionPreparationPort;
  signingPort: WalletSigningPort;
  submissionPort: ExecutionSubmissionPort;
  historyRepo: ExecutionHistoryRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ScenarioApprovalOutcome> {
  const signatureRequest = await requestWalletSignature({
    previewId: params.previewId,
    walletId: params.walletId,
    executionRepo: params.executionRepo,
    prepPort: params.prepPort,
    historyRepo: params.historyRepo,
    clock: params.clock,
    ids: params.ids,
  });

  const preparedPayload = await params.executionRepo.getPreparedPayload(signatureRequest.attemptId);
  if (!preparedPayload) {
    throw new Error(`Missing prepared payload for attempt ${signatureRequest.attemptId}`);
  }

  const signingResult = await params.signingPort.requestSignature(
    preparedPayload.unsignedPayload,
    params.walletId,
  );

  if (signingResult.kind === 'declined') {
    const declineResult = await recordSignatureDecline({
      attemptId: signatureRequest.attemptId,
      executionRepo: params.executionRepo,
      historyRepo: params.historyRepo,
      clock: params.clock,
      ids: params.ids,
    });
    if (declineResult.kind !== 'declined') {
      throw new Error(`Expected declined outcome, got ${declineResult.kind}`);
    }

    return {
      kind: 'declined',
      attemptId: signatureRequest.attemptId,
    };
  }

  if (signingResult.kind === 'interrupted') {
    const interruptionResult = await recordSignatureInterruption({
      attemptId: signatureRequest.attemptId,
      executionRepo: params.executionRepo,
      historyRepo: params.historyRepo,
      clock: params.clock,
      ids: params.ids,
    });
    if (interruptionResult.kind !== 'interrupted') {
      throw new Error(`Expected interrupted outcome, got ${interruptionResult.kind}`);
    }

    return {
      kind: 'interrupted',
      attemptId: signatureRequest.attemptId,
    };
  }

  const submitResult = await submitExecutionAttempt({
    attemptId: signatureRequest.attemptId,
    signedPayload: signingResult.signedPayload,
    executionRepo: params.executionRepo,
    submissionPort: params.submissionPort,
    historyRepo: params.historyRepo,
    clock: params.clock,
    ids: params.ids,
  });

  if (submitResult.kind !== 'submitted') {
    throw new Error(`Expected submitted outcome, got ${submitResult.kind}`);
  }

  return {
    kind: 'submitted',
    attemptId: signatureRequest.attemptId,
    references: submitResult.references,
  };
}
