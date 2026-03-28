import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExecutionController } from './ExecutionController.js';
import {
  FakeClockPort,
  FakeExecutionHistoryRepository,
  FakeExecutionRepository,
  FakeIdGeneratorPort,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import {
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  makeClockTimestamp,
} from '@clmm/domain';
import type {
  ExecutionHistoryRepository,
  ExecutionRepository,
  ExecutionSubmissionPort,
  StoredExecutionAttempt,
} from '@clmm/application';
import type { ClockTimestamp, ExecutionLifecycleState, ExecutionStep, TransactionReference } from '@clmm/domain';

class RecordingSubmissionPort implements ExecutionSubmissionPort {
  submittedPayloads: Uint8Array[] = [];
  reconcileCalls: TransactionReference[][] = [];
  confirmedSteps: ExecutionStep['kind'][] = ['remove-liquidity', 'collect-fees', 'swap-assets'];
  finalState: ExecutionLifecycleState | null = { kind: 'confirmed' };

  async submitExecution(signedPayload: Uint8Array): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }> {
    this.submittedPayloads.push(signedPayload);
    return {
      references: [{ signature: 'sig-submit-1', stepKind: 'swap-assets' }],
      submittedAt: makeClockTimestamp(1_234_567),
    };
  }

  async reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<ExecutionStep['kind']>;
    finalState: ExecutionLifecycleState | null;
  }> {
    this.reconcileCalls.push(references);
    return {
      confirmedSteps: this.confirmedSteps,
      finalState: this.finalState,
    };
  }
}

describe('ExecutionController', () => {
  let executionRepo: FakeExecutionRepository;
  let historyRepo: FakeExecutionHistoryRepository;
  let submissionPort: RecordingSubmissionPort;
  let controller: ExecutionController;

  async function saveAttempt(attempt: StoredExecutionAttempt) {
    await executionRepo.saveAttempt(
      attempt as Parameters<FakeExecutionRepository['saveAttempt']>[0],
    );
  }

  beforeEach(() => {
    executionRepo = new FakeExecutionRepository();
    historyRepo = new FakeExecutionHistoryRepository();
    submissionPort = new RecordingSubmissionPort();
    controller = new ExecutionController(
      executionRepo as unknown as ExecutionRepository,
      historyRepo as unknown as ExecutionHistoryRepository,
      submissionPort,
      new FakeClockPort(),
      new FakeIdGeneratorPort('exec-http'),
    );
  });

  it('uses the attempt-persisted direction for GET /executions/:attemptId even when history disagrees', async () => {
    await saveAttempt({
      attemptId: 'attempt-upper',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });
    await historyRepo.appendEvent({
      eventId: 'evt-upper',
      positionId: FIXTURE_POSITION_ID,
      eventType: 'submitted',
      breachDirection: UPPER_BOUND_BREACH,
      occurredAt: makeClockTimestamp(1_000_000),
      lifecycleState: { kind: 'submitted' },
    });

    const result = await controller.getExecution('attempt-upper');

    expect(result.execution.breachDirection).toEqual(LOWER_BOUND_BREACH);
    expect(result.execution.postExitPosture).toEqual({ kind: 'exit-to-usdc' });
  });

  it('uses the attempt-persisted direction for GET /executions/:attemptId without requiring history', async () => {
    await saveAttempt({
      attemptId: 'attempt-no-direction',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await controller.getExecution('attempt-no-direction');

    expect(result.execution.breachDirection).toEqual(UPPER_BOUND_BREACH);
    expect(result.execution.postExitPosture).toEqual({ kind: 'exit-to-sol' });
  });

  it('uses the decoded signedPayload during submit and the attempt-persisted direction as authoritative', async () => {
    await saveAttempt({
      attemptId: 'attempt-submit',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const signedPayload = Buffer.from([1, 2, 3, 4]).toString('base64');
    const result = await controller.submitExecution('attempt-submit', { signedPayload });

    expect(result.result).toBe('confirmed');
    expect(submissionPort.submittedPayloads).toHaveLength(1);
    expect(Array.from(submissionPort.submittedPayloads[0] ?? [])).toEqual([1, 2, 3, 4]);
    expect(submissionPort.reconcileCalls).toEqual([[{ signature: 'sig-submit-1', stepKind: 'swap-assets' }]]);

    const storedAttempt = await executionRepo.getAttempt('attempt-submit') as StoredExecutionAttempt | null;
    expect(storedAttempt?.transactionReferences).toEqual([{ signature: 'sig-submit-1', stepKind: 'swap-assets' }]);
    expect(storedAttempt?.breachDirection).toEqual(UPPER_BOUND_BREACH);

    const submittedEvent = historyRepo.events.find((event) => event.eventType === 'submitted');
    expect(submittedEvent?.breachDirection).toEqual(UPPER_BOUND_BREACH);
  });

  it('rejects submit when caller direction conflicts with the attempt-persisted direction', async () => {
    await saveAttempt({
      attemptId: 'attempt-mismatch',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.submitExecution('attempt-mismatch', {
        signedPayload: Buffer.from([9]).toString('base64'),
        breachDirection: 'lower-bound-breach',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the attempt-persisted direction during abandon when history is absent', async () => {
    await saveAttempt({
      attemptId: 'attempt-missing-abandon-direction',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await controller.abandonExecution('attempt-missing-abandon-direction', {});

    expect(result.abandoned).toBe(true);
    expect(historyRepo.events.at(-1)?.breachDirection).toEqual(LOWER_BOUND_BREACH);
  });

  it('uses the attempt-persisted direction during abandon even when history disagrees', async () => {
    await saveAttempt({
      attemptId: 'attempt-abandon-history',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await historyRepo.appendEvent({
      eventId: 'evt-abandon-history',
      positionId: FIXTURE_POSITION_ID,
      eventType: 'signature-requested',
      breachDirection: UPPER_BOUND_BREACH,
      occurredAt: makeClockTimestamp(1_000_001),
      lifecycleState: { kind: 'awaiting-signature' },
    });

    const result = await controller.abandonExecution('attempt-abandon-history', {});

    expect(result.abandoned).toBe(true);
    expect(historyRepo.events.at(-1)?.breachDirection).toEqual(LOWER_BOUND_BREACH);
  });

  it('rejects abandon when caller direction conflicts with the attempt-persisted direction', async () => {
    await saveAttempt({
      attemptId: 'attempt-abandon-mismatch',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.abandonExecution('attempt-abandon-mismatch', {
        breachDirection: 'lower-bound-breach',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects malformed base64 submit payloads explicitly', async () => {
    await saveAttempt({
      attemptId: 'attempt-bad-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.submitExecution('attempt-bad-payload', {
        signedPayload: '!!!not-base64!!!',
        breachDirection: LOWER_BOUND_BREACH.kind,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
