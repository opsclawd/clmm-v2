import { describe, it, expect, beforeEach } from 'vitest';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import {
  FakeExecutionRepository,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeObservabilityPort,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

type ObservabilityLog = {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown> | undefined;
};

describe('ReconciliationJobHandler', () => {
  let executionRepo: FakeExecutionRepository;
  let submissionPort: FakeExecutionSubmissionPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let handler: ReconciliationJobHandler;

  beforeEach(() => {
    executionRepo = new FakeExecutionRepository();
    submissionPort = new FakeExecutionSubmissionPort();
    historyRepo = new FakeExecutionHistoryRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    observability = new FakeObservabilityPort();

    // Construct directly without NestJS DI
    handler = new ReconciliationJobHandler(
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
      observability,
    );
  });

  it('reconciles a submitted attempt to confirmed when all steps succeed', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [
        { signature: 'sig-1', stepKind: 'remove-liquidity' },
        { signature: 'sig-2', stepKind: 'collect-fees' },
        { signature: 'sig-3', stepKind: 'swap-assets' },
      ],
    });

    submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);

    await handler.handle({ attemptId: 'attempt-1' });

    const updated = await executionRepo.getAttempt('attempt-1');
    expect(updated?.lifecycleState.kind).toBe('confirmed');

    // Verify observability logged the result
    const infoLog = observability.logs.find(
      (l: ObservabilityLog) => l.level === 'info' && l.message.includes('Reconciliation result'),
    );
    expect(infoLog).toBeDefined();
    expect(infoLog?.context?.['result']).toBe('confirmed');
  });

  it('skips reconciliation for non-submitted attempt (already confirmed)', async () => {
    await executionRepo.saveAttempt({
      attemptId: 'attempt-2',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'confirmed' },
      completedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'],
      transactionReferences: [
        { signature: 'sig-1', stepKind: 'remove-liquidity' },
      ],
    });

    await handler.handle({ attemptId: 'attempt-2' });

    // State should remain confirmed (unchanged)
    const updated = await executionRepo.getAttempt('attempt-2');
    expect(updated?.lifecycleState.kind).toBe('confirmed');

    // Should have logged a warning about not being in submitted state
    const warnLog = observability.logs.find(
      (l: ObservabilityLog) => l.level === 'warn' && l.message.includes('not in submitted state'),
    );
    expect(warnLog).toBeDefined();

    // Should NOT have logged a reconciliation result (use case was never called)
    const infoLog = observability.logs.find(
      (l: ObservabilityLog) => l.level === 'info' && l.message.includes('Reconciliation result'),
    );
    expect(infoLog).toBeUndefined();
  });

  it('logs warning and returns when attempt not found', async () => {
    await handler.handle({ attemptId: 'nonexistent' });

    const warnLog = observability.logs.find(
      (l: ObservabilityLog) => l.level === 'warn' && l.message.includes('attempt not found'),
    );
    expect(warnLog).toBeDefined();
  });
});
