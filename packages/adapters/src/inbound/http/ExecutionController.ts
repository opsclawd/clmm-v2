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
  GoneException,
} from '@nestjs/common';
import type {
  ExecutionRepository,
  ExecutionHistoryRepository,
  ExecutionPreparationPort,
  ExecutionSubmissionPort,
  ClockPort,
  IdGeneratorPort,
  ExecutionAttemptDto,
  ExecutionApprovalDto,
  ExecutionSigningPayloadDto,
  HistoryEventDto,
  StoredExecutionAttempt,
} from '@clmm/application';
import {
  getAwaitingSignaturePayload,
  getExecutionHistory,
  getWalletExecutionHistory,
  recordExecutionAbandonment,
  recordSignatureDecline,
  recordSignatureInterruption,
  requestWalletSignature,
  PreviewApprovalNotAllowedError,
  PreviewNotFoundError,
} from '@clmm/application';
import type {
  PositionId,
  BreachDirection,
  ExecutionAttempt,
  HistoryEvent,
  ExecutionLifecycleState,
  ClockTimestamp,
  TransactionReference,
  WalletId,
} from '@clmm/domain';
import {
  applyDirectionalExitPolicy,
  buildExecutionPlan,
  evaluateRetryEligibility,
} from '@clmm/domain';
import {
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_PREPARATION_PORT,
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

function toHistoryEventDto(event: HistoryEvent): HistoryEventDto {
  return {
    eventId: event.eventId,
    positionId: event.positionId,
    eventType: event.eventType,
    breachDirection: event.breachDirection,
    occurredAt: event.occurredAt,
    ...(event.transactionReference ? { transactionReference: event.transactionReference } : {}),
    note: 'off-chain operational history — not an on-chain receipt or attestation',
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
    @Inject(EXECUTION_PREPARATION_PORT)
    private readonly preparationPort: ExecutionPreparationPort,
    @Inject(EXECUTION_SUBMISSION_PORT)
    private readonly submissionPort: ExecutionSubmissionPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
  ) {}

  private resolveAttemptDirection(
    attempt: StoredExecutionAttempt,
    requestDirectionKind?: 'lower-bound-breach' | 'upper-bound-breach',
  ): BreachDirection {
    const requestDirection = parseDirectionKind(requestDirectionKind);
    if (requestDirection && requestDirection.kind !== attempt.breachDirection.kind) {
      throw new ConflictException(
        `breachDirection conflicts with authoritative attempt direction for attempt ${attempt.attemptId}`,
      );
    }
    return attempt.breachDirection;
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

  @Post('approve')
  async approveExecution(
    @Body() body: {
      previewId: string;
      walletId: string;
    },
  ): Promise<{ approval: ExecutionApprovalDto }> {
    try {
      const approval = await requestWalletSignature({
        previewId: body.previewId,
        walletId: body.walletId as WalletId,
        executionRepo: this.executionRepo,
        prepPort: this.preparationPort,
        historyRepo: this.historyRepo,
        clock: this.clock,
        ids: this.ids,
      });

      return { approval };
    } catch (error) {
      if (error instanceof PreviewNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof PreviewApprovalNotAllowedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Post(':attemptId/prepare')
  async prepareExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: { walletId: string },
  ) {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    if (attempt.lifecycleState.kind !== 'awaiting-signature') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot be prepared from state ${attempt.lifecycleState.kind}`,
      );
    }
    if (!attempt.previewId) {
      throw new ConflictException(`Attempt ${attemptId} is missing previewId`);
    }

    if (!(await this.executionRepo.getPreview(attempt.previewId))) {
      throw new NotFoundException(`Preview not found: ${attempt.previewId}`);
    }

    const plan = buildExecutionPlan(attempt.breachDirection);
    const { serializedPayload, preparedAt } = await this.preparationPort.prepareExecution({
      plan,
      walletId: body.walletId as WalletId,
      positionId: attempt.positionId,
    });
    const payloadVersion = this.ids.generateId();
    const expiresAt = (preparedAt + 90_000) as ClockTimestamp;

    await this.executionRepo.savePreparedPayload({
      payloadId: this.ids.generateId(),
      attemptId,
      unsignedPayload: serializedPayload,
      payloadVersion,
      expiresAt,
      createdAt: preparedAt,
    });

    return {
      unsignedPayloadBase64: Buffer.from(serializedPayload).toString('base64'),
      payloadVersion,
      expiresAt,
      requiresSignature: true as const,
    };
  }

  @Get(':attemptId/signing-payload')
  async getSigningPayload(
    @Param('attemptId') attemptId: string,
  ): Promise<{ signingPayload: ExecutionSigningPayloadDto }> {
    const result = await getAwaitingSignaturePayload({
      attemptId,
      executionRepo: this.executionRepo,
      historyRepo: this.historyRepo,
      clock: this.clock,
      ids: this.ids,
    });

    if (result.kind === 'not-found') {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    if (result.kind === 'not-signable') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot provide a signing payload from state ${result.currentState}`,
      );
    }
    if (result.kind === 'missing-payload') {
      throw new ConflictException(`Attempt ${attemptId} is missing a prepared signing payload`);
    }
    if (result.kind === 'expired') {
      throw new ConflictException(`Signing payload expired for attempt ${attemptId}`);
    }

    return {
      signingPayload: {
        attemptId: result.attemptId,
        serializedPayload: Buffer.from(result.serializedPayload).toString('base64'),
        lifecycleState: result.lifecycleState,
        ...(result.signingExpiresAt ? { signingExpiresAt: result.signingExpiresAt } : {}),
      },
    };
  }

  @Post(':attemptId/decline-signature')
  async declineSignature(
    @Param('attemptId') attemptId: string,
  ): Promise<{ declined: true; state: string }> {
    const result = await recordSignatureDecline({
      attemptId,
      executionRepo: this.executionRepo,
      historyRepo: this.historyRepo,
      clock: this.clock,
      ids: this.ids,
    });

    if (result.kind === 'not-found') {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    if (result.kind === 'already-terminal') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot record a signature decline from state ${result.state}`,
      );
    }

    return { declined: true, state: result.kind };
  }

  @Post(':attemptId/interrupt-signature')
  async interruptSignature(
    @Param('attemptId') attemptId: string,
  ): Promise<{ interrupted: true; state: string }> {
    const result = await recordSignatureInterruption({
      attemptId,
      executionRepo: this.executionRepo,
      historyRepo: this.historyRepo,
      clock: this.clock,
      ids: this.ids,
    });

    if (result.kind === 'not-found') {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    if (result.kind === 'already-terminal') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot record a signature interruption from state ${result.state}`,
      );
    }

    return { interrupted: true, state: result.kind };
  }

  @Get(':attemptId')
  async getExecution(@Param('attemptId') attemptId: string) {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) {
      throw new NotFoundException(`Attempt not found: ${attemptId}`);
    }
    return {
      execution: toAttemptDto(
        attempt.attemptId,
        attempt.positionId,
        attempt.breachDirection,
        attempt,
      ),
    };
  }

  @Get('history/wallet/:walletId')
  async getWalletHistory(@Param('walletId') walletId: string) {
    const { history } = await getWalletExecutionHistory({
      walletId: walletId as WalletId,
      historyRepo: this.historyRepo,
    });
    return { history: history.map((event) => toHistoryEventDto(event)) };
  }

  @Get('history/:positionId')
  async getExecutionHistory(@Param('positionId') positionId: string) {
    const { timeline } = await getExecutionHistory({
      positionId: positionId as PositionId,
      historyRepo: this.historyRepo,
    });
    const events: HistoryEventDto[] = timeline.events.map((e: HistoryEvent) => toHistoryEventDto(e));
    return { history: events };
  }

  @Post(':attemptId/submit')
  async submitExecution(
    @Param('attemptId') attemptId: string,
    @Body()
    body: {
      signedPayload: string;
      payloadVersion?: string;
      breachDirection?: 'lower-bound-breach' | 'upper-bound-breach';
    },
  ) {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);
    if (attempt.lifecycleState.kind !== 'awaiting-signature') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot be submitted from state ${attempt.lifecycleState.kind}`,
      );
    }
    if (!body || typeof body.signedPayload !== 'string') {
      throw new BadRequestException('submit body must include signedPayload as a string');
    }

    const breachDirection = this.resolveAttemptDirection(attempt, body.breachDirection);
    const signedPayload = decodeSignedPayload(body.signedPayload);
    if (body.payloadVersion) {
      const preparedPayload = await this.executionRepo.getPreparedPayload(attemptId);
      if (!preparedPayload) {
        throw new ConflictException(`Attempt ${attemptId} has no prepared payload`);
      }
      if (preparedPayload.payloadVersion !== body.payloadVersion) {
        throw new ConflictException(`Attempt ${attemptId} payloadVersion does not match`);
      }
      if (preparedPayload.expiresAt <= this.clock.now()) {
        throw new GoneException(`Prepared payload expired for attempt ${attemptId}`);
      }
    }

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

    const breachDirection = this.resolveAttemptDirection(attempt, body?.breachDirection);

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
