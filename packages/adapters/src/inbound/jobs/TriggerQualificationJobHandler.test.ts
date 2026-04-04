import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import {
  FakeClockPort,
  FakeBreachEpisodeRepository,
  FakeIdGeneratorPort,
  FakeObservabilityPort,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp, type BreachEpisodeId } from '@clmm/domain';

type ObservabilityLog = {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown> | undefined;
};

type EnqueuedJob = { name: string; data: unknown };

function makePayload(overrides?: Partial<{
  positionId: string;
  walletId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
  observedAt: number;
  episodeId: string;
  consecutiveCount: number;
}>) {
  return {
    positionId: FIXTURE_POSITION_ID as string,
    walletId: FIXTURE_WALLET_ID as string,
    directionKind: 'lower-bound-breach' as const,
    observedAt: makeClockTimestamp(1_000_000) as number,
    episodeId: 'ep-test-1',
    consecutiveCount: 3,
    ...overrides,
  };
}

function seedOpenEpisode(
  repo: FakeBreachEpisodeRepository,
  episodeId: string,
  consecutiveCount = 3,
): void {
  repo.episodes.set(episodeId, {
    episodeId: episodeId as BreachEpisodeId,
    positionId: FIXTURE_POSITION_ID,
    direction: LOWER_BOUND_BREACH,
    status: 'open',
    startedAt: makeClockTimestamp(900_000),
    lastObservedAt: makeClockTimestamp(1_000_000),
    consecutiveCount,
    triggerId: null,
    closedAt: null,
    closeReason: null,
  });
}

describe('TriggerQualificationJobHandler', () => {
  let episodeRepo: FakeBreachEpisodeRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let enqueuedJobs: EnqueuedJob[];
  let handler: TriggerQualificationJobHandler;

  beforeEach(() => {
    episodeRepo = new FakeBreachEpisodeRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('trigger');
    observability = new FakeObservabilityPort();
    enqueuedJobs = [];

    const enqueue = async (name: string, data: unknown): Promise<void> => {
      enqueuedJobs.push({ name, data });
    };

    handler = new TriggerQualificationJobHandler(
      episodeRepo,
      clock,
      ids,
      observability,
      enqueue,
    );
  });

  it('creates a trigger and enqueues notification for lower-bound breach', async () => {
    const payload = makePayload();
    seedOpenEpisode(episodeRepo, payload.episodeId);

    await handler.handle(payload);

    // Trigger should be persisted
    expect(episodeRepo.episodes.get(payload.episodeId)?.triggerId).toBe('trigger-1');

    // Notification should be enqueued
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]!.name).toBe('dispatch-notification');

    // Observability should log creation
    const infoLogs = observability.logs.filter((l: ObservabilityLog) => l.level === 'info');
    expect(infoLogs.length).toBeGreaterThan(0);
  });

  it('suppresses duplicate trigger for same episode without throwing', async () => {
    const payload = makePayload();
    seedOpenEpisode(episodeRepo, payload.episodeId);

    // First call creates the trigger
    await handler.handle(payload);
    expect(episodeRepo.episodes.get(payload.episodeId)?.triggerId).toBe('trigger-1');
    expect(enqueuedJobs).toHaveLength(1);

    // Second call with same episodeId should suppress duplicate
    await handler.handle(payload);

    // Trigger count should NOT increase
    expect(episodeRepo.episodes.get(payload.episodeId)?.triggerId).toBe('trigger-1');

    // No additional notification enqueued
    expect(enqueuedJobs).toHaveLength(1);

    // Should log suppression
    const suppressionLogs = observability.logs.filter(
      (l: ObservabilityLog) => l.level === 'info' && l.message.includes('suppressed'),
    );
    expect(suppressionLogs.length).toBeGreaterThan(0);
  });

  it('rethrows errors for pg-boss retry', async () => {
    // Use a broken episodeRepo that throws
    const brokenRepo = {
      ...episodeRepo,
      finalizeQualification: () => {
        throw new Error('db down');
      },
    } as unknown as FakeBreachEpisodeRepository;

    const payload = makePayload();
    seedOpenEpisode(episodeRepo, payload.episodeId);

    const brokenHandler = new TriggerQualificationJobHandler(
      brokenRepo,
      clock,
      ids,
      observability,
      async () => {},
    );

    await expect(brokenHandler.handle(payload)).rejects.toThrow('db down');

    // Error should be logged
    const errorLogs = observability.logs.filter((l: ObservabilityLog) => l.level === 'error');
    expect(errorLogs.length).toBeGreaterThan(0);
  });

  it('passes real consecutiveCount from payload to qualifier', async () => {
    const payload = makePayload({ consecutiveCount: 2 });
    seedOpenEpisode(episodeRepo, payload.episodeId, 2);

    await handler.handle(payload);

    expect(episodeRepo.episodes.get(payload.episodeId)?.triggerId).toBeNull();
    expect(enqueuedJobs).toHaveLength(0);

    const notQualifiedLogs = observability.logs.filter(
      (l: ObservabilityLog) => l.level === 'info' && l.message.includes('Trigger not qualified'),
    );
    expect(notQualifiedLogs.length).toBeGreaterThan(0);
  });
});
