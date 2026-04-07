import { describe, it, expect, beforeEach, vi } from 'vitest';
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
      breachDirection: LOWER_BOUND_BREACH,
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
    expect((await executionRepo.getAttempt('attempt-1'))?.completedSteps).toEqual(['remove-liquidity']);
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

  it('returns stored confirmed state without calling the submission port again', async () => {
    const reconcileSpy = vi.spyOn(submissionPort, 'reconcileExecution');

    await executionRepo.saveAttempt({
      attemptId: 'attempt-confirmed',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'confirmed' },
      completedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'],
      transactionReferences: [{ signature: 'sig-confirmed', stepKind: 'swap-assets' }],
    });

    const result = await reconcileExecutionAttempt({
      attemptId: 'attempt-confirmed',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({ kind: 'confirmed' });
    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it('returns stored partial state with completed steps without calling the submission port again', async () => {
    const reconcileSpy = vi.spyOn(submissionPort, 'reconcileExecution');

    await executionRepo.saveAttempt({
      attemptId: 'attempt-partial',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'partial' },
      completedSteps: ['remove-liquidity'],
      transactionReferences: [{ signature: 'sig-partial', stepKind: 'remove-liquidity' }],
    });

    const result = await reconcileExecutionAttempt({
      attemptId: 'attempt-partial',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({
      kind: 'partial',
      confirmedSteps: ['remove-liquidity'],
    });
    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it('returns failed when submission port reports all-failed', async () => {
    submissionPort.setConfirmedSteps([]);
    submissionPort.setAllFailed(true);
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
    expect(result.kind).toBe('failed');
  });

  it('returns null when no references confirmed and result is still unresolved', async () => {
    submissionPort.setConfirmedSteps([]);
    submissionPort.setAllFailed(false);
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
    expect(result).toBeNull();
  });

  it('short-circuits a second reconcile after persisting partial completed steps', async () => {
    const reconcileSpy = vi.spyOn(submissionPort, 'reconcileExecution');
    submissionPort.setConfirmedSteps(['remove-liquidity']);

    const firstResult = await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(firstResult).toEqual({
      kind: 'partial',
      confirmedSteps: ['remove-liquidity'],
    });
    expect(reconcileSpy).toHaveBeenCalledTimes(1);

    const secondResult = await reconcileExecutionAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });

    expect(secondResult).toEqual({
      kind: 'partial',
      confirmedSteps: ['remove-liquidity'],
    });
    expect(reconcileSpy).toHaveBeenCalledTimes(1);
  });
});
