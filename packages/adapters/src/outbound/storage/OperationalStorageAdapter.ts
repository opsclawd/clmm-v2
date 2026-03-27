import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { breachEpisodes, exitTriggers, executionAttempts, executionSessions, executionPreviews } from './schema/index.js';
import type {
  TriggerRepository,
  ExecutionRepository,
  ExecutionSessionRepository,
  IdGeneratorPort,
} from '@clmm/application';
import type {
  ExitTrigger,
  BreachEpisode,
  ExitTriggerId,
  BreachEpisodeId,
  WalletId,
  PositionId,
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  ClockTimestamp,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

function directionFromKind(kind: string) {
  if (kind === 'lower-bound-breach') return LOWER_BOUND_BREACH;
  if (kind === 'upper-bound-breach') return UPPER_BOUND_BREACH;
  throw new Error(`directionFromKind: unknown kind ${kind}`);
}

export class OperationalStorageAdapter
  implements TriggerRepository, ExecutionRepository, ExecutionSessionRepository
{
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
  ) {}

  // --- TriggerRepository ---

  async saveTrigger(trigger: ExitTrigger): Promise<void> {
    await this.db.insert(exitTriggers).values({
      triggerId: trigger.triggerId,
      positionId: trigger.positionId,
      episodeId: trigger.episodeId,
      directionKind: trigger.breachDirection.kind,
      triggeredAt: trigger.triggeredAt,
      confirmationEvaluatedAt: trigger.confirmationEvaluatedAt,
      confirmationPassed: true,
    }).onConflictDoNothing();
  }

  async getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    const rows = await this.db
      .select()
      .from(exitTriggers)
      .where(eq(exitTriggers.triggerId, triggerId));
    const [row] = rows;
    if (!row) return null;
    return {
      triggerId: row.triggerId as ExitTriggerId,
      positionId: row.positionId as PositionId,
      episodeId: row.episodeId as BreachEpisodeId,
      breachDirection: directionFromKind(row.directionKind),
      triggeredAt: makeClockTimestamp(row.triggeredAt),
      confirmationEvaluatedAt: makeClockTimestamp(row.confirmationEvaluatedAt),
      confirmationPassed: true,
    };
  }

  async listActionableTriggers(_walletId: WalletId): Promise<ExitTrigger[]> {
    const rows = await this.db.select().from(exitTriggers);
    return rows.map((row) => ({
      triggerId: row.triggerId as ExitTriggerId,
      positionId: row.positionId as PositionId,
      episodeId: row.episodeId as BreachEpisodeId,
      breachDirection: directionFromKind(row.directionKind),
      triggeredAt: makeClockTimestamp(row.triggeredAt),
      confirmationEvaluatedAt: makeClockTimestamp(row.confirmationEvaluatedAt),
      confirmationPassed: true,
    }));
  }

  async getActiveEpisodeTrigger(episodeId: BreachEpisodeId): Promise<ExitTriggerId | null> {
    const rows = await this.db
      .select()
      .from(breachEpisodes)
      .where(eq(breachEpisodes.episodeId, episodeId));
    const [row] = rows;
    return (row?.activeTriggerId as ExitTriggerId | undefined) ?? null;
  }

  async saveEpisode(episode: BreachEpisode): Promise<void> {
    await this.db.insert(breachEpisodes).values({
      episodeId: episode.episodeId,
      positionId: episode.positionId,
      directionKind: episode.direction.kind,
      startedAt: episode.startedAt,
      lastObservedAt: episode.lastObservedAt,
      activeTriggerId: episode.activeTriggerId ?? null,
    }).onConflictDoUpdate({
      target: breachEpisodes.episodeId,
      set: {
        lastObservedAt: episode.lastObservedAt,
        activeTriggerId: episode.activeTriggerId ?? null,
      },
    });
  }

  // --- ExecutionRepository ---

  async savePreview(positionId: PositionId, preview: ExecutionPreview): Promise<{ previewId: string }> {
    const previewId = this.ids.generateId();
    await this.db.insert(executionPreviews).values({
      previewId,
      positionId,
      planJson: preview.plan as unknown as Record<string, unknown>,
      freshnessKind: preview.freshness.kind,
      freshnessExpiresAt: preview.freshness.kind === 'fresh' ? preview.freshness.expiresAt : null,
      estimatedAt: preview.estimatedAt,
      createdAt: Date.now(),
    });
    return { previewId };
  }

  async getPreview(previewId: string): Promise<ExecutionPreview | null> {
    const rows = await this.db
      .select()
      .from(executionPreviews)
      .where(eq(executionPreviews.previewId, previewId));
    const [row] = rows;
    if (!row) return null;
    return {
      plan: row.planJson as ExecutionPreview['plan'],
      freshness: row.freshnessKind === 'fresh'
        ? { kind: 'fresh', expiresAt: row.freshnessExpiresAt ?? 0 }
        : row.freshnessKind === 'stale'
          ? { kind: 'stale' }
          : { kind: 'expired' },
      estimatedAt: makeClockTimestamp(row.estimatedAt),
    };
  }

  async saveAttempt(
    attempt: ExecutionAttempt & { attemptId: string; positionId: PositionId },
  ): Promise<void> {
    const now = Date.now();
    await this.db.insert(executionAttempts).values({
      attemptId: attempt.attemptId,
      positionId: attempt.positionId,
      lifecycleStateKind: attempt.lifecycleState.kind,
      completedStepsJson: attempt.completedSteps as unknown as string[],
      transactionRefsJson: attempt.transactionReferences as unknown as Record<string, unknown>[],
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  async getAttempt(attemptId: string): Promise<(ExecutionAttempt & { attemptId: string; positionId: PositionId }) | null> {
    const rows = await this.db
      .select()
      .from(executionAttempts)
      .where(eq(executionAttempts.attemptId, attemptId));
    const [row] = rows;
    if (!row) return null;
    return {
      attemptId: row.attemptId,
      positionId: row.positionId as PositionId,
      lifecycleState: { kind: row.lifecycleStateKind } as ExecutionLifecycleState,
      completedSteps: (row.completedStepsJson as unknown as ExecutionAttempt['completedSteps']) ?? [],
      transactionReferences: (row.transactionRefsJson as unknown as ExecutionAttempt['transactionReferences']) ?? [],
    };
  }

  async updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void> {
    await this.db
      .update(executionAttempts)
      .set({ lifecycleStateKind: state.kind, updatedAt: Date.now() })
      .where(eq(executionAttempts.attemptId, attemptId));
  }

  // --- ExecutionSessionRepository ---

  async saveSession(params: {
    sessionId: string;
    attemptId: string;
    walletId: WalletId;
    positionId: PositionId;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    await this.db.insert(executionSessions).values({
      sessionId: params.sessionId,
      attemptId: params.attemptId,
      walletId: params.walletId,
      positionId: params.positionId,
      createdAt: params.createdAt,
    }).onConflictDoNothing();
  }

  async getSession(sessionId: string): Promise<{ attemptId: string; walletId: WalletId; positionId: PositionId } | null> {
    const rows = await this.db
      .select()
      .from(executionSessions)
      .where(eq(executionSessions.sessionId, sessionId));
    const [row] = rows;
    if (!row) return null;
    return {
      attemptId: row.attemptId,
      walletId: row.walletId as WalletId,
      positionId: row.positionId as PositionId,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(executionSessions).where(eq(executionSessions.sessionId, sessionId));
  }
}
