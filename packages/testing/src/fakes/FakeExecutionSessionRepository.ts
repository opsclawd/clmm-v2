import type { ExecutionSessionRepository } from '@clmm/application';
import type { WalletId, PositionId, ClockTimestamp } from '@clmm/domain';

type StoredSession = {
  attemptId: string;
  walletId: WalletId;
  positionId: PositionId;
};

export class FakeExecutionSessionRepository implements ExecutionSessionRepository {
  readonly sessions = new Map<string, StoredSession>();

  async saveSession(params: {
    sessionId: string;
    attemptId: string;
    walletId: WalletId;
    positionId: PositionId;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    this.sessions.set(params.sessionId, {
      attemptId: params.attemptId,
      walletId: params.walletId,
      positionId: params.positionId,
    });
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
