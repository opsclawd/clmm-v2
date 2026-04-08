import type { ExecutionRepository } from '../../ports/index.js';
import type { ExecutionAttempt, PositionId } from '@clmm/domain';

export type GetExecutionAttemptDetailResult =
  | { kind: 'found'; attemptId: string; positionId: PositionId; attempt: ExecutionAttempt }
  | { kind: 'not-found' };

export async function getExecutionAttemptDetail(params: {
  attemptId: string;
  executionRepo: ExecutionRepository;
}): Promise<GetExecutionAttemptDetailResult> {
  const stored = await params.executionRepo.getAttempt(params.attemptId);
  if (!stored) return { kind: 'not-found' };
  const { attemptId, positionId, ...attempt } = stored;
  return { kind: 'found', attemptId, positionId, attempt };
}
