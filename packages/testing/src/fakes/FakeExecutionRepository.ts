import type { ExecutionRepository } from '@clmm/application';
import type {
  BreachEpisodeId,
  BreachDirection,
  ClockTimestamp,
  ExecutionPreview,
  ExecutionLifecycleState,
  PositionId,
} from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

type StoredPreview = {
  preview: ExecutionPreview;
  positionId: PositionId;
  breachDirection: BreachDirection;
};

type SavePreparedPayloadParams = {
  payloadId: string;
  attemptId: string;
  unsignedPayload: Uint8Array;
  payloadVersion: string;
  expiresAt: ClockTimestamp;
  createdAt: ClockTimestamp;
};
type StoredPreparedPayload = SavePreparedPayloadParams;
type PreparedPayloadRecord = {
  payloadVersion: string;
  unsignedPayload: Uint8Array;
  expiresAt: ClockTimestamp;
} | null;

export class FakeExecutionRepository implements ExecutionRepository {
  readonly previews = new Map<string, StoredPreview>();
  readonly attempts = new Map<string, StoredExecutionAttempt>();
  readonly preparedPayloads = new Map<string, StoredPreparedPayload>();
  private _previewCounter = 0;

  async savePreview(positionId: PositionId, preview: ExecutionPreview, breachDirection: BreachDirection): Promise<{ previewId: string }> {
    const previewId = `preview-${++this._previewCounter}`;
    this.previews.set(previewId, { preview, positionId, breachDirection });
    return { previewId };
  }

  async getPreview(previewId: string): Promise<StoredPreview | null> {
    return this.previews.get(previewId) ?? null;
  }

  async saveAttempt(attempt: StoredExecutionAttempt): Promise<void> {
    this.attempts.set(attempt.attemptId, {
      ...attempt,
      completedSteps: [...attempt.completedSteps],
      transactionReferences: [...attempt.transactionReferences],
    });
  }

  async getAttempt(attemptId: string): Promise<StoredExecutionAttempt | null> {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return null;
    return {
      ...attempt,
      completedSteps: [...attempt.completedSteps],
      transactionReferences: [...attempt.transactionReferences],
    };
  }

  async savePreparedPayload(params: SavePreparedPayloadParams): Promise<void> {
    this.preparedPayloads.set(params.attemptId, {
      ...params,
      unsignedPayload: Uint8Array.from(params.unsignedPayload),
    });
  }

  async getPreparedPayload(attemptId: string): Promise<PreparedPayloadRecord> {
    const payload = this.preparedPayloads.get(attemptId);
    if (!payload) return null;
    return {
      payloadVersion: payload.payloadVersion,
      unsignedPayload: Uint8Array.from(payload.unsignedPayload),
      expiresAt: payload.expiresAt,
    };
  }

  async listAwaitingSignatureAttemptsByEpisode(episodeId: BreachEpisodeId): Promise<StoredExecutionAttempt[]> {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.episodeId === episodeId && attempt.lifecycleState.kind === 'awaiting-signature')
      .map((attempt) => ({
        ...attempt,
        completedSteps: [...attempt.completedSteps],
        transactionReferences: [...attempt.transactionReferences],
      }));
  }

  async listSubmittedAttempts(): Promise<StoredExecutionAttempt[]> {
    return Array.from(this.attempts.values())
      .filter((attempt) => attempt.lifecycleState.kind === 'submitted')
      .map((attempt) => ({
        ...attempt,
        completedSteps: [...attempt.completedSteps],
        transactionReferences: [...attempt.transactionReferences],
      }));
  }

  async updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void> {
    const existing = this.attempts.get(attemptId);
    if (existing) {
      this.attempts.set(attemptId, { ...existing, lifecycleState: state });
    }
  }
}
