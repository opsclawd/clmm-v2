import { describe, it, expect, beforeEach } from 'vitest';
import { getExecutionAttemptDetail } from '@clmm/application';
import { FakeExecutionRepository, FIXTURE_POSITION_ID } from '@clmm/testing';

describe('GetExecutionAttemptDetail', () => {
  let executionRepo: FakeExecutionRepository;

  beforeEach(async () => {
    executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: { kind: 'lower-bound-breach' },
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });
  });

  it('returns the attempt with positionId when it exists', async () => {
    const result = await getExecutionAttemptDetail({ attemptId: 'attempt-1', executionRepo });
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.attemptId).toBe('attempt-1');
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.attempt.lifecycleState.kind).toBe('submitted');
    }
  });

  it('returns not-found for unknown attemptId', async () => {
    const result = await getExecutionAttemptDetail({ attemptId: 'no-such', executionRepo });
    expect(result.kind).toBe('not-found');
  });
});
