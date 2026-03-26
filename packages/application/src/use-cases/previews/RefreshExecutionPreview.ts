import type { SwapQuotePort, ExecutionRepository, ClockPort, IdGeneratorPort } from '../../ports/index.js';
import type { PositionId, BreachDirection } from '@clmm/domain';
import { createExecutionPreview, type CreatePreviewResult } from './CreateExecutionPreview.js';

export async function refreshExecutionPreview(params: {
  previewId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  swapQuotePort: SwapQuotePort;
  executionRepo: ExecutionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<CreatePreviewResult> {
  return createExecutionPreview({
    positionId: params.positionId,
    breachDirection: params.breachDirection,
    swapQuotePort: params.swapQuotePort,
    executionRepo: params.executionRepo,
    clock: params.clock,
    ids: params.ids,
  });
}
