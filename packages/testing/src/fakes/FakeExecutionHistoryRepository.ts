import type { ExecutionHistoryRepository } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  PositionId,
} from '@clmm/domain';

export class FakeExecutionHistoryRepository implements ExecutionHistoryRepository {
  readonly events: HistoryEvent[] = [];

  async appendEvent(event: HistoryEvent): Promise<void> {
    this.events.push(event);
  }

  async getTimeline(positionId: PositionId): Promise<HistoryTimeline> {
    return {
      positionId,
      events: this.events.filter((e) => e.positionId === positionId),
    };
  }

  async getOutcomeSummary(_positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
    return null;
  }
}
