import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeTriggerRepository,
  FakeObservabilityPort,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { makeClockTimestamp } from '@clmm/domain';

type EnqueuedJob = { name: string; data: unknown };

function makePayload(overrides?: Partial<{
  positionId: string;
  walletId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
  observedAt: number;
  episodeId: string;
}>) {
  return {
    positionId: FIXTURE_POSITION_ID as string,
    walletId: FIXTURE_WALLET_ID as string,
    directionKind: 'lower-bound-breach' as const,
    observedAt: makeClockTimestamp(1_000_000) as number,
    episodeId: 'ep-test-1',
    ...overrides,
  };
}

describe('TriggerQualificationJobHandler', () => {
  let triggerRepo: FakeTriggerRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let enqueuedJobs: EnqueuedJob[];
  let handler: TriggerQualificationJobHandler;

  beforeEach(() => {
    triggerRepo = new FakeTriggerRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('trigger');
    observability = new FakeObservabilityPort();
    enqueuedJobs = [];

    const enqueue = async (name: string, data: unknown): Promise<void> => {
      enqueuedJobs.push({ name, data });
    };

    handler = new TriggerQualificationJobHandler(
      triggerRepo,
      clock,
      ids,
      observability,
      enqueue,
    );
  });

  it('creates a trigger and enqueues notification for lower-bound breach', async () => {
    await handler.handle(makePayload());

    // Trigger should be persisted
    expect(triggerRepo.triggers.size).toBe(1);

    // Notification should be enqueued
    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]!.name).toBe('dispatch-notification');

    // Observability should log creation
    const infoLogs = observability.logs.filter((l) => l.level === 'info');
    expect(infoLogs.length).toBeGreaterThan(0);
  });

  it('suppresses duplicate trigger for same episode without throwing', async () => {
    // First call creates the trigger
    await handler.handle(makePayload());
    expect(triggerRepo.triggers.size).toBe(1);
    expect(enqueuedJobs).toHaveLength(1);

    // Second call with same episodeId should suppress duplicate
    await handler.handle(makePayload());

    // Trigger count should NOT increase
    expect(triggerRepo.triggers.size).toBe(1);

    // No additional notification enqueued
    expect(enqueuedJobs).toHaveLength(1);

    // Should log suppression
    const suppressionLogs = observability.logs.filter(
      (l) => l.level === 'info' && l.message.includes('suppressed'),
    );
    expect(suppressionLogs.length).toBeGreaterThan(0);
  });

  it('rethrows errors for pg-boss retry', async () => {
    // Use a broken triggerRepo that throws
    const brokenRepo = {
      ...triggerRepo,
      getActiveEpisodeTrigger: () => {
        throw new Error('db down');
      },
    } as unknown as FakeTriggerRepository;

    const brokenHandler = new TriggerQualificationJobHandler(
      brokenRepo,
      clock,
      ids,
      observability,
      async () => {},
    );

    await expect(brokenHandler.handle(makePayload())).rejects.toThrow('db down');

    // Error should be logged
    const errorLogs = observability.logs.filter((l) => l.level === 'error');
    expect(errorLogs.length).toBeGreaterThan(0);
  });
});
