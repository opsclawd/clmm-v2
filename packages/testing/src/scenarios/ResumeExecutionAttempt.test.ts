import { describe, it, expect } from 'vitest';
import { resumeExecutionAttempt } from '@clmm/application';
import {
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

describe('ResumeExecutionAttempt', () => {
  it('returns resumable attempt when in awaiting-signature state', async () => {
    const executionRepo = new FakeExecutionRepository();
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await resumeExecutionAttempt({
      attemptId: 'attempt-1',
      executionRepo,
    });

    expect(result.kind).toBe('resumable');
    if (result.kind === 'resumable') {
      expect(result.attemptId).toBe('attempt-1');
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.breachDirection).toEqual(LOWER_BOUND_BREACH);
    }
  });

  it('returns not-found for missing attempt', async () => {
    const executionRepo = new FakeExecutionRepository();
    const result = await resumeExecutionAttempt({
      attemptId: 'nonexistent',
      executionRepo,
    });

    expect(result.kind).toBe('not-found');
  });

  it('returns not-resumable when attempt is in terminal state', async () => {
    const executionRepo = new FakeExecutionRepository();
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'confirmed' },
      completedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await resumeExecutionAttempt({
      attemptId: 'attempt-1',
      executionRepo,
    });

    expect(result.kind).toBe('not-resumable');
    if (result.kind === 'not-resumable') {
      expect(result.currentState).toBe('confirmed');
    }
  });

  it('returns submitted-pending for submitted attempt awaiting reconciliation', async () => {
    const executionRepo = new FakeExecutionRepository();
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [{ signature: 'sig-1', stepKind: 'remove-liquidity' }],
    };
    await executionRepo.saveAttempt(attempt);

    const result = await resumeExecutionAttempt({
      attemptId: 'attempt-1',
      executionRepo,
    });

    expect(result.kind).toBe('submitted-pending');
  });
});
