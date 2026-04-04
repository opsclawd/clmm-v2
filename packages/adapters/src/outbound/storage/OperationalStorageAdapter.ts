import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from './db.js';
import { breachEpisodes, exitTriggers, executionAttempts, executionSessions, executionPreviews, preparedPayloads } from './schema/index.js';
import type {
  BreachEpisodeRepository,
  EpisodeTransition,
  FinalizationResult,
  TriggerRepository,
  ExecutionRepository,
  ExecutionSessionRepository,
  IdGeneratorPort,
  SupportedPositionReadPort,
  StoredExecutionAttempt,
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
  BreachDirection,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

function directionFromKind(kind: string) {
  if (kind === 'lower-bound-breach') return LOWER_BOUND_BREACH;
  if (kind === 'upper-bound-breach') return UPPER_BOUND_BREACH;
  throw new Error(`directionFromKind: unknown kind ${kind}`);
}

export class OperationalStorageAdapter
  implements BreachEpisodeRepository, TriggerRepository, ExecutionRepository, ExecutionSessionRepository
{
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
    private readonly positionReadPort: SupportedPositionReadPort,
  ) {}

  // --- BreachEpisodeRepository ---

  async recordInRange(positionId: PositionId, observedAt: ClockTimestamp): Promise<EpisodeTransition> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(breachEpisodes)
        .where(and(
          eq(breachEpisodes.positionId, positionId),
          eq(breachEpisodes.status, 'open'),
        ))
        .for('update');

      const [episode] = rows;
      if (!episode) {
        return { kind: 'no-op' };
      }

      const nextLastObservedAt = observedAt > episode.lastObservedAt
        ? observedAt
        : makeClockTimestamp(episode.lastObservedAt);

      await tx
        .update(breachEpisodes)
        .set({
          status: 'closed',
          closeReason: 'position-recovered',
          closedAt: observedAt,
          lastObservedAt: nextLastObservedAt,
        })
        .where(eq(breachEpisodes.episodeId, episode.episodeId));

      return {
        kind: 'episode-closed-recovered',
        closedEpisodeId: episode.episodeId as BreachEpisodeId,
        direction: directionFromKind(episode.directionKind),
      };
    });
  }

  async recordOutOfRange(
    positionId: PositionId,
    direction: BreachDirection,
    observedAt: ClockTimestamp,
  ): Promise<EpisodeTransition> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(breachEpisodes)
        .where(and(
          eq(breachEpisodes.positionId, positionId),
          eq(breachEpisodes.status, 'open'),
        ))
        .for('update');

      const [openEpisode] = rows;

      if (!openEpisode) {
        const episodeId = this.ids.generateId() as BreachEpisodeId;
        await tx.insert(breachEpisodes).values({
          episodeId,
          positionId,
          directionKind: direction.kind,
          status: 'open',
          consecutiveCount: 1,
          startedAt: observedAt,
          lastObservedAt: observedAt,
          triggerId: null,
          closedAt: null,
          closeReason: null,
        });

        return {
          kind: 'episode-started',
          episodeId,
          direction,
          consecutiveCount: 1,
        };
      }

      if (openEpisode.directionKind === direction.kind) {
        if (observedAt > openEpisode.lastObservedAt) {
          const consecutiveCount = openEpisode.consecutiveCount + 1;
          await tx
            .update(breachEpisodes)
            .set({
              consecutiveCount,
              lastObservedAt: observedAt,
            })
            .where(eq(breachEpisodes.episodeId, openEpisode.episodeId));

          return {
            kind: 'episode-continued',
            episodeId: openEpisode.episodeId as BreachEpisodeId,
            direction,
            consecutiveCount,
          };
        }

        return {
          kind: 'episode-continued',
          episodeId: openEpisode.episodeId as BreachEpisodeId,
          direction,
          consecutiveCount: openEpisode.consecutiveCount,
        };
      }

      await tx
        .update(breachEpisodes)
        .set({
          status: 'closed',
          closeReason: 'direction-reversed',
          closedAt: observedAt,
        })
        .where(eq(breachEpisodes.episodeId, openEpisode.episodeId));

      const newEpisodeId = this.ids.generateId() as BreachEpisodeId;
      await tx.insert(breachEpisodes).values({
        episodeId: newEpisodeId,
        positionId,
        directionKind: direction.kind,
        status: 'open',
        consecutiveCount: 1,
        startedAt: observedAt,
        lastObservedAt: observedAt,
        triggerId: null,
        closedAt: null,
        closeReason: null,
      });

      return {
        kind: 'episode-reversed',
        closedEpisodeId: openEpisode.episodeId as BreachEpisodeId,
        oldDirection: directionFromKind(openEpisode.directionKind),
        newEpisodeId,
        newDirection: direction,
        consecutiveCount: 1,
      };
    });
  }

  async getOpenEpisode(positionId: PositionId): Promise<BreachEpisode | null> {
    const rows = await this.db
      .select()
      .from(breachEpisodes)
      .where(and(
        eq(breachEpisodes.positionId, positionId),
        eq(breachEpisodes.status, 'open'),
      ));
    const [row] = rows;
    if (!row) return null;

    return {
      episodeId: row.episodeId as BreachEpisodeId,
      positionId: row.positionId as PositionId,
      direction: directionFromKind(row.directionKind),
      status: row.status as BreachEpisode['status'],
      startedAt: makeClockTimestamp(row.startedAt),
      lastObservedAt: makeClockTimestamp(row.lastObservedAt),
      consecutiveCount: row.consecutiveCount,
      triggerId: (row.triggerId as ExitTriggerId | null) ?? null,
      closedAt: row.closedAt === null ? null : makeClockTimestamp(row.closedAt),
      closeReason: row.closeReason as BreachEpisode['closeReason'],
    };
  }

  async finalizeQualification(
    episodeId: BreachEpisodeId,
    trigger: ExitTrigger,
  ): Promise<FinalizationResult> {
    if (trigger.episodeId !== episodeId) {
      throw new Error(
        `finalizeQualification: trigger episode mismatch (expected ${episodeId}, got ${trigger.episodeId})`,
      );
    }

    return this.db.transaction(async (tx) => {
      const episodeRows = await tx
        .select()
        .from(breachEpisodes)
        .where(eq(breachEpisodes.episodeId, episodeId))
        .for('update');
      const [episode] = episodeRows;

      if (!episode) {
        throw new Error(`finalizeQualification: episode not found ${episodeId}`);
      }

      if (episode.status !== 'open') {
        if (episode.triggerId) {
          return {
            kind: 'duplicate-suppressed',
            existingTriggerId: episode.triggerId as ExitTriggerId,
          };
        }

        throw new Error(`finalizeQualification: episode ${episodeId} is closed without an existing trigger`);
      }

      if (episode.triggerId) {
        return {
          kind: 'duplicate-suppressed',
          existingTriggerId: episode.triggerId as ExitTriggerId,
        };
      }

      const inserted = await tx
        .insert(exitTriggers)
        .values({
          triggerId: trigger.triggerId,
          positionId: trigger.positionId,
          episodeId: trigger.episodeId,
          directionKind: trigger.breachDirection.kind,
          triggeredAt: trigger.triggeredAt,
          confirmationEvaluatedAt: trigger.confirmationEvaluatedAt,
          confirmationPassed: true,
        })
        .onConflictDoNothing()
        .returning({ triggerId: exitTriggers.triggerId });

      const [insertedTrigger] = inserted;
      if (!insertedTrigger) {
        const existingRows = await tx
          .select({ triggerId: exitTriggers.triggerId })
          .from(exitTriggers)
          .where(eq(exitTriggers.episodeId, episodeId));
        const [existingTrigger] = existingRows;

        if (!existingTrigger) {
          throw new Error(`finalizeQualification: missing existing trigger for episode ${episodeId}`);
        }

        await tx
          .update(breachEpisodes)
          .set({ triggerId: existingTrigger.triggerId })
          .where(eq(breachEpisodes.episodeId, episodeId));

        return {
          kind: 'duplicate-suppressed',
          existingTriggerId: existingTrigger.triggerId as ExitTriggerId,
        };
      }

      await tx
        .update(breachEpisodes)
        .set({ triggerId: insertedTrigger.triggerId })
        .where(eq(breachEpisodes.episodeId, episodeId));

      return {
        kind: 'qualified',
        triggerId: insertedTrigger.triggerId as ExitTriggerId,
      };
    });
  }

  // --- TriggerRepository ---

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

  async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    const positions = await this.positionReadPort.listSupportedPositions(walletId);
    const positionIds = positions.map((position) => position.positionId);
    if (positionIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(exitTriggers)
      .where(inArray(exitTriggers.positionId, positionIds));

    const ownedPositionIds = new Set(positionIds);
    return rows.map((row) => ({
      triggerId: row.triggerId as ExitTriggerId,
      positionId: row.positionId as PositionId,
      episodeId: row.episodeId as BreachEpisodeId,
      breachDirection: directionFromKind(row.directionKind),
      triggeredAt: makeClockTimestamp(row.triggeredAt),
      confirmationEvaluatedAt: makeClockTimestamp(row.confirmationEvaluatedAt),
      confirmationPassed: true as const,
    })).filter((trigger) => ownedPositionIds.has(trigger.positionId));
  }

  async deleteTrigger(triggerId: ExitTriggerId): Promise<void> {
    await this.db.delete(exitTriggers).where(eq(exitTriggers.triggerId, triggerId));
  }

  // --- ExecutionRepository ---

  async savePreview(positionId: PositionId, preview: ExecutionPreview, breachDirection: BreachDirection): Promise<{ previewId: string }> {
    const previewId = this.ids.generateId();
    await this.db.insert(executionPreviews).values({
      previewId,
      positionId,
      directionKind: breachDirection.kind,
      planJson: preview.plan as unknown as Record<string, unknown>,
      freshnessKind: preview.freshness.kind,
      freshnessExpiresAt: preview.freshness.kind === 'fresh' ? preview.freshness.expiresAt : null,
      estimatedAt: preview.estimatedAt,
      createdAt: Date.now(),
    });
    return { previewId };
  }

  async getPreview(previewId: string): Promise<{
    preview: ExecutionPreview;
    positionId: PositionId;
    breachDirection: BreachDirection;
  } | null> {
    const rows = await this.db
      .select()
      .from(executionPreviews)
      .where(eq(executionPreviews.previewId, previewId));
    const [row] = rows;
    if (!row) return null;
    const preview: ExecutionPreview = {
      plan: row.planJson as ExecutionPreview['plan'],
      freshness: row.freshnessKind === 'fresh'
        ? { kind: 'fresh', expiresAt: row.freshnessExpiresAt ?? 0 }
        : row.freshnessKind === 'stale'
          ? { kind: 'stale' }
          : { kind: 'expired' },
      estimatedAt: makeClockTimestamp(row.estimatedAt),
    };
    return {
      preview,
      positionId: row.positionId as PositionId,
      breachDirection: directionFromKind(row.directionKind),
    };
  }

  async saveAttempt(attempt: StoredExecutionAttempt): Promise<void> {
    const now = Date.now();
    const updateSet = {
      directionKind: attempt.breachDirection.kind,
      lifecycleStateKind: attempt.lifecycleState.kind,
      completedStepsJson: attempt.completedSteps as unknown as string[],
      transactionRefsJson: attempt.transactionReferences as unknown as Record<string, unknown>[],
      updatedAt: now,
    };

    if (attempt.previewId !== undefined) {
      Object.assign(updateSet, { previewId: attempt.previewId });
    }
    if (attempt.episodeId !== undefined) {
      Object.assign(updateSet, { episodeId: attempt.episodeId });
    }

    await this.db.insert(executionAttempts).values({
      attemptId: attempt.attemptId,
      previewId: attempt.previewId ?? null,
      episodeId: attempt.episodeId ?? null,
      positionId: attempt.positionId,
      directionKind: attempt.breachDirection.kind,
      lifecycleStateKind: attempt.lifecycleState.kind,
      completedStepsJson: attempt.completedSteps as unknown as string[],
      transactionRefsJson: attempt.transactionReferences as unknown as Record<string, unknown>[],
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: executionAttempts.attemptId,
      set: updateSet,
    });
  }

  async getAttempt(attemptId: string): Promise<StoredExecutionAttempt | null> {
    const rows = await this.db
      .select()
      .from(executionAttempts)
      .where(eq(executionAttempts.attemptId, attemptId));
    const [row] = rows;
    if (!row) return null;
    return {
      attemptId: row.attemptId,
      positionId: row.positionId as PositionId,
      breachDirection: directionFromKind(row.directionKind),
      lifecycleState: { kind: row.lifecycleStateKind } as ExecutionLifecycleState,
      ...(row.episodeId ? { episodeId: row.episodeId as BreachEpisodeId } : {}),
      ...(row.previewId ? { previewId: row.previewId } : {}),
      // boundary: Drizzle jsonb columns return unknown; runtime shape matches domain types
      completedSteps: (row.completedStepsJson as ExecutionAttempt['completedSteps']) ?? [],
      transactionReferences: (row.transactionRefsJson as ExecutionAttempt['transactionReferences']) ?? [],
    };
  }

  async listAwaitingSignatureAttemptsByEpisode(episodeId: BreachEpisodeId): Promise<StoredExecutionAttempt[]> {
    const rows = await this.db
      .select()
      .from(executionAttempts)
      .where(and(
        eq(executionAttempts.episodeId, episodeId),
        eq(executionAttempts.lifecycleStateKind, 'awaiting-signature'),
      ));

    return rows.map((row) => ({
      attemptId: row.attemptId,
      positionId: row.positionId as PositionId,
      breachDirection: directionFromKind(row.directionKind),
      lifecycleState: { kind: row.lifecycleStateKind } as ExecutionLifecycleState,
      ...(row.episodeId ? { episodeId: row.episodeId as BreachEpisodeId } : {}),
      ...(row.previewId ? { previewId: row.previewId } : {}),
      // boundary: Drizzle jsonb columns return unknown; runtime shape matches domain types
      completedSteps: (row.completedStepsJson as ExecutionAttempt['completedSteps']) ?? [],
      transactionReferences: (row.transactionRefsJson as ExecutionAttempt['transactionReferences']) ?? [],
    }));
  }

  async savePreparedPayload(params: {
    payloadId: string;
    attemptId: string;
    unsignedPayload: Uint8Array;
    payloadVersion: string;
    expiresAt: ClockTimestamp;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    const unsignedPayload = Buffer.from(params.unsignedPayload);
    await this.db.insert(preparedPayloads).values({
      payloadId: params.payloadId,
      attemptId: params.attemptId,
      unsignedPayload,
      payloadVersion: params.payloadVersion,
      expiresAt: params.expiresAt,
      createdAt: params.createdAt,
    }).onConflictDoUpdate({
      target: preparedPayloads.attemptId,
      set: {
        payloadId: params.payloadId,
        unsignedPayload,
        payloadVersion: params.payloadVersion,
        expiresAt: params.expiresAt,
      },
    });
  }

  async getPreparedPayload(attemptId: string): Promise<{
    payloadVersion: string;
    unsignedPayload: Uint8Array;
    expiresAt: ClockTimestamp;
  } | null> {
    const rows = await this.db
      .select()
      .from(preparedPayloads)
      .where(eq(preparedPayloads.attemptId, attemptId));
    const [row] = rows;
    if (!row) return null;
    return {
      payloadVersion: row.payloadVersion,
      unsignedPayload: Uint8Array.from(row.unsignedPayload),
      expiresAt: makeClockTimestamp(row.expiresAt),
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
