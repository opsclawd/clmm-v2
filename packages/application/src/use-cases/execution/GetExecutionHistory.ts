import type { ExecutionHistoryRepository } from '../../ports/index.js';
import type { PositionId, HistoryTimeline } from '@clmm/domain';

export type GetExecutionHistoryResult = {
  timeline: HistoryTimeline;
};

export async function getExecutionHistory(params: {
  positionId: PositionId;
  historyRepo: ExecutionHistoryRepository;
}): Promise<GetExecutionHistoryResult> {
  const timeline = await params.historyRepo.getTimeline(params.positionId);
  return { timeline };
}
