import { Controller, Get, Param, Post, Body, Inject, NotFoundException } from '@nestjs/common';
import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ExecutionSubmissionPort,
  ClockPort,
  IdGeneratorPort,
  ExecutionAttemptDto,
  HistoryEventDto,
} from '@clmm/application';
import { getExecutionAttemptDetail } from '../../../../application/src/use-cases/execution/GetExecutionAttemptDetail.js';
import { getExecutionHistory } from '../../../../application/src/use-cases/execution/GetExecutionHistory.js';
import { reconcileExecutionAttempt } from '../../../../application/src/use-cases/execution/ReconcileExecutionAttempt.js';
import { recordExecutionAbandonment } from '../../../../application/src/use-cases/execution/RecordExecutionAbandonment.js';
import type { PositionId, BreachDirection, ExecutionAttempt, HistoryEvent } from '@clmm/domain';
import { evaluateRetryEligibility } from '@clmm/domain';
import {
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_SUBMISSION_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
} from './tokens.js';

function toAttemptDto(
  attemptId: string,
  positionId: PositionId,
  attempt: ExecutionAttempt,
): ExecutionAttemptDto {
  const retry = evaluateRetryEligibility(attempt);
  return {
    attemptId,
    positionId,
    breachDirection: { kind: 'lower-bound-breach' },
    postExitPosture: { kind: 'exit-to-usdc' },
    lifecycleState: attempt.lifecycleState,
    completedStepKinds: [...attempt.completedSteps],
    transactionReferences: [...attempt.transactionReferences],
    retryEligible: retry.kind === 'eligible',
    ...(retry.kind === 'eligible' ? {} : { retryReason: retry.reason }),
  };
}

@Controller('executions')
export class ExecutionController {
  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(EXECUTION_SUBMISSION_PORT)
    private readonly submissionPort: ExecutionSubmissionPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
  ) {}

  @Get(':attemptId')
  async getExecution(@Param('attemptId') attemptId: string) {
    const result = await getExecutionAttemptDetail({ attemptId, executionRepo: this.executionRepo });
    if (result.kind === 'not-found') {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    return { execution: toAttemptDto(result.attemptId, result.positionId, result.attempt) };
  }

  @Get('history/:positionId')
  async getExecutionHistory(@Param('positionId') positionId: string) {
    const { timeline } = await getExecutionHistory({
      positionId: positionId as PositionId,
      historyRepo: this.historyRepo,
    });
    const events: HistoryEventDto[] = timeline.events.map((e: HistoryEvent) => ({
      eventId: e.eventId,
      positionId: e.positionId,
      eventType: e.eventType,
      breachDirection: e.breachDirection,
      occurredAt: e.occurredAt,
      ...(e.transactionReference ? { transactionReference: e.transactionReference } : {}),
      note: 'off-chain operational history — not an on-chain receipt or attestation',
    }));
    return { history: events };
  }

  @Post(':attemptId/submit')
  async submitExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: { signedPayload: string; breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
  ) {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);

    const breachDirection: BreachDirection = body.breachDirection === 'upper-bound-breach'
      ? { kind: 'upper-bound-breach' }
      : { kind: 'lower-bound-breach' };

    const result = await reconcileExecutionAttempt({
      attemptId,
      positionId: attempt.positionId,
      breachDirection,
      executionRepo: this.executionRepo,
      submissionPort: this.submissionPort,
      historyRepo: this.historyRepo,
      clock: this.clock,
      ids: this.ids,
    });
    return { result: result.kind };
  }

  @Post(':attemptId/abandon')
  async abandonExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: { breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
  ) {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);

    const breachDirection: BreachDirection = body?.breachDirection === 'upper-bound-breach'
      ? { kind: 'upper-bound-breach' }
      : { kind: 'lower-bound-breach' };

    const result = await recordExecutionAbandonment({
      attemptId,
      positionId: attempt.positionId,
      breachDirection,
      executionRepo: this.executionRepo,
      historyRepo: this.historyRepo,
      clock: this.clock,
      ids: this.ids,
    });
    if (result.kind === 'not-found') throw new NotFoundException(`Attempt not found: ${attemptId}`);
    return { abandoned: result.kind === 'abandoned', state: result.kind };
  }
}
