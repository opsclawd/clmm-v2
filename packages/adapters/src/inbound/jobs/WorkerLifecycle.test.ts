import { describe, it, expect, vi } from 'vitest';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import type { Job, PgBoss } from 'pg-boss';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { SubmittedAttemptSweepHandler } from './SubmittedAttemptSweepHandler.js';
import { WorkerLifecycle } from './WorkerLifecycle.js';
import { PG_BOSS_INSTANCE } from './tokens.js';

describe('WorkerLifecycle', () => {
  it('declares explicit injection tokens for all constructor dependencies', () => {
    const deps = (Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      WorkerLifecycle,
    ) as Array<{ index: number; param: unknown }>).sort((left, right) => left.index - right.index);

    expect(deps).toEqual([
      { index: 0, param: PG_BOSS_INSTANCE },
      { index: 1, param: BreachScanJobHandler },
      { index: 2, param: TriggerQualificationJobHandler },
      { index: 3, param: ReconciliationJobHandler },
      { index: 4, param: NotificationDispatchJobHandler },
      { index: 5, param: SubmittedAttemptSweepHandler },
    ]);
  });

  it('invokes the breach scan handler from the registered pg-boss callback', async () => {
    const callbacks = new Map<string, (jobs: Job<object>[]) => Promise<void>>();
    const boss = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      createQueue: vi.fn().mockResolvedValue(undefined),
      work: vi.fn(async (name: string, callback: (jobs: Job<object>[]) => Promise<void>) => {
        callbacks.set(name, callback);
      }),
      schedule: vi.fn().mockResolvedValue(undefined),
    } as unknown as PgBoss;

    const breachScanHandle = vi.fn().mockResolvedValue(undefined);
    const breachScanHandler = {
      handle: breachScanHandle,
    } as unknown as BreachScanJobHandler;
    const triggerQualificationHandler = {
      handle: vi.fn().mockResolvedValue(undefined),
    } as unknown as TriggerQualificationJobHandler;
    const reconciliationHandler = {
      handle: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReconciliationJobHandler;
    const notificationDispatchHandler = {
      handle: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationDispatchJobHandler;
    const submittedAttemptSweepHandler = {
      handle: vi.fn().mockResolvedValue(undefined),
    } as unknown as SubmittedAttemptSweepHandler;

    const lifecycle = new WorkerLifecycle(
      boss,
      breachScanHandler,
      triggerQualificationHandler,
      reconciliationHandler,
      notificationDispatchHandler,
      submittedAttemptSweepHandler,
    );

    await lifecycle.onModuleInit();

    const breachScanCallback = callbacks.get(BreachScanJobHandler.JOB_NAME);

    expect(breachScanCallback).toBeDefined();

    await breachScanCallback?.([
      { id: 'job-1', data: {} } as Job<object>,
    ]);

    expect(breachScanHandle).toHaveBeenCalledTimes(1);
  });
});
