import { describe, expect, it, vi } from 'vitest';
import { PgBossLifecycle } from './PgBossLifecycle.js';
import { ReconciliationJobHandler } from '../jobs/ReconciliationJobHandler.js';
import type { ObservabilityPort } from '@clmm/application';

class FakeObservabilityPort {
  logs: Array<{ level: string; message: string; context?: Record<string, unknown> | undefined }> = [];

  log(level: string, message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level, message, ...(context !== undefined ? { context } : {}) });
  }

  recordTiming(): void {}
  recordDetectionTiming(): void {}
  recordDeliveryTiming(): void {}
}

function createFakeBoss(startSucceeds = true, stopSucceeds = true, createQueueSucceeds = true) {
  const fake = {
    started: false,
    stopped: false,
    queuesCreated: [] as string[],
    start: vi.fn(async () => {
      if (!startSucceeds) throw new Error('pg-boss start failed');
      fake.started = true;
    }),
    stop: vi.fn(async () => {
      if (!stopSucceeds) throw new Error('pg-boss stop failed');
      fake.stopped = true;
    }),
    createQueue: vi.fn(async (name: string) => {
      if (!createQueueSucceeds) throw new Error('pg-boss createQueue failed');
      fake.queuesCreated.push(name);
    }),
  };
  return fake;
}

describe('PgBossLifecycle', () => {
  it('resolves immediately even when boss.start() rejects', async () => {
    const boss = createFakeBoss(false);
    const observability = new FakeObservabilityPort();

    const lifecycle = new PgBossLifecycle(
      boss as unknown as import('pg-boss').PgBoss,
      observability as ObservabilityPort,
    );

    await lifecycle.onModuleInit();

    expect(boss.start).toHaveBeenCalledTimes(1);
  });

  it('logs warn with error message when boss.start() fails', async () => {
    const boss = createFakeBoss(false);
    const observability = new FakeObservabilityPort();

    const lifecycle = new PgBossLifecycle(
      boss as unknown as import('pg-boss').PgBoss,
      observability as ObservabilityPort,
    );

    await lifecycle.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(observability.logs).toHaveLength(1);
    expect(observability.logs[0]!.level).toBe('warn');
    expect(observability.logs[0]!.message).toContain('pg-boss startup failed');
    expect(observability.logs[0]!.context).toMatchObject({ error: 'pg-boss start failed' });
  });

  it('calls createQueue with reconcile-execution queue name on successful start', async () => {
    const boss = createFakeBoss();
    const observability = new FakeObservabilityPort();

    const lifecycle = new PgBossLifecycle(
      boss as unknown as import('pg-boss').PgBoss,
      observability as ObservabilityPort,
    );

    await lifecycle.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(boss.createQueue).toHaveBeenCalledTimes(1);
    expect(boss.queuesCreated).toContain(ReconciliationJobHandler.JOB_NAME);
    expect(observability.logs).toHaveLength(0);
  });

  it('logs warn when boss.start() succeeds but createQueue fails', async () => {
    const boss = createFakeBoss(true, true, false);
    const observability = new FakeObservabilityPort();

    const lifecycle = new PgBossLifecycle(
      boss as unknown as import('pg-boss').PgBoss,
      observability as ObservabilityPort,
    );

    await lifecycle.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(observability.logs).toHaveLength(1);
    expect(observability.logs[0]!.level).toBe('warn');
    expect(observability.logs[0]!.message).toContain('pg-boss startup failed');
  });

  it('awaits in-flight start promise before calling stop on destroy', async () => {
    let resolveStart: () => void = () => {};
    const startPromise = new Promise<void>((resolve) => { resolveStart = resolve; });
    const boss = {
      start: vi.fn(() => startPromise),
      stop: vi.fn(async () => {}),
      createQueue: vi.fn(async () => {}),
    };
    const observability = new FakeObservabilityPort();

    const lifecycle = new PgBossLifecycle(
      boss as unknown as import('pg-boss').PgBoss,
      observability as ObservabilityPort,
    );

    await lifecycle.onModuleInit();

    const destroyPromise = lifecycle.onModuleDestroy();
    resolveStart();
    await destroyPromise;

    expect(boss.stop).toHaveBeenCalledTimes(1);
  });

  it('does not throw when startPromise rejected and stop() also rejects', async () => {
    const boss = createFakeBoss(false, false);
    const observability = new FakeObservabilityPort();

    const lifecycle = new PgBossLifecycle(
      boss as unknown as import('pg-boss').PgBoss,
      observability as ObservabilityPort,
    );

    await lifecycle.onModuleInit();
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(lifecycle.onModuleDestroy()).resolves.toBeUndefined();
  });
});