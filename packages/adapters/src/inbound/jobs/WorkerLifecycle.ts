import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss } from 'pg-boss';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { PG_BOSS_INSTANCE } from './tokens.js';

@Injectable()
export class WorkerLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(PG_BOSS_INSTANCE)
    private readonly boss: PgBoss,
    @Inject(BreachScanJobHandler)
    private readonly breachScanHandler: BreachScanJobHandler,
    @Inject(TriggerQualificationJobHandler)
    private readonly triggerQualificationHandler: TriggerQualificationJobHandler,
    @Inject(ReconciliationJobHandler)
    private readonly reconciliationHandler: ReconciliationJobHandler,
    @Inject(NotificationDispatchJobHandler)
    private readonly notificationDispatchHandler: NotificationDispatchJobHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.start();

    const queueNames = [
      BreachScanJobHandler.JOB_NAME,
      TriggerQualificationJobHandler.JOB_NAME,
      ReconciliationJobHandler.JOB_NAME,
      NotificationDispatchJobHandler.JOB_NAME,
    ] as const;

    for (const queueName of queueNames) {
      await this.boss.createQueue(queueName);
    }

    await this.boss.work(
      BreachScanJobHandler.JOB_NAME,
      async (jobs: Job<object>[]) => {
        try {
          await this.breachScanHandler.handle();
        } catch (error: unknown) {
          console.error(JSON.stringify({
            level: 'error',
            message: 'pg-boss breach-scan callback failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            jobIds: jobs.map((job) => job.id),
          }));
          throw error;
        }
      },
    );

    await this.boss.work(
      TriggerQualificationJobHandler.JOB_NAME,
      async (jobs: Job<object>[]) => {
        for (const job of jobs) {
          await this.triggerQualificationHandler.handle(job.data as Parameters<TriggerQualificationJobHandler['handle']>[0]);
        }
      },
    );

    await this.boss.work(
      ReconciliationJobHandler.JOB_NAME,
      async (jobs: Job<object>[]) => {
        for (const job of jobs) {
          await this.reconciliationHandler.handle(job.data as Parameters<ReconciliationJobHandler['handle']>[0]);
        }
      },
    );

    await this.boss.work(
      NotificationDispatchJobHandler.JOB_NAME,
      async (jobs: Job<object>[]) => {
        for (const job of jobs) {
          await this.notificationDispatchHandler.handle(job.data as Parameters<NotificationDispatchJobHandler['handle']>[0]);
        }
      },
    );

    await this.boss.schedule(BreachScanJobHandler.JOB_NAME, '*/1 * * * *', {}, {
      tz: 'UTC',
    });

    console.log('Worker: pg-boss started, all job handlers registered');
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
    console.log('Worker: pg-boss stopped');
  }
}
