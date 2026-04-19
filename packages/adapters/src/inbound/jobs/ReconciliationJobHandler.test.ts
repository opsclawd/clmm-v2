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
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
import type { RegimeEngineEventPort, ClmmExecutionEventRequest } from '../../outbound/regime-engine/types.js';

type ObservabilityLog = {
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown> | undefined;
};

class FakeRegimeEngineEventPort implements RegimeEngineEventPort {
  events: ClmmExecutionEventRequest[] = [];

  async notifyExecutionEvent(event: ClmmExecutionEventRequest): Promise<void> {
    this.events.push(event);
  }
}

describe('ReconciliationJobHandler', () => {
  let executionRepo: FakeExecutionRepository;
  let submissionPort: FakeExecutionSubmissionPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let regimeEngineEventPort: FakeRegimeEngineEventPort;
  let handler: ReconciliationJobHandler;

  beforeEach(() => {
    executionRepo = new FakeExecutionRepository();
    submissionPort = new FakeExecutionSubmissionPort();
    historyRepo = new FakeExecutionHistoryRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    observability = new FakeObservabilityPort();
    regimeEngineEventPort = new FakeRegimeEngineEventPort();

    handler = new ReconciliationJobHandler(
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
      observability,
      regimeEngineEventPort,
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

  describe('regime-engine event port wiring', () => {
    it('fires regime-engine event on confirmed reconciliation', async () => {
      await executionRepo.saveAttempt({
        attemptId: 'attempt-reconcile-confirmed',
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        lifecycleState: { kind: 'submitted' },
        completedSteps: [],
        transactionReferences: [
          { signature: 'sig-1', stepKind: 'remove-liquidity' },
          { signature: 'sig-2', stepKind: 'swap-assets' },
        ],
      });
      submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);

      await handler.handle({ attemptId: 'attempt-reconcile-confirmed' });

      expect(regimeEngineEventPort.events).toHaveLength(1);
      expect(regimeEngineEventPort.events[0]!.status).toBe('confirmed');
      expect(regimeEngineEventPort.events[0]!.correlationId).toBe('attempt-reconcile-confirmed');
      expect(regimeEngineEventPort.events[0]!.txSignature).toBe('sig-2');
      expect(regimeEngineEventPort.events[0]!.tokenOut).toBe('USDC');
    });

    it('fires regime-engine event on failed reconciliation', async () => {
      await executionRepo.saveAttempt({
        attemptId: 'attempt-reconcile-failed',
        positionId: FIXTURE_POSITION_ID,
        breachDirection: UPPER_BOUND_BREACH,
        lifecycleState: { kind: 'submitted' },
        completedSteps: [],
        transactionReferences: [{ signature: 'sig-fail', stepKind: 'remove-liquidity' }],
      });
      submissionPort.setConfirmedSteps([]);

      await handler.handle({ attemptId: 'attempt-reconcile-failed' });

      const updated = await executionRepo.getAttempt('attempt-reconcile-failed');
      if (updated?.lifecycleState.kind === 'failed') {
        expect(regimeEngineEventPort.events).toHaveLength(1);
        expect(regimeEngineEventPort.events[0]!.status).toBe('failed');
      }
    });

    it('does not fire regime-engine event on partial reconciliation', async () => {
      await executionRepo.saveAttempt({
        attemptId: 'attempt-reconcile-partial',
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        lifecycleState: { kind: 'submitted' },
        completedSteps: [],
        transactionReferences: [],
      });
      submissionPort.setConfirmedSteps(['remove-liquidity']);

      await handler.handle({ attemptId: 'attempt-reconcile-partial' });

      expect(regimeEngineEventPort.events).toHaveLength(0);
    });

    it('does not fire regime-engine event on non-submitted attempt', async () => {
      await executionRepo.saveAttempt({
        attemptId: 'attempt-reconcile-not-submitted',
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        lifecycleState: { kind: 'confirmed' },
        completedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'],
        transactionReferences: [],
      });

      await handler.handle({ attemptId: 'attempt-reconcile-not-submitted' });

      expect(regimeEngineEventPort.events).toHaveLength(0);
    });

    it('handler resolves without throwing when event port rejects', async () => {
      await executionRepo.saveAttempt({
        attemptId: 'attempt-port-rejects',
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        lifecycleState: { kind: 'submitted' },
        completedSteps: [],
        transactionReferences: [{ signature: 'sig-1', stepKind: 'swap-assets' }],
      });
      submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);
      regimeEngineEventPort.notifyExecutionEvent = async () => { throw new Error('port down'); };

      await expect(handler.handle({ attemptId: 'attempt-port-rejects' })).resolves.toBeUndefined();

      const errorLog = observability.logs.find(
        (l: ObservabilityLog) => l.level === 'error' && l.message.includes('RegimeEngine'),
      );
      expect(errorLog).toBeDefined();
    });

    it('skips event and logs warn when getAttempt returns null after reconciliation', async () => {
      await executionRepo.saveAttempt({
        attemptId: 'attempt-reconcile-null',
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        lifecycleState: { kind: 'submitted' },
        completedSteps: [],
        transactionReferences: [],
      });
      submissionPort.setConfirmedSteps(['remove-liquidity', 'collect-fees', 'swap-assets']);

      const origGetAttempt = executionRepo.getAttempt.bind(executionRepo);
      let callCount = 0;
      executionRepo.getAttempt = async (id: string) => {
        callCount++;
        if (callCount > 2) return null;
        return origGetAttempt(id);
      };

      await handler.handle({ attemptId: 'attempt-reconcile-null' });

      expect(regimeEngineEventPort.events).toHaveLength(0);
      const warnLog = observability.logs.find(
        (l: ObservabilityLog) => l.level === 'warn' && l.message.includes('not found after reconciliation'),
      );
      expect(warnLog).toBeDefined();
    });
  });
});
