import type { ExecutionRepository } from '@clmm/application';
import type {
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  PositionId,
} from '@clmm/domain';

type StoredAttempt = ExecutionAttempt & { attemptId: string; positionId: PositionId };

export class FakeExecutionRepository implements ExecutionRepository {
  readonly previews = new Map<string, ExecutionPreview>();
  readonly attempts = new Map<string, StoredAttempt>();
  private _previewCounter = 0;

  async savePreview(positionId: PositionId, preview: ExecutionPreview): Promise<{ previewId: string }> {
    const previewId = `preview-${++this._previewCounter}`;
    this.previews.set(previewId, preview);
    return { previewId };
  }

  async getPreview(previewId: string): Promise<ExecutionPreview | null> {
    return this.previews.get(previewId) ?? null;
  }

  async saveAttempt(attempt: StoredAttempt): Promise<void> {
    this.attempts.set(attempt.attemptId, attempt);
  }

  async getAttempt(attemptId: string): Promise<StoredAttempt | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void> {
    const existing = this.attempts.get(attemptId);
    if (existing) {
      this.attempts.set(attemptId, { ...existing, lifecycleState: state });
    }
  }
}
