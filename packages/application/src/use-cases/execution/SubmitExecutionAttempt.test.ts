import { describe, it, expect } from 'vitest';
import { submitExecutionAttempt } from './SubmitExecutionAttempt.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '../../ports/index.js';

describe('SubmitExecutionAttempt', () => {
  it('submits signed payload and transitions to submitted', async () => {
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
});
