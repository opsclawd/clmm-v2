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
import type { ExecutionHistoryRepository, ExecutionRepository, ExecutionSubmissionPort } from '@clmm/application';
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

  it('derives execution direction and posture from authoritative history in GET /executions/:attemptId', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-upper',
      positionId: FIXTURE_POSITION_ID,
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

    expect(result.execution.breachDirection).toEqual(UPPER_BOUND_BREACH);
    expect(result.execution.postExitPosture).toEqual({ kind: 'exit-to-sol' });
  });

  it('fails explicitly when GET /executions/:attemptId has no authoritative direction', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-no-direction',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(controller.getExecution('attempt-no-direction')).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the provided signedPayload during submit and reconciles with the resolved direction', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-submit',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const signedPayload = Buffer.from([1, 2, 3, 4]).toString('base64');
    const result = await controller.submitExecution('attempt-submit', {
      signedPayload,
      breachDirection: 'upper-bound-breach',
    });

    expect(result.result).toBe('confirmed');
    expect(submissionPort.submittedPayloads).toHaveLength(1);
    expect(Array.from(submissionPort.submittedPayloads[0] ?? [])).toEqual([1, 2, 3, 4]);
    expect(submissionPort.reconcileCalls).toEqual([[{ signature: 'sig-submit-1', stepKind: 'swap-assets' }]]);

    const storedAttempt = await executionRepo.getAttempt('attempt-submit');
    expect(storedAttempt?.transactionReferences).toEqual([{ signature: 'sig-submit-1', stepKind: 'swap-assets' }]);

    const submittedEvent = historyRepo.events.find((event) => event.eventType === 'submitted');
    expect(submittedEvent?.breachDirection).toEqual(UPPER_BOUND_BREACH);
  });

  it('rejects submit when caller direction conflicts with authoritative history', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-mismatch',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await historyRepo.appendEvent({
      eventId: 'evt-mismatch',
      positionId: FIXTURE_POSITION_ID,
      eventType: 'signature-requested',
      breachDirection: UPPER_BOUND_BREACH,
      occurredAt: makeClockTimestamp(1_000_000),
      lifecycleState: { kind: 'awaiting-signature' },
    });

    await expect(
      controller.submitExecution('attempt-mismatch', {
        signedPayload: Buffer.from([9]).toString('base64'),
        breachDirection: 'lower-bound-breach',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects missing direction in submit when no authoritative history exists', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-missing-submit-direction',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.submitExecution('attempt-missing-submit-direction', {
        signedPayload: Buffer.from([7]).toString('base64'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing direction in abandon when no authoritative history exists', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-missing-abandon-direction',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.abandonExecution('attempt-missing-abandon-direction', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses authoritative history direction during abandon without defaulting lower-bound', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-abandon-history',
      positionId: FIXTURE_POSITION_ID,
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
    expect(historyRepo.events.at(-1)?.breachDirection).toEqual(UPPER_BOUND_BREACH);
  });

  it('rejects malformed base64 submit payloads explicitly', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-bad-payload',
      positionId: FIXTURE_POSITION_ID,
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
