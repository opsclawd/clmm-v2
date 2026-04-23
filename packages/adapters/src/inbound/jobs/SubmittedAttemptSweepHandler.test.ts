import { describe, expect, it } from 'vitest';
import { SubmittedAttemptSweepHandler } from './SubmittedAttemptSweepHandler.js';
import { FakeExecutionRepository, FIXTURE_POSITION_ID } from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';
import type { ExecutionRepository, ObservabilityPort } from '@clmm/application';
import type { PgBoss } from 'pg-boss';

class FakeObservabilityPort {
  logs: Array<{ level: string; message: string; context?: Record<string, unknown> | undefined }> = [];

  log(level: string, message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level, message, ...(context !== undefined ? { context } : {}) });
  }

  recordTiming(): void {}
  recordDetectionTiming(): void {}
  recordDeliveryTiming(): void {}
}

class FakePgBoss {
  sentJobs: Array<{ name: string; data: unknown }> = [];
  shouldThrow = false;

  async send(name: string, data: object): Promise<string> {
    if (this.shouldThrow) {
      throw new Error('pg-boss send failed');
    }
    this.sentJobs.push({ name, data });
    return 'job-id';
  }
}

function asExecutionRepository(repo: FakeExecutionRepository): ExecutionRepository {
  return repo as unknown as ExecutionRepository;
}

function asPgBoss(boss: FakePgBoss): PgBoss {
  return boss as unknown as PgBoss;
}

describe('SubmittedAttemptSweepHandler', () => {
  it('enqueues reconciliation for submitted attempts', async () => {
    const executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    const boss = new FakePgBoss();
    const observability = new FakeObservabilityPort();

    const handler = new SubmittedAttemptSweepHandler(
      asExecutionRepository(executionRepo),
      observability as ObservabilityPort,
      asPgBoss(boss),
    );

    await handler.handle();

    expect(boss.sentJobs).toHaveLength(1);
    expect(boss.sentJobs[0]!.name).toBe('reconcile-execution');
    expect(boss.sentJobs[0]!.data).toEqual({ attemptId: 'attempt-1' });
  });

  it('does nothing when there are no submitted attempts', async () => {
    const executionRepo = new FakeExecutionRepository();
    const boss = new FakePgBoss();
    const observability = new FakeObservabilityPort();

    const handler = new SubmittedAttemptSweepHandler(
      asExecutionRepository(executionRepo),
      observability as ObservabilityPort,
      asPgBoss(boss),
    );

    await handler.handle();

    expect(boss.sentJobs).toHaveLength(0);
  });

  it('continues when individual enqueue calls fail', async () => {
    const executionRepo = new FakeExecutionRepository();
    await executionRepo.saveAttempt({
      attemptId: 'attempt-1',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });
    await executionRepo.saveAttempt({
      attemptId: 'attempt-2',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    const boss = new FakePgBoss();
    let sendCount = 0;
    boss.send = async (name: string, data: object): Promise<string> => {
      sendCount++;
      if (sendCount === 1) throw new Error('transient failure');
      boss.sentJobs.push({ name, data });
      return 'job-id';
    };

    const observability = new FakeObservabilityPort();

    const handler = new SubmittedAttemptSweepHandler(
      asExecutionRepository(executionRepo),
      observability as ObservabilityPort,
      asPgBoss(boss),
    );

    await handler.handle();

    expect(boss.sentJobs).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const errorLog = expect.objectContaining({ level: 'error', message: expect.stringContaining('attempt-1') });
    expect(observability.logs).toContainEqual(errorLog);
  });
});