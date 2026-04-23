import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionRepository, ObservabilityPort } from '@clmm/application';
import {
  EXECUTION_REPOSITORY,
  OBSERVABILITY_PORT,
  PG_BOSS_INSTANCE,
} from './tokens.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import type { PgBoss } from 'pg-boss';

@Injectable()
export class SubmittedAttemptSweepHandler {
  static readonly JOB_NAME = 'submitted-attempt-sweep';

  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(PG_BOSS_INSTANCE)
    private readonly boss: PgBoss,
  ) {}

  async handle(): Promise<void> {
    const submittedAttempts = await this.executionRepo.listSubmittedAttempts();

    if (submittedAttempts.length === 0) {
      return;
    }

    this.observability.log('info', `Sweep found ${submittedAttempts.length} submitted attempt(s), enqueuing reconciliation`, {
      count: submittedAttempts.length,
    });

    for (const attempt of submittedAttempts) {
      try {
        await this.boss.send(ReconciliationJobHandler.JOB_NAME, { attemptId: attempt.attemptId });
      } catch (sendError: unknown) {
        this.observability.log('error', `Sweep failed to enqueue reconciliation for ${attempt.attemptId}`, {
          attemptId: attempt.attemptId,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  }
}