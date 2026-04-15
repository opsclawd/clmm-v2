import { describe, it, expect, vi } from 'vitest';
import { submitExecutionAttempt } from './SubmitExecutionAttempt.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { StoredExecutionAttempt } from '../../ports/index.js';

describe('SubmitExecutionAttempt', () => {
  it('returns expired when the signing window has elapsed before submission', async () => {
    const clock = new FakeClockPort(makeClockTimestamp(1_060_001));
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();
    const submitSpy = vi.spyOn(submissionPort, 'submitExecution');

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-1',
      attemptId: 'attempt-1',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-1',
      signedPayload: new Uint8Array([1, 2, 3]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({
      kind: 'expired',
      currentState: 'expired',
    });
    expect(submitSpy).not.toHaveBeenCalled();
    expect((await executionRepo.getAttempt('attempt-1'))?.lifecycleState).toEqual({ kind: 'expired' });
    expect(historyRepo.events).toContainEqual(
      expect.objectContaining({
        eventType: 'preview-expired',
        lifecycleState: { kind: 'expired' },
      }),
    );
  });

  it('submits signed payload when the signing window is still valid', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-1',
      attemptId: 'attempt-1',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const signedPayload = new Uint8Array([1, 2, 3]);

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-1',
      signedPayload,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('submitted');
    if (result.kind === 'submitted') {
      expect(result.references.length).toBeGreaterThan(0);
    }

    const stored = await executionRepo.getAttempt('attempt-1');
    expect(stored?.lifecycleState.kind).toBe('submitted');
    expect(stored?.transactionReferences).toEqual(
      result.kind === 'submitted' ? result.references : [],
    );
  });

  it('treats payload as expired when clock.now() equals expiresAt (boundary case)', async () => {
    const clock = new FakeClockPort(makeClockTimestamp(1_060_000));
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();
    const submitSpy = vi.spyOn(submissionPort, 'submitExecution');

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-at-boundary',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);
    await executionRepo.savePreparedPayload({
      payloadId: 'payload-at-boundary',
      attemptId: 'attempt-at-boundary',
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: makeClockTimestamp(1_060_000),
      createdAt: makeClockTimestamp(1_000_000),
    });

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-at-boundary',
      signedPayload: new Uint8Array([1, 2, 3]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({
      kind: 'expired',
      currentState: 'expired',
    });
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('preserves legacy submission behavior when no prepared payload is stored', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-1',
      signedPayload: new Uint8Array([1, 2, 3]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('submitted');
    const stored = await executionRepo.getAttempt('attempt-1');
    expect(stored?.lifecycleState.kind).toBe('submitted');
    expect(stored?.transactionReferences).toEqual(
      result.kind === 'submitted' ? result.references : [],
    );
  });

  it('returns not-found when attempt does not exist', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    const result = await submitExecutionAttempt({
      attemptId: 'nonexistent',
      signedPayload: new Uint8Array([1]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns invalid-state when attempt is not awaiting-signature', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await submitExecutionAttempt({
      attemptId: 'attempt-1',
      signedPayload: new Uint8Array([1]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('invalid-state');
  });

  it('passes planned step kinds from preview to submitExecution', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();
    const submitSpy = vi.spyOn(submissionPort, 'submitExecution');

    const { previewId } = await executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        plan: {
          steps: [
            { kind: 'remove-liquidity' },
            { kind: 'collect-fees' },
            { kind: 'swap-assets', instruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: 'test' } },
          ],
          postExitPosture: { kind: 'exit-to-usdc' },
          swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: 'test' },
        },
        freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
        estimatedAt: Date.now(),
      },
      LOWER_BOUND_BREACH,
    );

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-with-preview',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
      previewId,
    };
    await executionRepo.saveAttempt(attempt);

    await submitExecutionAttempt({
      attemptId: 'attempt-with-preview',
      signedPayload: new Uint8Array([1, 2, 3]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(submitSpy).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      ['remove-liquidity', 'collect-fees', 'swap-assets'],
    );
  });

  it('falls back to swap-assets when attempt has no previewId', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();
    const submitSpy = vi.spyOn(submissionPort, 'submitExecution');

    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-no-preview',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    await submitExecutionAttempt({
      attemptId: 'attempt-no-preview',
      signedPayload: new Uint8Array([1, 2, 3]),
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(submitSpy).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      ['swap-assets'],
    );
  });
});
