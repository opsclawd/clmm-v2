import { Inject, Injectable } from '@nestjs/common';
import { reconcileExecutionAttempt } from '@clmm/application';
import { applyDirectionalExitPolicy } from '@clmm/domain';
import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import type { RegimeEngineEventPort } from '../../outbound/regime-engine/types.js';
import { buildClmmExecutionEvent } from '../../outbound/regime-engine/RegimeEngineExecutionEventAdapter.js';
import {
  EXECUTION_REPOSITORY,
  EXECUTION_SUBMISSION_PORT,
  EXECUTION_HISTORY_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  REGIME_ENGINE_EVENT_PORT,
} from './tokens.js';

type ReconcilePayload = {
  attemptId: string;
};

@Injectable()
export class ReconciliationJobHandler {
  static readonly JOB_NAME = 'reconcile-execution';

  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_SUBMISSION_PORT)
    private readonly submissionPort: ExecutionSubmissionPort,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(REGIME_ENGINE_EVENT_PORT)
    private readonly regimeEngineEventPort: RegimeEngineEventPort,
  ) {}

  async handle(data: ReconcilePayload): Promise<void> {
    const attempt = await this.executionRepo.getAttempt(data.attemptId);
    if (!attempt) {
      this.observability.log('warn', `Reconciliation: attempt not found ${data.attemptId}`);
      return;
    }

    if (attempt.lifecycleState.kind !== 'submitted') {
      this.observability.log('warn', `Reconciliation: attempt ${data.attemptId} not in submitted state (${attempt.lifecycleState.kind})`);
      return;
    }

    try {
      const result = await reconcileExecutionAttempt({
        attemptId: data.attemptId,
        positionId: attempt.positionId,
        breachDirection: attempt.breachDirection,
        executionRepo: this.executionRepo,
        submissionPort: this.submissionPort,
        historyRepo: this.historyRepo,
        clock: this.clock,
        ids: this.ids,
      });

      this.observability.log('info', `Reconciliation result for ${data.attemptId}: ${result.kind}`, {
        attemptId: data.attemptId,
        result: result.kind,
      });

      if (result.kind === 'confirmed' || result.kind === 'failed') {
        try {
          const updatedAttempt = await this.executionRepo.getAttempt(data.attemptId);
          if (!updatedAttempt) {
            this.observability.log('warn', `RegimeEngine: attempt ${data.attemptId} not found after reconciliation, skipping event`, {
              attemptId: data.attemptId,
            });
          } else {
            const event = buildClmmExecutionEvent(updatedAttempt, result.kind, this.clock, applyDirectionalExitPolicy(updatedAttempt.breachDirection).swapInstruction.toAsset);
            void this.regimeEngineEventPort.notifyExecutionEvent(event);
          }
        } catch (adapterError: unknown) {
          this.observability.log('error', `RegimeEngine: failed to notify execution event for ${data.attemptId}`, {
            attemptId: data.attemptId,
            error: adapterError instanceof Error ? adapterError.message : String(adapterError),
          });
        }
      }
    } catch (error: unknown) {
      this.observability.log('error', `Reconciliation failed for ${data.attemptId}`, {
        attemptId: data.attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // pg-boss will retry (up to 5 attempts)
    }
  }
}
