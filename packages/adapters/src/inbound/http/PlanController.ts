import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Inject,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type {
  PlanRepository,
  RegimePlanPort,
  SupportedPositionReadPort,
  TriggerRepository,
  ExecutionRepository,
  ExecutionPreparationPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import {
  requestPositionPlan,
  recordPlanDecision,
  createPlanExitPreview,
  approvePlanExit,
} from '@clmm/application';
import type { PlanId } from '@clmm/domain';
import type { PlanOutcome } from '@clmm/application';
import { makeWalletId, makePositionId } from '@clmm/domain';
import type { ResolveRegimePlanRequestConfigResult } from '../../composition/RegimePlanRequestConfig.js';
import {
  PLAN_REPOSITORY,
  REGIME_PLAN_PORT,
  SUPPORTED_POSITION_READ_PORT,
  TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_PREPARATION_PORT,
  EXECUTION_HISTORY_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  REGIME_PLAN_REQUEST_CONFIG,
} from './tokens.js';

type PlanRequestResponse =
  | {
      status: 'ok';
      conflict: false;
      plan: import('@clmm/application').RegimePlanResponse;
      fingerprint: string;
    }
  | {
      status: 'ok';
      conflict: false;
      reason: 'exact-replay';
      plan: import('@clmm/application').RegimePlanResponse;
      fingerprint: string;
    }
  | {
      status: 'ok';
      conflict: true;
      reason: 'exact-replay';
    }
  | {
      status: 'conflict';
      conflict?: never;
      priorPlanId: string;
      newFingerprint: string;
    }
  | {
      status: 'unavailable';
      conflict?: never;
      reason:
        | 'position-not-found'
        | 'ownership-mismatch'
        | 'portfolio-unavailable'
        | 'config-unavailable';
    }
  | {
      status: 'stale';
      conflict?: never;
      reason: 'position-stale';
    }
  | {
      status: 'degraded';
      conflict?: never;
      reason: string;
    }
  | {
      status: 'superseded';
      conflict?: never;
      breachDirection: { kind: 'lower-bound-breach' } | { kind: 'upper-bound-breach' };
    }
  | {
      status: 'error';
      conflict?: never;
      reason: string;
    };

type CurrentPlanResponse = {
  planId: string;
  canonicalHash: string;
  positionId: string;
  state: import('@clmm/domain').PlanLifecycleState;
} | null;

type DecisionResponse =
  | {
      kind: 'recorded';
      resultId: string;
    }
  | {
      kind: 'not-found';
    }
  | {
      kind: 'conflict-detected';
    }
  | {
      kind: 'breach-supersedes';
      breachDirection: { kind: 'lower-bound-breach' } | { kind: 'upper-bound-breach' };
    }
  | {
      kind: 'error';
      reason: string;
    };

type PreviewResponse = {
  previewId: string;
  plan: import('@clmm/domain').ExecutionPlan;
  preview: import('@clmm/domain').ExecutionPreview;
  executionOrigin: import('@clmm/domain').ExecutionOrigin;
};

type ApproveResponse = {
  attemptId: string;
  lifecycleState: { kind: 'awaiting-signature' };
  executionOrigin: import('@clmm/domain').ExecutionOrigin;
};

@Controller('plans')
export class PlanController {
  constructor(
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: PlanRepository,
    @Inject(REGIME_PLAN_PORT)
    private readonly regimePlanPort: RegimePlanPort,
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_PREPARATION_PORT)
    private readonly prepPort: ExecutionPreparationPort,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(REGIME_PLAN_REQUEST_CONFIG)
    private readonly config: ResolveRegimePlanRequestConfigResult,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
  ) {}

  @Post(':walletId/:positionId/request')
  async requestPlan(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
  ): Promise<PlanRequestResponse> {
    const wallet = makeWalletId(walletId);
    const position = makePositionId(positionId);

    const result = await requestPositionPlan({
      walletId: wallet,
      positionId: position,
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

    if (result.status === 'unavailable' && result.reason === 'ownership-mismatch') {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    if (result.status === 'unavailable' && result.reason === 'position-not-found') {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    if (result.status === 'conflict') {
      throw new HttpException(result, HttpStatus.CONFLICT);
    }

    return result;
  }

  @Get(':walletId/:positionId/current')
  async getCurrentPlan(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
  ): Promise<CurrentPlanResponse> {
    const wallet = makeWalletId(walletId);
    const position = makePositionId(positionId);

    const positionExists = await this.positionReadPort.getPosition(wallet, position);
    if (!positionExists) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    const plan = await this.planRepo.getCurrentPlan(position);

    if (!plan) {
      return null;
    }

    if (plan.positionId !== position) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    return {
      planId: plan.planId,
      canonicalHash: plan.canonicalHash,
      positionId: plan.positionId,
      state: plan.state,
    };
  }

  @Post(':walletId/:positionId/:planId/decision')
  async recordDecision(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
    @Param('planId') planId: string,
    @Body()
    body: {
      decision:
        | 'acknowledged'
        | 'stand-down'
        | 'executed'
        | 'rejected'
        | 'expired'
        | 'position-changed'
        | 'failed';
    },
  ): Promise<DecisionResponse> {
    const wallet = makeWalletId(walletId);
    const position = makePositionId(positionId);
    const plan = planId as PlanId;

    const positionExists = await this.positionReadPort.getPosition(wallet, position);
    if (!positionExists) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    function parseDecision(kind: string): PlanOutcome {
      const outcomes = {
        acknowledged: { kind: 'acknowledged' as const },
        'stand-down': { kind: 'stand-down' as const },
        executed: { kind: 'executed' as const },
        rejected: { kind: 'rejected' as const },
        expired: { kind: 'expired' as const },
        'position-changed': { kind: 'position-changed' as const },
        failed: { kind: 'failed' as const },
      };
      const outcome = outcomes[kind as keyof typeof outcomes];
      if (outcome === undefined) {
        throw new ConflictException(`Invalid decision: ${kind}`);
      }
      return outcome;
    }

    const decision = parseDecision(body.decision);

    const result = await recordPlanDecision({
      planId: plan,
      positionId: position,
      walletId: wallet,
      decision,
      planRepository: this.planRepo,
      triggerRepository: this.triggerRepo,
      clock: this.clock,
      observability: this.observability,
    });

    if (result.kind === 'not-found') {
      throw new NotFoundException(`Plan not found: ${planId}`);
    }

    if (result.kind === 'conflict-detected') {
      throw new ConflictException(`Conflicting decision for plan: ${planId}`);
    }

    return result;
  }

  @Post(':walletId/:positionId/:planId/preview')
  async createPreview(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
    @Param('planId') planId: string,
  ): Promise<PreviewResponse> {
    const wallet = makeWalletId(walletId);
    const position = makePositionId(positionId);
    const plan = planId as PlanId;

    const positionExists = await this.positionReadPort.getPosition(wallet, position);
    if (!positionExists) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    try {
      const result = await createPlanExitPreview({
        planId: plan,
        positionId: position,
        walletId: wallet,
        planRepo: this.planRepo,
        positionRepo: this.positionReadPort,
        executionRepo: this.executionRepo,
        prepPort: this.prepPort,
        historyRepo: this.historyRepo,
        clock: this.clock,
        ids: this.ids,
      });

      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('not current')) {
          throw new NotFoundException(`Plan not found: ${planId}`);
        }
        if (error.message.includes('not eligible')) {
          throw new ConflictException(`Plan not eligible for preview: ${error.message}`);
        }
      }
      throw error;
    }
  }

  @Post(':walletId/:positionId/:planId/approve')
  async approvePlan(
    @Param('walletId') walletId: string,
    @Param('positionId') positionId: string,
    @Param('planId') planId: string,
    @Body() body: { previewId: string },
  ): Promise<ApproveResponse> {
    const wallet = makeWalletId(walletId);
    const position = makePositionId(positionId);
    const plan = planId as PlanId;

    const positionExists = await this.positionReadPort.getPosition(wallet, position);
    if (!positionExists) {
      throw new NotFoundException(`Position not found: ${positionId}`);
    }

    try {
      const result = await approvePlanExit({
        previewId: body.previewId,
        planId: plan,
        positionId: position,
        walletId: wallet,
        planRepo: this.planRepo,
        executionRepo: this.executionRepo,
        prepPort: this.prepPort,
        historyRepo: this.historyRepo,
        clock: this.clock,
        ids: this.ids,
      });

      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new NotFoundException(`Plan or preview not found`);
        }
        if (error.message.includes('already linked')) {
          throw new ConflictException(`Plan already linked to an attempt`);
        }
        if (error.message.includes('not eligible')) {
          throw new ConflictException(`Plan not eligible for approval`);
        }
      }
      throw error;
    }
  }
}
