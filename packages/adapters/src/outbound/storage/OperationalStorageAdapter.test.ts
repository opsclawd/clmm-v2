import { describe, it, expect } from 'vitest';
import { OperationalStorageAdapter } from './OperationalStorageAdapter.js';
import { FIXTURE_POSITION_IN_RANGE, FIXTURE_WALLET_ID, FakeIdGeneratorPort } from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp, makePositionId } from '@clmm/domain';
import type { Db } from './db.js';

const leakedPositionId = makePositionId('leaked-position');

function makeDbWithTriggerRows(params: {
  ownershipRows: Array<{ walletId: string; positionId: string; firstSeenAt: number; lastSeenAt: number }>;
  triggerRows: Array<{
    triggerId: string;
    positionId: string;
    episodeId: string;
    directionKind: string;
    triggeredAt: number;
    confirmationEvaluatedAt: number;
    episodeStatus?: string;
  }>;
}): Db {
  function predicateReferencesOpenEpisodeFilter(value: unknown): boolean {
    const visited = new WeakSet<object>();
    function walk(node: unknown): boolean {
      if (node == null) return false;
      if (typeof node === 'string') {
        return node === 'open';
      }
      if (typeof node !== 'object') return false;
      if (visited.has(node)) return false;
      visited.add(node);

      const record = node as Record<string, unknown>;
      const table = record['table'];
      const name = record['name'];
      if (
        typeof name === 'string' &&
        name === 'status' &&
        typeof table === 'object' &&
        table != null &&
        (table as { name?: unknown }).name === 'breach_episodes'
      ) {
        return true;
      }

      const queryChunks = record['queryChunks'];
      if (Array.isArray(queryChunks) && queryChunks.some((chunk) => walk(chunk))) {
        return true;
      }

      return Object.values(record).some((entry) => walk(entry));
    }

    return walk(value);
  }

  let selectCallCount = 0;

  return {
    select() {
      selectCallCount++;
      return {
        from(table: unknown) {
          const tableName = (table as { name?: string })?.name ??
            ((table as Record<string | symbol, unknown>)[Symbol.for('drizzle:Name')] as string | undefined) ?? '';

          // First select call in listActionableTriggers queries wallet_position_ownership
          if (selectCallCount === 1 || tableName === 'wallet_position_ownership') {
            return {
              where: async () => params.ownershipRows,
            };
          }

          // Second select call queries exit_triggers joined with breach_episodes
          return {
            innerJoin: () => ({
              where: async (predicate: unknown) => (
                predicateReferencesOpenEpisodeFilter(predicate)
                  ? params.triggerRows.filter((row) => row.episodeStatus === 'open')
                  : params.triggerRows
              ),
            }),
          };
        },
      };
    },
  } as unknown as Db;
}

function makeDbForFinalizeQualification(params: {
  episode: {
    episodeId: string;
    positionId: string;
    directionKind: string;
    status: 'open' | 'closed';
    consecutiveCount: number;
    startedAt: number;
    lastObservedAt: number;
    triggerId: string | null;
    closedAt: number | null;
    closeReason: 'position-recovered' | 'direction-reversed' | null;
  };
  existingTriggerByEpisodeId?: string;
}) {
  const calls = {
    transaction: 0,
    insertExitTriggers: 0,
    updateEpisodes: 0,
  };

  const existingTriggerRows = params.existingTriggerByEpisodeId == null
    ? []
    : [{ triggerId: params.existingTriggerByEpisodeId }];

  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      calls.transaction += 1;
      const tx = {
        select: () => ({
          from: () => ({
            where: () => {
              return {
                for: async () => [params.episode],
                then: (resolve: (value: unknown[]) => unknown, _reject?: (reason?: unknown) => unknown) => resolve(existingTriggerRows),
              };
            },
          }),
        }),
        insert: () => ({
          values: () => {
            calls.insertExitTriggers += 1;
            return {
              onConflictDoNothing: () => ({
                returning: async () => [],
              }),
            };
          },
        }),
        update: () => ({
          set: () => {
            calls.updateEpisodes += 1;
            return {
              where: async () => undefined,
            };
          },
        }),
      };
      return fn(tx);
    },
  };

  return {
    db: db as unknown as Db,
    calls,
  };
}

describe('OperationalStorageAdapter', () => {
  it('scopes actionable triggers to positions owned by the requested wallet via DB lookup', async () => {
    const adapter = new OperationalStorageAdapter(
      makeDbWithTriggerRows({
        ownershipRows: [
          {
            walletId: FIXTURE_WALLET_ID,
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            firstSeenAt: 1_000_000,
            lastSeenAt: 1_000_000,
          },
        ],
        triggerRows: [
          {
            triggerId: 'trigger-owned',
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            episodeId: 'episode-owned',
            directionKind: 'lower-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_000),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
            episodeStatus: 'open',
          },
          {
            triggerId: 'trigger-leaked',
            positionId: leakedPositionId,
            episodeId: 'episode-leaked',
            directionKind: 'upper-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_002),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_003),
            episodeStatus: 'open',
          },
        ],
      }),
      new FakeIdGeneratorPort('storage'),
    );

    const triggers = await adapter.listActionableTriggers(FIXTURE_WALLET_ID);

    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.triggerId).toBe('trigger-owned');
    expect(triggers[0]?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
  });

  it('does not return triggers whose breach episode is already closed', async () => {
    const adapter = new OperationalStorageAdapter(
      makeDbWithTriggerRows({
        ownershipRows: [
          {
            walletId: FIXTURE_WALLET_ID,
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            firstSeenAt: 1_000_000,
            lastSeenAt: 1_000_000,
          },
        ],
        triggerRows: [
          {
            triggerId: 'trigger-closed',
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            episodeId: 'episode-closed',
            directionKind: 'lower-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_000),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
            episodeStatus: 'closed',
          },
        ],
      }),
      new FakeIdGeneratorPort('storage'),
    );

    const triggers = await adapter.listActionableTriggers(FIXTURE_WALLET_ID);

    expect(triggers).toHaveLength(0);
  });

  it('returns empty array when no ownership rows exist for the wallet', async () => {
    const adapter = new OperationalStorageAdapter(
      makeDbWithTriggerRows({
        ownershipRows: [],
        triggerRows: [
          {
            triggerId: 'trigger-orphan',
            positionId: FIXTURE_POSITION_IN_RANGE.positionId,
            episodeId: 'episode-orphan',
            directionKind: 'lower-bound-breach',
            triggeredAt: makeClockTimestamp(1_000_000),
            confirmationEvaluatedAt: makeClockTimestamp(1_000_001),
            episodeStatus: 'open',
          },
        ],
      }),
      new FakeIdGeneratorPort('storage'),
    );

    const triggers = await adapter.listActionableTriggers(FIXTURE_WALLET_ID);

    expect(triggers).toHaveLength(0);
  });

  it('returns duplicate-suppressed for closed episodes with an existing trigger and does not insert', async () => {
    const episodeId = 'episode-closed-with-trigger';
    const triggerId = 'trigger-existing';
    const { db, calls } = makeDbForFinalizeQualification({
      episode: {
        episodeId,
        positionId: FIXTURE_POSITION_IN_RANGE.positionId,
        directionKind: 'lower-bound-breach',
        status: 'closed',
        consecutiveCount: 2,
        startedAt: makeClockTimestamp(1_000),
        lastObservedAt: makeClockTimestamp(1_100),
        triggerId,
        closedAt: makeClockTimestamp(1_100),
        closeReason: 'position-recovered',
      },
    });
    const adapter = new OperationalStorageAdapter(
      db,
      new FakeIdGeneratorPort('storage'),
    );

    const result = await adapter.finalizeQualification(episodeId as never, {
      triggerId: 'trigger-new' as never,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: episodeId as never,
      breachDirection: LOWER_BOUND_BREACH,
      triggeredAt: makeClockTimestamp(1_200),
      confirmationEvaluatedAt: makeClockTimestamp(1_201),
      confirmationPassed: true,
    });

    expect(result).toEqual({
      kind: 'duplicate-suppressed',
      existingTriggerId: triggerId,
    });
    expect(calls.insertExitTriggers).toBe(0);
  });

  it('throws when qualifying a closed episode without an existing trigger', async () => {
    const episodeId = 'episode-closed-no-trigger';
    const { db, calls } = makeDbForFinalizeQualification({
      episode: {
        episodeId,
        positionId: FIXTURE_POSITION_IN_RANGE.positionId,
        directionKind: 'lower-bound-breach',
        status: 'closed',
        consecutiveCount: 1,
        startedAt: makeClockTimestamp(2_000),
        lastObservedAt: makeClockTimestamp(2_100),
        triggerId: null,
        closedAt: makeClockTimestamp(2_100),
        closeReason: 'position-recovered',
      },
    });
    const adapter = new OperationalStorageAdapter(
      db,
      new FakeIdGeneratorPort('storage'),
    );

    await expect(() => adapter.finalizeQualification(episodeId as never, {
      triggerId: 'trigger-new' as never,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: episodeId as never,
      breachDirection: LOWER_BOUND_BREACH,
      triggeredAt: makeClockTimestamp(2_200),
      confirmationEvaluatedAt: makeClockTimestamp(2_201),
      confirmationPassed: true,
    })).rejects.toThrow(`finalizeQualification: episode ${episodeId} is closed without an existing trigger`);
    expect(calls.insertExitTriggers).toBe(0);
  });

  it('rejects finalizeQualification when trigger episodeId mismatches argument', async () => {
    const episodeId = 'episode-a';
    const { db, calls } = makeDbForFinalizeQualification({
      episode: {
        episodeId,
        positionId: FIXTURE_POSITION_IN_RANGE.positionId,
        directionKind: 'lower-bound-breach',
        status: 'open',
        consecutiveCount: 1,
        startedAt: makeClockTimestamp(3_000),
        lastObservedAt: makeClockTimestamp(3_100),
        triggerId: null,
        closedAt: null,
        closeReason: null,
      },
    });
    const adapter = new OperationalStorageAdapter(
      db,
      new FakeIdGeneratorPort('storage'),
    );

    await expect(() => adapter.finalizeQualification(episodeId as never, {
      triggerId: 'trigger-new' as never,
      positionId: FIXTURE_POSITION_IN_RANGE.positionId,
      episodeId: 'episode-b' as never,
      breachDirection: LOWER_BOUND_BREACH,
      triggeredAt: makeClockTimestamp(3_200),
      confirmationEvaluatedAt: makeClockTimestamp(3_201),
      confirmationPassed: true,
    })).rejects.toThrow('finalizeQualification: trigger episode mismatch');
    expect(calls.transaction).toBe(0);
    expect(calls.insertExitTriggers).toBe(0);
  });
});
