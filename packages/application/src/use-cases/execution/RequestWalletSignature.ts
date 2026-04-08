import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import { makeClockTimestamp, evaluatePreviewFreshness } from '@clmm/domain';
import type { WalletId, BreachDirection, BreachEpisodeId } from '@clmm/domain';

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

export class MissingEpisodeIdForTriggerDerivedApprovalError extends Error {
  constructor() {
    super('episodeId is required for trigger-derived approval');
    this.name = 'MissingEpisodeIdForTriggerDerivedApprovalError';
  }
}

export type RequestWalletSignatureResult = {
  readonly attemptId: string;
  readonly lifecycleState: { readonly kind: 'awaiting-signature' };
  readonly breachDirection: BreachDirection;
};

export async function requestWalletSignature(params: {
  readonly previewId: string;
  readonly episodeId?: BreachEpisodeId;
  readonly isTriggerDerivedApproval?: boolean;
  readonly walletId: WalletId;
  readonly executionRepo: ExecutionRepository;
  readonly prepPort: ExecutionPreparationPort;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}): Promise<RequestWalletSignatureResult> {
  const {
    previewId,
    episodeId,
    isTriggerDerivedApproval,
    walletId,
    executionRepo,
    prepPort,
    historyRepo,
    clock,
    ids,
  } = params;

  if (isTriggerDerivedApproval && !episodeId) {
    throw new MissingEpisodeIdForTriggerDerivedApprovalError();
  }

  const previewRecord = await executionRepo.getPreview(previewId);
  if (!previewRecord) {
    throw new PreviewNotFoundError(previewId);
  }

  const now = clock.now();
  const liveFreshness = evaluatePreviewFreshness(previewRecord.preview.estimatedAt, now);
  if (liveFreshness.kind !== 'fresh') {
    throw new PreviewApprovalNotAllowedError(`preview ${previewId} is ${liveFreshness.kind}`);
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
    ...(episodeId ? { episodeId } : {}),
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  });

  await executionRepo.savePreparedPayload({
    payloadId: ids.generateId(),
    attemptId,
    unsignedPayload: serializedPayload,
    payloadVersion: PREPARED_PAYLOAD_VERSION,
    expiresAt: makeClockTimestamp(liveFreshness.expiresAt),
    createdAt: now,
  });

  await historyRepo.recordWalletPositionOwnership(
    walletId,
    previewRecord.positionId,
    now,
  );

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
