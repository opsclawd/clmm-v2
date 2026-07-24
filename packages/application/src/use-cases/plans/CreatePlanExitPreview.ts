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
import { evaluatePreviewFreshness, applyPlanLifecycleTransition } from '@clmm/domain';

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

  if (state.kind === 'exit-previewed') {
    const existingPreview = state.preview;
    const freshness = evaluatePreviewFreshness(existingPreview.estimatedAt, now);
    if (freshness.kind === 'fresh') {
      const existingOrigin = state.executionOrigin;
      return {
        previewId: `${currentPlan.planId}-preview`,
        plan: existingPreview.plan,
        preview: existingPreview,
        executionOrigin: existingOrigin,
      };
    }
  }

  const intent = advisoryAction.exitIntent ?? 'exit-to-usdc';
  const postExitPosture = { kind: intent };
  const swapInstruction = {
    fromAsset: (intent === 'exit-to-sol' ? 'USDC' : 'SOL') as import('@clmm/domain').AssetSymbol,
    toAsset: (intent === 'exit-to-sol' ? 'SOL' : 'USDC') as import('@clmm/domain').AssetSymbol,
    policyReason: 'regime-plan-exit',
  };

  const executionPlan: import('@clmm/domain').ExecutionPlan = {
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

  const planAfterTransition = applyPlanLifecycleTransition(currentPlan, {
    kind: 'preview',
    preview,
  });

  const newState = planAfterTransition.state;
  if (newState.kind !== 'exit-previewed') {
    throw new Error(`Invalid transition: expected exit-previewed, got ${newState.kind}`);
  }

  const executionOrigin = newState.executionOrigin;

  const { previewId } = await executionRepo.savePreview(positionId, preview, executionOrigin);

  await planRepo.updateLifecycleState({
    planId: currentPlan.planId,
    lifecycleState: newState,
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
