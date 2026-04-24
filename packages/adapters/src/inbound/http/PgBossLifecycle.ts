import { Injectable, Inject, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PgBoss } from 'pg-boss';
import type { ObservabilityPort } from '@clmm/application';
import { ReconciliationJobHandler } from '../jobs/ReconciliationJobHandler.js';
import { PG_BOSS_INSTANCE, OBSERVABILITY_PORT } from './tokens.js';

@Injectable()
export class PgBossLifecycle implements OnModuleInit, OnModuleDestroy {
  private startPromise: Promise<void> | null = null;

  constructor(
    @Inject(PG_BOSS_INSTANCE)
    private readonly boss: PgBoss,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
  ) {}

  async onModuleInit(): Promise<void> {
    this.startPromise = this.boss.start()
      .then(async () => {
        await this.boss.createQueue(ReconciliationJobHandler.JOB_NAME);
      })
      .catch((error: unknown) => {
        this.observability.log('warn', 'pg-boss startup failed; BFF will serve HTTP but enqueue will fail until restart. Sweep job on worker catches orphans.', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.startPromise) {
      await this.startPromise.catch(() => {});
    }
    await this.boss.stop().catch(() => {});
  }
}