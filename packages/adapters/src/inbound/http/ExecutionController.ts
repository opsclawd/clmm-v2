import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ExecutionSubmissionPort,
  ClockPort,
  IdGeneratorPort,
  ExecutionAttemptDto,
  HistoryEventDto,
} from '@clmm/application';
import {
  getExecutionAttemptDetail,
  getExecutionHistory,
  recordExecutionAbandonment,
} from '@clmm/application';
import type {
  PositionId,
  BreachDirection,
  ExecutionAttempt,
  HistoryEvent,
  ExecutionLifecycleState,
  TransactionReference,
} from '@clmm/domain';
import { applyDirectionalExitPolicy, evaluateRetryEligibility } from '@clmm/domain';
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
  breachDirection: BreachDirection,
  attempt: ExecutionAttempt,
): ExecutionAttemptDto {
  const retry = evaluateRetryEligibility(attempt);
  const policy = applyDirectionalExitPolicy(breachDirection);
  return {
    attemptId,
    positionId,
    breachDirection,
    postExitPosture: policy.postExitPosture,
    lifecycleState: attempt.lifecycleState,
    completedStepKinds: [...attempt.completedSteps],
    transactionReferences: [...attempt.transactionReferences],
    retryEligible: retry.kind === 'eligible',
    ...(retry.kind === 'eligible' ? {} : { retryReason: retry.reason }),
  };
}

function parseDirectionKind(
  kind?: 'lower-bound-breach' | 'upper-bound-breach',
): BreachDirection | null {
  if (!kind) return null;
  return { kind };
}

function decodeSignedPayload(encoded: string): Uint8Array {
  if (!encoded || encoded.length === 0) {
    throw new BadRequestException('signedPayload is required');
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new BadRequestException('signedPayload must be valid base64');
  }

  const bytes = Uint8Array.from(Buffer.from(encoded, 'base64'));
  if (bytes.length === 0) {
    throw new BadRequestException('signedPayload must decode to a non-empty payload');
  }

  return bytes;
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

  private async resolveAuthoritativeDirection(params: {
    positionId: PositionId;
    fallbackDirection?: 'lower-bound-breach' | 'upper-bound-breach';
    requireHistoryDirection?: boolean;
  }): Promise<BreachDirection> {
    const timeline = await this.historyRepo.getTimeline(params.positionId);
    const timelineDirection = timeline.events.at(-1)?.breachDirection ?? null;
    const fallbackDirection = parseDirectionKind(params.fallbackDirection);

    if (timelineDirection && fallbackDirection && timelineDirection.kind !== fallbackDirection.kind) {
      throw new ConflictException(
        `breachDirection conflicts with authoritative history for position ${params.positionId}`,
      );
    }

    if (timelineDirection) {
      return timelineDirection;
    }

    if (params.requireHistoryDirection) {
      throw new ConflictException(
        `Authoritative breachDirection unavailable for position ${params.positionId}`,
      );
    }

    if (!fallbackDirection) {
      throw new BadRequestException(
        'breachDirection is required when authoritative history direction is unavailable',
      );
    }

    return fallbackDirection;
  }

  private async appendLifecycleEvent(params: {
    positionId: PositionId;
    breachDirection: BreachDirection;
    lifecycleState: ExecutionLifecycleState;
    eventType: 'submitted' | 'confirmed' | 'partial-completion' | 'failed';
    transactionReference?: TransactionReference;
  }): Promise<void> {
    await this.historyRepo.appendEvent({
      eventId: this.ids.generateId(),
      positionId: params.positionId,
      eventType: params.eventType,
      breachDirection: params.breachDirection,
      occurredAt: this.clock.now(),
      lifecycleState: params.lifecycleState,
      ...(params.transactionReference ? { transactionReference: params.transactionReference } : {}),
    });
  }

  @Get(':attemptId')
  async getExecution(@Param('attemptId') attemptId: string) {
    const result = await getExecutionAttemptDetail({ attemptId, executionRepo: this.executionRepo });
    if (result.kind === 'not-found') {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    const breachDirection = await this.resolveAuthoritativeDirection({
      positionId: result.positionId,
      requireHistoryDirection: true,
    });
    return { execution: toAttemptDto(result.attemptId, result.positionId, breachDirection, result.attempt) };
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
    if (attempt.lifecycleState.kind !== 'awaiting-signature') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot be submitted from state ${attempt.lifecycleState.kind}`,
      );
    }

    const breachDirection = await this.resolveAuthoritativeDirection({
      positionId: attempt.positionId,
      ...(body.breachDirection ? { fallbackDirection: body.breachDirection } : {}),
    });
    const signedPayload = decodeSignedPayload(body.signedPayload);
    const { references } = await this.submissionPort.submitExecution(signedPayload);

    await this.executionRepo.saveAttempt({
      ...attempt,
      attemptId,
      positionId: attempt.positionId,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: references,
    });

    await this.appendLifecycleEvent({
      positionId: attempt.positionId,
      breachDirection,
      eventType: 'submitted',
      lifecycleState: { kind: 'submitted' },
      ...(references[0] ? { transactionReference: references[0] } : {}),
    });

    const reconciliation = await this.submissionPort.reconcileExecution(references);
    if (!reconciliation.finalState) {
      return { result: 'pending' as const };
    }

    await this.executionRepo.saveAttempt({
      ...attempt,
      attemptId,
      positionId: attempt.positionId,
      lifecycleState: reconciliation.finalState,
      completedSteps: reconciliation.confirmedSteps,
      transactionReferences: references,
    });

    const eventType =
      reconciliation.finalState.kind === 'confirmed'
        ? 'confirmed'
        : reconciliation.finalState.kind === 'partial'
          ? 'partial-completion'
          : 'failed';

    await this.appendLifecycleEvent({
      positionId: attempt.positionId,
      breachDirection,
      eventType,
      lifecycleState: reconciliation.finalState,
    });

    if (reconciliation.finalState.kind === 'partial') {
      return { result: 'partial' as const, confirmedSteps: reconciliation.confirmedSteps };
    }

    return { result: reconciliation.finalState.kind === 'confirmed' ? 'confirmed' as const : 'failed' as const };
  }

  @Post(':attemptId/abandon')
  async abandonExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: { breachDirection?: 'lower-bound-breach' | 'upper-bound-breach' },
  ) {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);

    const breachDirection = await this.resolveAuthoritativeDirection({
      positionId: attempt.positionId,
      ...(body?.breachDirection ? { fallbackDirection: body.breachDirection } : {}),
    });

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
    if (result.kind === 'already-terminal') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot be abandoned from state ${result.state}`,
      );
    }
    return { abandoned: result.kind === 'abandoned', state: result.kind };
  }
}
