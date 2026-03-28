import type { SwapQuotePort, ExecutionRepository, ClockPort, IdGeneratorPort } from '../../ports/index.js';
import type { PositionId, BreachDirection, ExecutionPreview } from '@clmm/domain';
import { buildExecutionPlan, evaluatePreviewFreshness } from '@clmm/domain';

export type CreatePreviewResult = {
  previewId: string;
  plan: ExecutionPreview['plan'];
  preview: ExecutionPreview;
};

export async function createExecutionPreview(params: {
  positionId: PositionId;
  breachDirection: BreachDirection;
  swapQuotePort: SwapQuotePort;
  executionRepo: ExecutionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<CreatePreviewResult> {
  const { positionId, breachDirection, swapQuotePort, executionRepo, clock } = params;

  const plan = buildExecutionPlan(breachDirection);

  const quote = await swapQuotePort.getQuote(plan.swapInstruction);
  const enrichedSwap = { ...plan.swapInstruction, amountBasis: quote.estimatedOutputAmount };
  const enrichedPlan = { ...plan, swapInstruction: enrichedSwap };

  const estimatedAt = clock.now();
  const freshness = evaluatePreviewFreshness(estimatedAt, estimatedAt);

  const preview: ExecutionPreview = {
    plan: enrichedPlan,
    freshness,
    estimatedAt,
  };

  const { previewId } = await executionRepo.savePreview(positionId, preview, breachDirection);

  return { previewId, plan: enrichedPlan, preview };
}
