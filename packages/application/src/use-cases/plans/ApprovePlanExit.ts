import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  ExecutionHistoryRepository,
  PlanRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, PlanId, ExecutionOrigin } from '@clmm/domain';
import {
  makeClockTimestamp,
  evaluatePreviewFreshness,
  applyPlanLifecycleTransition,
} from '@clmm/domain';

const PREPARED_PAYLOAD_VERSION = 'v1';

export class PlanExitApprovalError extends Error {
  constructor(reason: string) {
    super(`Plan exit approval failed: ${reason}`);
    this.name = 'PlanExitApprovalError';
  }
}

export type ApprovePlanExitResult = {
  readonly attemptId: string;
  readonly lifecycleState: { readonly kind: 'awaiting-signature' };
  readonly executionOrigin: ExecutionOrigin;
};

export async function approvePlanExit(params: {
  readonly previewId: string;
  readonly planId: PlanId;
  readonly positionId: PositionId;
  readonly walletId: WalletId;
  readonly planRepo: PlanRepository;
  readonly executionRepo: ExecutionRepository;
  readonly prepPort: ExecutionPreparationPort;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}): Promise<ApprovePlanExitResult> {
  const {
    previewId,
    planId,
    positionId,
    walletId,
    planRepo,
    executionRepo,
    prepPort,
    historyRepo,
    clock,
    ids,
  } = params;

  const currentPlan = await planRepo.getCurrentPlan(positionId);
  if (!currentPlan || currentPlan.planId !== planId) {
    throw new PlanExitApprovalError(`Plan ${planId} not found or not current`);
  }

  const previewRecord = await executionRepo.getPreview(previewId);
  if (!previewRecord) {
    throw new PlanExitApprovalError(`Preview ${previewId} not found`);
  }

  const now = clock.now();
  const liveFreshness = evaluatePreviewFreshness(previewRecord.preview.estimatedAt, now);
  if (liveFreshness.kind !== 'fresh') {
    throw new PlanExitApprovalError(`Preview ${previewId} is ${liveFreshness.kind}`);
  }

  if (currentPlan.state.kind === 'awaiting-signature' || currentPlan.state.kind === 'submitted') {
    throw new PlanExitApprovalError(
      `Plan ${planId} is already linked to attempt (state: ${currentPlan.state.kind})`,
    );
  }

  const attemptId = ids.generateId();

  const planAfterTransition = applyPlanLifecycleTransition(currentPlan, {
    kind: 'request-signature',
    attemptId,
  });

  const executionOrigin: ExecutionOrigin = {
    kind: 'regime-plan',
    planId: currentPlan.planId,
    canonicalHash: currentPlan.canonicalHash,
    canonicalExitIntent: previewRecord.preview.plan.postExitPosture.kind,
  };

  const { serializedPayload } = await prepPort.prepareExecution({
    plan: previewRecord.preview.plan,
    walletId,
    positionId,
  });

  await executionRepo.saveAttempt({
    attemptId,
    previewId,
    positionId,
    origin: executionOrigin,
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

  await planRepo.linkExecutionAttempt({
    planId: currentPlan.planId,
    attemptId,
    linkedAt: now,
  });

  await planRepo.updateLifecycleState({
    planId: currentPlan.planId,
    lifecycleState: planAfterTransition.state,
  });

  await historyRepo.recordWalletPositionOwnership(walletId, positionId, now);

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType: 'signature-requested',
    origin: executionOrigin,
    occurredAt: now,
    lifecycleState: { kind: 'awaiting-signature' },
  });

  return {
    attemptId,
    lifecycleState: { kind: 'awaiting-signature' },
    executionOrigin,
  };
}
