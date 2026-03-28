import { describe, it, expect, beforeEach } from 'vitest';
import { recordExecutionAbandonment } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makePositionId } from '@clmm/domain';

describe('RecordExecutionAbandonment', () => {
  let executionRepo: FakeExecutionRepository;
  let historyRepo: FakeExecutionHistoryRepository;
  const clock = new FakeClockPort();
  const ids = new FakeIdGeneratorPort('abandon');

  beforeEach(async () => {
    executionRepo = new FakeExecutionRepository();
    historyRepo = new FakeExecutionHistoryRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-abandon-1',
      positionId: FIXTURE_POSITION_ID,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
  });

  it('transitions attempt to abandoned state', async () => {
    const result = await recordExecutionAbandonment({
      attemptId: 'attempt-abandon-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('abandoned');
    const stored = await executionRepo.getAttempt('attempt-abandon-1');
    expect(stored?.lifecycleState.kind).toBe('abandoned');
  });

  it('appends an abandoned event to history', async () => {
    await recordExecutionAbandonment({
      attemptId: 'attempt-abandon-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      historyRepo,
      clock,
      ids,
    });
    expect(historyRepo.events).toHaveLength(1);
    expect(historyRepo.events[0]?.eventType).toBe('abandoned');
  });

  it('uses the stored attempt positionId for the history event after validating the caller input', async () => {
    await recordExecutionAbandonment({
      attemptId: 'attempt-abandon-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      historyRepo,
      clock,
      ids,
    });
    expect(historyRepo.events[0]?.positionId).toBe(FIXTURE_POSITION_ID);
  });

  it('returns not-found for unknown attemptId', async () => {
    const result = await recordExecutionAbandonment({
      attemptId: 'no-such',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('not-found');
  });

  it.each([
    'submitted',
    'failed',
    'expired',
    'confirmed',
    'partial',
    'abandoned',
  ] as const)('refuses to abandon an attempt in %s state', async (state) => {
    await executionRepo.updateAttemptState('attempt-abandon-1', { kind: state });
    const result = await recordExecutionAbandonment({
      attemptId: 'attempt-abandon-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('already-terminal');
    if (result.kind === 'already-terminal') {
      expect(result.state).toBe(state);
    }
    expect(historyRepo.events).toHaveLength(0);
  });

  it('fails fast when the caller positionId mismatches the stored attempt', async () => {
    await expect(
      recordExecutionAbandonment({
        attemptId: 'attempt-abandon-1',
        positionId: makePositionId('other-position'),
        breachDirection: LOWER_BOUND_BREACH,
        executionRepo,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow('positionId mismatch');
    expect(historyRepo.events).toHaveLength(0);
  });
});
