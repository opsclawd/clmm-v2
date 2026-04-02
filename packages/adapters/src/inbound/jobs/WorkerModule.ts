import 'reflect-metadata';
import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { AdaptersModule } from '../../composition/AdaptersModule.js';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import { createPgBossProvider } from './PgBossProvider.js';
import { PG_BOSS } from './tokens.js';

// boundary: process.env values are untyped at runtime; validated via env schema at deploy
const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'] ?? 'postgresql://localhost/clmm';
const boss = createPgBossProvider(dbUrl);

@Module({
  imports: [AdaptersModule],
  providers: [
    {
      provide: PG_BOSS,
      useValue: async (name: string, data: unknown) => {
        await boss.send(name, data as object);
      },
    },
    BreachScanJobHandler,
    TriggerQualificationJobHandler,
    ReconciliationJobHandler,
    NotificationDispatchJobHandler,
  ],
})
export class WorkerModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly breachScanHandler: BreachScanJobHandler,
    private readonly triggerQualificationHandler: TriggerQualificationJobHandler,
    private readonly reconciliationHandler: ReconciliationJobHandler,
    private readonly notificationDispatchHandler: NotificationDispatchJobHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    await boss.start();

    // Register job handlers
    // pg-boss v12 delivers jobs as arrays; each handler processes the batch sequentially
    await boss.work(
      BreachScanJobHandler.JOB_NAME,
      async (_jobs: Job<object>[]) => this.breachScanHandler.handle(),
    );

    await boss.work(
      TriggerQualificationJobHandler.JOB_NAME,
      // boundary: pg-boss job data is untyped at runtime
      async (jobs: Job<object>[]) => {
        for (const job of jobs) {
          await this.triggerQualificationHandler.handle(job.data as Parameters<TriggerQualificationJobHandler['handle']>[0]);
        }
      },
    );

    // Reconciliation retries are configured at the queue/send level, not at the worker level.
    // When enqueuing reconciliation jobs, use SendOptions { retryLimit, retryBackoff, retryDelay }.
    await boss.work(
      ReconciliationJobHandler.JOB_NAME,
      // boundary: pg-boss job data is untyped at runtime
      async (jobs: Job<object>[]) => {
        for (const job of jobs) {
          await this.reconciliationHandler.handle(job.data as Parameters<ReconciliationJobHandler['handle']>[0]);
        }
      },
    );

    await boss.work(
      NotificationDispatchJobHandler.JOB_NAME,
      // boundary: pg-boss job data is untyped at runtime
      async (jobs: Job<object>[]) => {
        for (const job of jobs) {
          await this.notificationDispatchHandler.handle(job.data as Parameters<NotificationDispatchJobHandler['handle']>[0]);
        }
      },
    );

    // Schedule recurring breach scan every 60 seconds
    await boss.schedule(BreachScanJobHandler.JOB_NAME, '*/1 * * * *', {}, {
      tz: 'UTC',
    });

    console.log('Worker: pg-boss started, all job handlers registered');
  }

  async onModuleDestroy(): Promise<void> {
    await boss.stop();
    console.log('Worker: pg-boss stopped');
  }
}
