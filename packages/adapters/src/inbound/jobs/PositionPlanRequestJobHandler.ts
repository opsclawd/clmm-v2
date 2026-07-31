import { Inject, Injectable } from '@nestjs/common';
import { requestPositionPlan } from '@clmm/application';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PlanRepository,
  RegimePlanPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
  ResolveRegimePlanRequestConfigResult,
} from '@clmm/application';
import type { WalletId, PositionId } from '@clmm/domain';
import {
  SUPPORTED_POSITION_READ_PORT,
  TRIGGER_REPOSITORY,
  PLAN_REPOSITORY,
  REGIME_PLAN_PORT,
  EXECUTION_HISTORY_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  REGIME_PLAN_REQUEST_CONFIG,
} from './tokens.js';

export type PositionPlanRequestPayload = {
  walletId: string;
  positionId: string;
};

@Injectable()
export class PositionPlanRequestJobHandler {
  static readonly JOB_NAME = 'request-position-plan';

  constructor(
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: PlanRepository,
    @Inject(REGIME_PLAN_PORT)
    private readonly regimePlanPort: RegimePlanPort,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(REGIME_PLAN_REQUEST_CONFIG)
    private readonly config: ResolveRegimePlanRequestConfigResult,
  ) {}

  async handle(data: PositionPlanRequestPayload): Promise<void> {
    try {
      const result = await requestPositionPlan({
        walletId: data.walletId as WalletId,
        positionId: data.positionId as PositionId,
        positionReadPort: this.positionReadPort,
        triggerRepository: this.triggerRepo,
        planRepository: this.planRepo,
        regimePlanPort: this.regimePlanPort,
        executionHistoryRepository: this.historyRepo,
        config: this.config,
        clock: this.clock,
        idGenerator: this.ids,
        observability: this.observability,
      });

      if (result.status === 'error') {
        const errorMessage = `PositionPlanRequestJobHandler returned error: ${result.reason}`;
        this.observability.log('error', errorMessage, {
          walletId: data.walletId,
          positionId: data.positionId,
          reason: result.reason,
        });
        throw new Error(errorMessage);
      }

      this.observability.log(
        'info',
        `PositionPlanRequestJobHandler completed with status ${result.status}`,
        {
          walletId: data.walletId,
          positionId: data.positionId,
          status: result.status,
          ...('reason' in result ? { reason: result.reason } : {}),
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.startsWith('PositionPlanRequestJobHandler returned error:')
      ) {
        throw error;
      }
      this.observability.log(
        'error',
        `PositionPlanRequestJobHandler failed for position ${data.positionId}`,
        {
          walletId: data.walletId,
          positionId: data.positionId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }
}
