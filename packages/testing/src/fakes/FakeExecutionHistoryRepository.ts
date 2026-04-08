import type { ExecutionHistoryRepository } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  PositionId,
  WalletId,
} from '@clmm/domain';

export class FakeExecutionHistoryRepository implements ExecutionHistoryRepository {
  readonly events: HistoryEvent[] = [];
  private readonly walletPositions = new Map<WalletId, Set<PositionId>>();

  async appendEvent(event: HistoryEvent): Promise<void> {
    this.events.push(event);
  }

  assignWalletToPosition(walletId: WalletId, positionId: PositionId): void {
    const positions = this.walletPositions.get(walletId) ?? new Set<PositionId>();
    positions.add(positionId);
    this.walletPositions.set(walletId, positions);
  }

  async recordWalletPositionOwnership(
    walletId: WalletId,
    positionId: PositionId,
    _observedAt: number,
  ): Promise<void> {
    this.assignWalletToPosition(walletId, positionId);
  }

  async getWalletHistory(walletId: WalletId): Promise<readonly HistoryEvent[]> {
    const positions = this.walletPositions.get(walletId);
    if (!positions) {
      return [];
    }

    return this.events.filter((event) => positions.has(event.positionId));
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
