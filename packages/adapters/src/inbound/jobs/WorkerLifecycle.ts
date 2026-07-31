import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Job, PgBoss } from 'pg-boss';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { SubmittedAttemptSweepHandler } from './SubmittedAttemptSweepHandler.js';
import { PlanResultSweepHandler } from './PlanResultSweepHandler.js';
import { PositionPlanRequestJobHandler } from './PositionPlanRequestJobHandler.js';
import { BREACH_SCAN_CRON } from './breach-scan-schedule.js';
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
    @Inject(SubmittedAttemptSweepHandler)
    private readonly submittedAttemptSweepHandler: SubmittedAttemptSweepHandler,
    @Inject(PlanResultSweepHandler)
    private readonly planResultSweepHandler: PlanResultSweepHandler,
    @Inject(PositionPlanRequestJobHandler)
    private readonly positionPlanRequestHandler: PositionPlanRequestJobHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.boss.start();

    const queueNames = [
      BreachScanJobHandler.JOB_NAME,
      TriggerQualificationJobHandler.JOB_NAME,
      ReconciliationJobHandler.JOB_NAME,
      NotificationDispatchJobHandler.JOB_NAME,
      SubmittedAttemptSweepHandler.JOB_NAME,
      PlanResultSweepHandler.JOB_NAME,
      PositionPlanRequestJobHandler.JOB_NAME,
    ] as const;

    for (const queueName of queueNames) {
      await this.boss.createQueue(queueName);
    }

    await this.boss.work(BreachScanJobHandler.JOB_NAME, async (jobs: Job<object>[]) => {
      try {
        await this.breachScanHandler.handle();
      } catch (error: unknown) {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'pg-boss breach-scan callback failed',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            jobIds: jobs.map((job) => job.id),
          }),
        );
        throw error;
      }
    });

    await this.boss.work(TriggerQualificationJobHandler.JOB_NAME, async (jobs: Job<object>[]) => {
      for (const job of jobs) {
        await this.triggerQualificationHandler.handle(
          job.data as Parameters<TriggerQualificationJobHandler['handle']>[0],
        );
      }
    });

    await this.boss.work(ReconciliationJobHandler.JOB_NAME, async (jobs: Job<object>[]) => {
      for (const job of jobs) {
        await this.reconciliationHandler.handle(
          job.data as Parameters<ReconciliationJobHandler['handle']>[0],
        );
      }
    });

    await this.boss.work(NotificationDispatchJobHandler.JOB_NAME, async (jobs: Job<object>[]) => {
      for (const job of jobs) {
        await this.notificationDispatchHandler.handle(
          job.data as Parameters<NotificationDispatchJobHandler['handle']>[0],
        );
      }
    });

    await this.boss.work(SubmittedAttemptSweepHandler.JOB_NAME, async () => {
      await this.submittedAttemptSweepHandler.handle();
    });

    await this.boss.work(PlanResultSweepHandler.JOB_NAME, async () => {
      await this.planResultSweepHandler.handle();
    });

    await this.boss.work(PositionPlanRequestJobHandler.JOB_NAME, async (jobs: Job<object>[]) => {
      for (const job of jobs) {
        await this.positionPlanRequestHandler.handle(
          job.data as Parameters<PositionPlanRequestJobHandler['handle']>[0],
        );
      }
    });

    await this.boss.schedule(
      BreachScanJobHandler.JOB_NAME,
      BREACH_SCAN_CRON,
      {},
      {
        tz: 'UTC',
      },
    );

    await this.boss.schedule(
      SubmittedAttemptSweepHandler.JOB_NAME,
      '*/2 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );

    await this.boss.schedule(
      PlanResultSweepHandler.JOB_NAME,
      '*/5 * * * *',
      {},
      {
        tz: 'UTC',
      },
    );

    console.log('Worker: pg-boss started, all job handlers registered');
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
    console.log('Worker: pg-boss stopped');
  }
}
