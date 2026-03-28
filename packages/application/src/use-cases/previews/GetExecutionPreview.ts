import type { ExecutionRepository } from '../../ports/index.js';
import type { ExecutionPreview, PositionId, BreachDirection } from '@clmm/domain';

export type GetExecutionPreviewResult =
  | { kind: 'found'; previewId: string; positionId: PositionId; breachDirection: BreachDirection; preview: ExecutionPreview }
  | { kind: 'not-found' };

export async function getExecutionPreview(params: {
  previewId: string;
  executionRepo: ExecutionRepository;
}): Promise<GetExecutionPreviewResult> {
  const stored = await params.executionRepo.getPreview(params.previewId);
  if (!stored) return { kind: 'not-found' };
  return {
    kind: 'found',
    previewId: params.previewId,
    positionId: stored.positionId,
    breachDirection: stored.breachDirection,
    preview: stored.preview,
  };
}
