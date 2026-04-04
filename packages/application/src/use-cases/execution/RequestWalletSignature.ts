import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, BreachDirection } from '@clmm/domain';

const PREPARED_PAYLOAD_VERSION = 'v1';

export class PreviewNotFoundError extends Error {
  constructor(previewId: string) {
    super(`Preview not found: ${previewId}`);
    this.name = 'PreviewNotFoundError';
  }
}

export class PreviewApprovalNotAllowedError extends Error {
  constructor(reason: string) {
    super(`Preview approval not allowed: ${reason}`);
    this.name = 'PreviewApprovalNotAllowedError';
  }
}

export type RequestWalletSignatureResult = {
  readonly attemptId: string;
  readonly lifecycleState: { readonly kind: 'awaiting-signature' };
  readonly breachDirection: BreachDirection;
};

export async function requestWalletSignature(params: {
  readonly previewId: string;
  readonly walletId: WalletId;
  readonly executionRepo: ExecutionRepository;
  readonly prepPort: ExecutionPreparationPort;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}): Promise<RequestWalletSignatureResult> {
  const {
    previewId,
    walletId,
    executionRepo,
    prepPort,
    historyRepo,
    clock,
    ids,
  } = params;

  const previewRecord = await executionRepo.getPreview(previewId);
  if (!previewRecord) {
    throw new PreviewNotFoundError(previewId);
  }

  if (previewRecord.preview.freshness.kind !== 'fresh') {
    throw new PreviewApprovalNotAllowedError(`preview ${previewId} is ${previewRecord.preview.freshness.kind}`);
  }

  const attemptId = ids.generateId();
  const { serializedPayload } = await prepPort.prepareExecution({
    plan: previewRecord.preview.plan,
    walletId,
    positionId: previewRecord.positionId,
  });

  await executionRepo.saveAttempt({
    attemptId,
    previewId,
    positionId: previewRecord.positionId,
    breachDirection: previewRecord.breachDirection,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });

  const now = clock.now();
  await executionRepo.savePreparedPayload({
    payloadId: ids.generateId(),
    attemptId,
    unsignedPayload: serializedPayload,
    payloadVersion: PREPARED_PAYLOAD_VERSION,
    expiresAt: previewRecord.preview.freshness.expiresAt,
    createdAt: now,
  });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId: previewRecord.positionId,
    eventType: 'signature-requested',
    breachDirection: previewRecord.breachDirection,
    occurredAt: now,
    lifecycleState: { kind: 'awaiting-signature' },
  });

  return {
    attemptId,
    lifecycleState: { kind: 'awaiting-signature' },
    breachDirection: previewRecord.breachDirection,
  };
}
