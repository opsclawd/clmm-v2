import type { ExecutionRepository } from '../../ports/index.js';
import type { ExecutionPreview, PositionId, ExecutionOrigin } from '@clmm/domain';

export type GetExecutionPreviewResult =
  | {
      kind: 'found';
      previewId: string;
      positionId: PositionId;
      origin: ExecutionOrigin;
      preview: ExecutionPreview;
    }
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
    origin: stored.origin,
    preview: stored.preview,
  };
}
