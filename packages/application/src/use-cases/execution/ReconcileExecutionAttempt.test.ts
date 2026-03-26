import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileExecutionAttempt } from './ReconcileExecutionAttempt.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('ReconcileExecutionAttempt', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let executionRepo: FakeExecutionRepository;
  let submissionPort: FakeExecutionSubmissionPort;
  let historyRepo: FakeExecutionHistoryRepository;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    executionRepo = new FakeExecutionRepository();
    submissionPort = new FakeExecutionSubmissionPort();
    historyRepo = new FakeExecutionHistoryRepository();

    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [{ signature: 'sig-1', stepKind: 'remove-liquidity' }],
    });
  });

  it('marks attempt as confirmed when all steps reconcile', async () => {
    submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);
    const result = await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('confirmed');
  });

  it('marks as partial when some (not all) steps confirm', async () => {
    submissionPort.setConfirmedSteps(['remove-liquidity']);
    const result = await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('partial');
  });

  it('preserves directional context in history events', async () => {
    submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);
    await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    const confirmedEvent = historyRepo.events.find((e) => e.eventType === 'confirmed');
    expect(confirmedEvent?.breachDirection.kind).toBe('lower-bound-breach');
  });
});
