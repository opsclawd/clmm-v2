import type {
  ExecutionRepository,
  ExecutionPreparationPort,
  ExecutionHistoryRepository,
  SupportedPositionReadPort,
  PlanRepository,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, PositionId, PlanId, ExecutionPreview, ExecutionOrigin } from '@clmm/domain';
import { evaluatePreviewFreshness } from '@clmm/domain';

export class PlanNotEligibleForExitPreviewError extends Error {
  constructor(reason: string) {
    super(`Plan not eligible for exit preview: ${reason}`);
    this.name = 'PlanNotEligibleForExitPreviewError';
  }
}

export class PositionMateriallyChangedError extends Error {
  constructor(positionId: string) {
    super(`Position state materially changed for position ${positionId}`);
    this.name = 'PositionMateriallyChangedError';
  }
}

export type CreatePlanExitPreviewResult = {
  readonly previewId: string;
  readonly plan: ExecutionPreview['plan'];
  readonly preview: ExecutionPreview;
  readonly executionOrigin: ExecutionOrigin;
};

export async function createPlanExitPreview(params: {
  readonly planId: PlanId;
  readonly positionId: PositionId;
  readonly walletId: WalletId;
  readonly planRepo: PlanRepository;
  readonly positionRepo: SupportedPositionReadPort;
  readonly executionRepo: ExecutionRepository;
  readonly prepPort: ExecutionPreparationPort;
  readonly historyRepo: ExecutionHistoryRepository;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
}): Promise<CreatePlanExitPreviewResult> {
  const {
    planId,
    positionId,
    walletId,
    planRepo,
    positionRepo,
    executionRepo,
    historyRepo,
    clock,
    ids,
  } = params;

  const currentPlan = await planRepo.getCurrentPlan(positionId);
  if (!currentPlan || currentPlan.planId !== planId) {
    throw new PlanNotEligibleForExitPreviewError(`Plan ${planId} not found or not current`);
  }

  const state = currentPlan.state;
  if (state.kind !== 'advisory-ready' && state.kind !== 'exit-previewed') {
    throw new PlanNotEligibleForExitPreviewError(
      `Plan ${planId} is in state ${state.kind}, expected advisory-ready or exit-previewed`,
    );
  }

  const advisoryAction = state.advisoryAction;
  if (advisoryAction.kind !== 'REQUEST_EXIT_CLMM') {
    throw new PlanNotEligibleForExitPreviewError(
      `Plan advisory action is ${advisoryAction.kind}, expected REQUEST_EXIT_CLMM`,
    );
  }

  const now = clock.now();

  const position = await positionRepo.getPositionDetail(walletId, positionId);
  if (!position) {
    throw new PositionMateriallyChangedError(positionId);
  }

  // The regime engine's REQUEST_EXIT_CLMM advisory action does not carry a
  // directional payload — canonical exit direction defaults to USDC, matching
  // PlanLifecycleReducer's own fallback when transitioning without a preview.
  const intent: 'exit-to-usdc' | 'exit-to-sol' = 'exit-to-usdc';
  const postExitPosture = { kind: intent };
  const swapInstruction = {
    fromAsset: 'SOL' as const,
    toAsset: 'USDC' as const,
    policyReason: 'regime-plan-exit',
  };

  const executionPlan = {
    steps: [
      { kind: 'remove-liquidity' as const },
      { kind: 'collect-fees' as const },
      { kind: 'swap-assets' as const, instruction: swapInstruction },
    ],
    postExitPosture,
    swapInstruction,
  };

  const freshness = evaluatePreviewFreshness(now, now);
  const preview: ExecutionPreview = {
    plan: executionPlan,
    freshness,
    estimatedAt: now,
  };

  const executionOrigin: ExecutionOrigin = {
    kind: 'regime-plan',
    planId: currentPlan.planId,
    canonicalHash: currentPlan.canonicalHash,
    canonicalExitIntent: intent,
  };

  const { previewId } = await executionRepo.savePreview(positionId, preview, executionOrigin);

  await planRepo.updateLifecycleState({
    planId: currentPlan.planId,
    lifecycleState: {
      kind: 'exit-previewed',
      advisoryAction,
      preview,
      executionOrigin,
    },
  });

  await historyRepo.appendEvent({
    eventId: ids.generateId(),
    positionId,
    eventType: 'preview-created',
    origin: executionOrigin,
    occurredAt: now,
    lifecycleState: { kind: 'previewed' },
  });

  return {
    previewId,
    plan: executionPlan,
    preview,
    executionOrigin,
  };
}
