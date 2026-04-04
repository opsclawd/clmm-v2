import { describe, it, expect, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ExecutionController } from './ExecutionController.js';
import {
  FakeClockPort,
  FakeExecutionHistoryRepository,
  FakeExecutionRepository,
  FakeIdGeneratorPort,
  FIXTURE_FRESH_PREVIEW,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import {
  buildExecutionPlan,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  makeClockTimestamp,
} from '@clmm/domain';
import type { HistoryEvent } from '@clmm/domain';
import type {
  ExecutionHistoryRepository,
  ExecutionPreparationPort,
  ExecutionRepository,
  ExecutionSubmissionPort,
  StoredExecutionAttempt,
} from '@clmm/application';
import type {
  ClockTimestamp,
  ExecutionLifecycleState,
  ExecutionPlan,
  ExecutionStep,
  PositionId,
  TransactionReference,
  WalletId,
} from '@clmm/domain';

class RecordingPreparationPort implements ExecutionPreparationPort {
  calls: Array<{ plan: ExecutionPlan; walletId: WalletId; positionId: PositionId }> = [];
  serializedPayload = new Uint8Array([5, 4, 3]);
  preparedAt = makeClockTimestamp(1_001_000);

  async prepareExecution(params: {
    plan: ExecutionPlan;
    walletId: WalletId;
    positionId: PositionId;
  }): Promise<{ serializedPayload: Uint8Array; preparedAt: ClockTimestamp }> {
    this.calls.push(params);
    return {
      serializedPayload: Uint8Array.from(this.serializedPayload),
      preparedAt: this.preparedAt,
    };
  }
}

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
  let clock: FakeClockPort;
  let executionRepo: FakeExecutionRepository;
  let historyRepo: FakeExecutionHistoryRepository;
  let preparationPort: RecordingPreparationPort;
  let submissionPort: RecordingSubmissionPort;
  let ids: FakeIdGeneratorPort;
  let controller: ExecutionController;

  async function saveAttempt(attempt: StoredExecutionAttempt) {
    await executionRepo.saveAttempt(attempt);
  }

  async function savePreview(direction = LOWER_BOUND_BREACH) {
    return executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        ...FIXTURE_FRESH_PREVIEW,
        plan: buildExecutionPlan(direction),
      },
      direction,
    );
  }

  beforeEach(() => {
    clock = new FakeClockPort();
    executionRepo = new FakeExecutionRepository();
    historyRepo = new FakeExecutionHistoryRepository();
    preparationPort = new RecordingPreparationPort();
    submissionPort = new RecordingSubmissionPort();
    ids = new FakeIdGeneratorPort('exec-http');
    controller = new ExecutionController(
      executionRepo as unknown as ExecutionRepository,
      historyRepo as unknown as ExecutionHistoryRepository,
      preparationPort,
      submissionPort,
      clock,
      ids,
    );
  });

  it('returns approval data and stores previewId on the attempt created by approve', async () => {
    const { previewId } = await savePreview(LOWER_BOUND_BREACH);

    const result = await controller.approveExecution({
      previewId,
      episodeId: 'episode-approve-1',
      walletId: FIXTURE_WALLET_ID,
    });

    expect(result.approval).toEqual({
      attemptId: result.approval.attemptId,
      lifecycleState: { kind: 'awaiting-signature' },
      breachDirection: LOWER_BOUND_BREACH,
    });
    const storedAttempt = await executionRepo.getAttempt(result.approval.attemptId);
    expect(storedAttempt?.previewId).toBe(previewId);
    expect(storedAttempt?.episodeId).toBe('episode-approve-1');
  });

  it('maps trigger-derived approvals without episodeId to 400', async () => {
    const { previewId } = await savePreview(LOWER_BOUND_BREACH);

    await expect(
      controller.approveExecution({
        previewId,
        walletId: FIXTURE_WALLET_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps missing preview approval attempts to 404', async () => {
    await expect(
      controller.approveExecution({
        previewId: 'missing-preview',
        episodeId: 'episode-missing-preview',
        walletId: FIXTURE_WALLET_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps stale preview approval attempts to 400', async () => {
    const { previewId } = await savePreview(LOWER_BOUND_BREACH);
    const storedPreview = executionRepo.previews.get(previewId);
    if (!storedPreview) {
      throw new Error('Expected preview fixture to exist');
    }

    executionRepo.previews.set(previewId, {
      ...storedPreview,
      preview: {
        ...storedPreview.preview,
        freshness: { kind: 'stale' },
      },
    });

    await expect(
      controller.approveExecution({
        previewId,
        episodeId: 'episode-stale-preview',
        walletId: FIXTURE_WALLET_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the signing payload for awaiting-signature attempts', async () => {
    await saveAttempt({
      attemptId: 'attempt-signing-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-signing-payload',
      attemptId: 'attempt-signing-payload',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await controller.getSigningPayload('attempt-signing-payload');

    expect(result).toEqual({
      signingPayload: {
        attemptId: 'attempt-signing-payload',
        serializedPayload: Buffer.from([9, 8, 7]).toString('base64'),
        lifecycleState: { kind: 'awaiting-signature' },
        signingExpiresAt: makeClockTimestamp(1_060_000),
      },
    });
  });

  it('maps signing payload retrieval failures to controller exceptions', async () => {
    await saveAttempt({
      attemptId: 'attempt-not-signable',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });
    await saveAttempt({
      attemptId: 'attempt-missing-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await saveAttempt({
      attemptId: 'attempt-expired-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-expired',
      attemptId: 'attempt-expired-payload',
      unsignedPayload: new Uint8Array([1, 2, 3]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_000_000),
      createdAt: makeClockTimestamp(900_000),
    });
    clock.set(1_000_001);

    await expect(controller.getSigningPayload('missing-attempt')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.getSigningPayload('attempt-not-signable')).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.getSigningPayload('attempt-missing-payload')).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.getSigningPayload('attempt-expired-payload')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns wallet-scoped execution history', async () => {
    historyRepo.assignWalletToPosition(FIXTURE_WALLET_ID, FIXTURE_POSITION_ID);
    await historyRepo.appendEvent({
      eventId: 'evt-wallet-history',
      positionId: FIXTURE_POSITION_ID,
      eventType: 'submitted',
      breachDirection: LOWER_BOUND_BREACH,
      occurredAt: makeClockTimestamp(1_000_000),
      lifecycleState: { kind: 'submitted' },
      transactionReference: { signature: 'sig-wallet-history', stepKind: 'swap-assets' },
    });

    const result = await controller.getWalletHistory(FIXTURE_WALLET_ID);

    expect(result).toEqual({
      history: [
        {
          eventId: 'evt-wallet-history',
          positionId: FIXTURE_POSITION_ID,
          eventType: 'submitted',
          breachDirection: LOWER_BOUND_BREACH,
          occurredAt: makeClockTimestamp(1_000_000),
          transactionReference: { signature: 'sig-wallet-history', stepKind: 'swap-assets' },
          note: 'off-chain operational history — not an on-chain receipt or attestation',
        },
      ],
    });
  });

  it('records signature decline and reports the new state', async () => {
    await saveAttempt({
      attemptId: 'attempt-decline',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await controller.declineSignature('attempt-decline');

    expect(result).toEqual({ declined: true, state: 'declined' });
    expect((await executionRepo.getAttempt('attempt-decline'))?.lifecycleState).toEqual({
      kind: 'abandoned',
    });
    expect(historyRepo.events.at(-1)?.eventType).toBe('signature-declined');
  });

  it('maps decline-signature failures to controller exceptions', async () => {
    await saveAttempt({
      attemptId: 'attempt-decline-terminal',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(controller.declineSignature('attempt-decline-missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.declineSignature('attempt-decline-terminal')).rejects.toBeInstanceOf(ConflictException);
  });

  it('records signature interruption and reports the new state', async () => {
    await saveAttempt({
      attemptId: 'attempt-interrupt',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await controller.interruptSignature('attempt-interrupt');

    expect(result).toEqual({ interrupted: true, state: 'interrupted' });
    expect((await executionRepo.getAttempt('attempt-interrupt'))?.lifecycleState).toEqual({
      kind: 'awaiting-signature',
    });
    expect(historyRepo.events.at(-1)?.eventType).toBe('signature-interrupted');
  });

  it('maps interrupt-signature failures to controller exceptions', async () => {
    await saveAttempt({
      attemptId: 'attempt-interrupt-terminal',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(controller.interruptSignature('attempt-interrupt-missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.interruptSignature('attempt-interrupt-terminal')).rejects.toBeInstanceOf(ConflictException);
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
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-submit',
      attemptId: 'attempt-submit',
      unsignedPayload: new Uint8Array([1, 2, 3, 4]),
      payloadVersion: 'submit-version',
      expiresAt: makeClockTimestamp(1_100_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const signedPayload = Buffer.from([1, 2, 3, 4]).toString('base64');
    const result = await controller.submitExecution('attempt-submit', {
      signedPayload,
      payloadVersion: 'submit-version',
    });

    expect(result.result).toBe('confirmed');
    expect(submissionPort.submittedPayloads).toHaveLength(1);
    expect(Array.from(submissionPort.submittedPayloads[0] ?? [])).toEqual([1, 2, 3, 4]);
    expect(submissionPort.reconcileCalls).toEqual([[{ signature: 'sig-submit-1', stepKind: 'swap-assets' }]]);

    const storedAttempt = await executionRepo.getAttempt('attempt-submit');
    expect(storedAttempt?.transactionReferences).toEqual([{ signature: 'sig-submit-1', stepKind: 'swap-assets' }]);
    expect(storedAttempt?.breachDirection).toEqual(UPPER_BOUND_BREACH);

    const submittedEvent = historyRepo.events.find((event: HistoryEvent) => event.eventType === 'submitted');
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
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-mismatch',
      attemptId: 'attempt-mismatch',
      unsignedPayload: new Uint8Array([9]),
      payloadVersion: 'version-mismatch-check',
      expiresAt: makeClockTimestamp(1_100_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    await expect(
      controller.submitExecution('attempt-mismatch', {
        signedPayload: Buffer.from([9]).toString('base64'),
        payloadVersion: 'version-mismatch-check',
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

  it('rejects submit when payloadVersion does not match the stored prepared payload', async () => {
    await saveAttempt({
      attemptId: 'attempt-version-mismatch',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-1',
      attemptId: 'attempt-version-mismatch',
      unsignedPayload: new Uint8Array([1]),
      payloadVersion: 'expected-version',
      expiresAt: makeClockTimestamp(1_100_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    await expect(
      controller.submitExecution('attempt-version-mismatch', {
        signedPayload: Buffer.from([7, 8]).toString('base64'),
        payloadVersion: 'different-version',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(submissionPort.submittedPayloads).toHaveLength(0);
  });

  it('rejects submit when no prepared payload exists for the attempt', async () => {
    await saveAttempt({
      attemptId: 'attempt-missing-prepared-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.submitExecution('attempt-missing-prepared-payload', {
        signedPayload: Buffer.from([7, 8]).toString('base64'),
        payloadVersion: 'missing-prepared-version',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(submissionPort.submittedPayloads).toHaveLength(0);
  });

  it('submits without payloadVersion for the legacy awaiting-signature path', async () => {
    await saveAttempt({
      attemptId: 'attempt-legacy-submit',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await controller.submitExecution('attempt-legacy-submit', {
      signedPayload: Buffer.from([3, 2, 1]).toString('base64'),
    });

    expect(result.result).toBe('confirmed');
    expect(submissionPort.submittedPayloads).toHaveLength(1);
    expect(Array.from(submissionPort.submittedPayloads[0] ?? [])).toEqual([3, 2, 1]);
  });

  it('rejects submit with 410 when the prepared payload is expired', async () => {
    await saveAttempt({
      attemptId: 'attempt-expired-payload',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-2',
      attemptId: 'attempt-expired-payload',
      unsignedPayload: new Uint8Array([1]),
      payloadVersion: 'expired-version',
      expiresAt: makeClockTimestamp(1_000_000),
      createdAt: makeClockTimestamp(900_000),
    });
    clock.set(1_000_000);

    await expect(
      controller.submitExecution('attempt-expired-payload', {
        signedPayload: Buffer.from([9]).toString('base64'),
        payloadVersion: 'expired-version',
      }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(submissionPort.submittedPayloads).toHaveLength(0);
  });

  it('submits successfully when payloadVersion matches the stored prepared payload', async () => {
    await saveAttempt({
      attemptId: 'attempt-matching-version',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-3',
      attemptId: 'attempt-matching-version',
      unsignedPayload: new Uint8Array([1]),
      payloadVersion: 'matching-version',
      expiresAt: makeClockTimestamp(1_100_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await controller.submitExecution('attempt-matching-version', {
      signedPayload: Buffer.from([6, 5]).toString('base64'),
      payloadVersion: 'matching-version',
    });

    expect(result.result).toBe('confirmed');
    expect(submissionPort.submittedPayloads).toHaveLength(1);
    expect(Array.from(submissionPort.submittedPayloads[0] ?? [])).toEqual([6, 5]);
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
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-bad-base64',
      attemptId: 'attempt-bad-payload',
      unsignedPayload: new Uint8Array([1]),
      payloadVersion: 'bad-base64-version',
      expiresAt: makeClockTimestamp(1_100_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    await expect(
      controller.submitExecution('attempt-bad-payload', {
        signedPayload: '!!!not-base64!!!',
        payloadVersion: 'bad-base64-version',
        breachDirection: LOWER_BOUND_BREACH.kind,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects submit when request body is missing or signedPayload is not a string', async () => {
    await saveAttempt({
      attemptId: 'attempt-invalid-body',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.submitExecution('attempt-invalid-body', undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.submitExecution('attempt-invalid-body', {
        signedPayload: 42 as unknown as string,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(submissionPort.submittedPayloads).toHaveLength(0);
  });
});
