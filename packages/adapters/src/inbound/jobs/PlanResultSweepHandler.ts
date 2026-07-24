import { Inject, Injectable } from '@nestjs/common';
import type { PgBoss } from 'pg-boss';
import { syncPlanExecutionResults, type SyncPlanExecutionResultsDeps } from '@clmm/application';
import {
  PLAN_REPOSITORY,
  REGIME_PLAN_PORT,
  CLOCK_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS_INSTANCE,
} from './tokens.js';
import type {
  PlanRepository,
  RegimePlanPort,
  ClockPort,
  ObservabilityPort,
} from '@clmm/application';

@Injectable()
export class PlanResultSweepHandler {
  static readonly JOB_NAME = 'plan-result-sweep';

  constructor(
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: PlanRepository,
    @Inject(REGIME_PLAN_PORT)
    private readonly regimePort: RegimePlanPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(PG_BOSS_INSTANCE)
    private readonly boss: PgBoss,
  ) {}

  async handle(): Promise<void> {
    const deps: SyncPlanExecutionResultsDeps = {
      planRepository: this.planRepo,
      regimePlanPort: this.regimePort,
      clock: this.clock,
      observability: this.observability,
    };

    const result = await syncPlanExecutionResults(deps);

    this.observability.log('info', 'PlanResultSweepHandler: sync completed', {
      processed: result.processed,
      delivered: result.delivered,
      retried: result.retried,
      exhausted: result.exhausted,
      permanentlyRejected: result.permanentlyRejected,
    });
  }
}
