import { describe, it, expect } from 'vitest';
import { recordSignatureDecline } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

describe('RecordSignatureDecline', () => {
  it('transitions awaiting-signature to abandoned', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
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

    const result = await recordSignatureDecline({
      attemptId: 'attempt-1',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('declined');
    const stored = await executionRepo.getAttempt('attempt-1');
    expect(stored?.lifecycleState.kind).toBe('abandoned');
  });

  it('returns not-found for missing attempt', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
    const historyRepo = new FakeExecutionHistoryRepository();

    const result = await recordSignatureDecline({
      attemptId: 'nonexistent',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns already-terminal when not in awaiting-signature', async () => {
    const clock = new FakeClockPort();
    const ids = new FakeIdGeneratorPort();
    const executionRepo = new FakeExecutionRepository();
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

    const result = await recordSignatureDecline({
      attemptId: 'attempt-1',
      executionRepo,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('already-terminal');
  });
});
