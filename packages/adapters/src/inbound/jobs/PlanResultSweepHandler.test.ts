import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { PlanResultSweepHandler } from './PlanResultSweepHandler.js';
import type {
  PlanRepository,
  RegimePlanPort,
  ClockPort,
  ObservabilityPort,
} from '@clmm/application';

class FakeObservabilityPort {
  logs: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];

  log(level: string, message: string, context?: Record<string, unknown>): void {
    this.logs.push(context !== undefined ? { level, message, context } : { level, message });
  }

  recordTiming(): void {}
  recordDetectionTiming(): void {}
  recordDeliveryTiming(): void {}
}

class FakeClockPort {
  private _now = 1000000000000;
  now(): import('@clmm/domain').ClockTimestamp {
    return this._now as import('@clmm/domain').ClockTimestamp;
  }
}

class FakePgBoss {
  sentJobs: Array<{ name: string; data: unknown }> = [];

  async send(name: string, data: object): Promise<string> {
    this.sentJobs.push({ name, data });
    return 'job-id';
  }
}

describe('PlanResultSweepHandler', () => {
  let planRepo: PlanRepository;
  let regimePort: RegimePlanPort;
  let clock: FakeClockPort;
  let observability: FakeObservabilityPort;
  let boss: FakePgBoss;

  beforeEach(() => {
    planRepo = {
      claimDueResult: vi.fn(),
      rescheduleRetry: vi.fn(),
      completeDelivery: vi.fn(),
      recordPermanentFailure: vi.fn(),
    } as unknown as PlanRepository;

    regimePort = {
      reportExecutionResult: vi.fn(),
    } as unknown as RegimePlanPort;

    clock = new FakeClockPort();
    observability = new FakeObservabilityPort();
    boss = new FakePgBoss();
  });

  describe('job handler', () => {
    it('syncs due results when called directly', async () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      vi.mocked(planRepo.claimDueResult).mockResolvedValue(null);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const handler = new PlanResultSweepHandler(
        planRepo,
        regimePort,
        clock as ClockPort,
        observability as ObservabilityPort,
        boss as unknown as PgBoss,
      );

      await handler.handle();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.claimDueResult).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      expect(observability.logs).toContainEqual(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          message: expect.stringContaining('PlanResultSweepHandler'),
        }),
      );
    });
  });

  describe('pg-boss integration shape', () => {
    it('has correct JOB_NAME for registration', () => {
      expect(PlanResultSweepHandler.JOB_NAME).toBe('plan-result-sweep');
    });
  });
});
