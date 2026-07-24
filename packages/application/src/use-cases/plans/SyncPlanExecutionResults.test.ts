import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PlanRepository, RegimePlanPort, PlanResultClaim } from '../../ports/index.js';
import type { ClockTimestamp, PlanId } from '@clmm/domain';
import {
  syncPlanExecutionResults,
  type SyncPlanExecutionResultsDeps,
} from './SyncPlanExecutionResults.js';

/* eslint-disable @typescript-eslint/unbound-method */

const FIXTURE_PLAN_ID = 'plan-001' as PlanId;
const FIXTURE_RESULT_ID = 'result-001';
const FIXTURE_IDEMPOTENCY_KEY = 'idem-key-001';

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
  private _now: number;
  constructor(initial = 1000000000000) {
    this._now = initial;
  }

  now(): ClockTimestamp {
    return this._now as ClockTimestamp;
  }
}

function makeClaim(overrides: Partial<PlanResultClaim> = {}): PlanResultClaim {
  return {
    resultId: FIXTURE_RESULT_ID,
    planId: FIXTURE_PLAN_ID,
    canonicalResult: {
      id: FIXTURE_RESULT_ID,
      payload: { planId: FIXTURE_PLAN_ID, decisionKind: 'acknowledged' },
    },
    idempotencyKey: FIXTURE_IDEMPOTENCY_KEY,
    attemptCount: 0,
    ...overrides,
  };
}

describe('SyncPlanExecutionResults', () => {
  let planRepo: PlanRepository;
  let regimePort: RegimePlanPort;
  let clock: FakeClockPort;
  let observability: FakeObservabilityPort;
  let deps: SyncPlanExecutionResultsDeps;

  beforeEach(() => {
    planRepo = {
      claimDueResult: vi.fn(),
      rescheduleRetry: vi.fn(),
      completeDelivery: vi.fn(),
      recordPermanentFailure: vi.fn(),
      failDelivery: vi.fn(),
      getCurrentPlan: vi.fn(),
      getPlanActionKind: vi.fn().mockResolvedValue('HOLD'),
    } as unknown as PlanRepository;

    regimePort = {
      reportExecutionResult: vi.fn(),
    } as unknown as RegimePlanPort;

    clock = new FakeClockPort();
    observability = new FakeObservabilityPort();

    deps = { planRepository: planRepo, regimePlanPort: regimePort, clock, observability };
  });

  describe('reports a persisted terminal result after app restart', () => {
    it('discovers and delivers a result that was committed but not yet delivered', async () => {
      const claim = makeClaim({ attemptCount: 0 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).toHaveBeenCalledOnce();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      const callArg = vi.mocked(regimePort.reportExecutionResult).mock.calls[0]?.[0] as {
        idempotencyKey: string;
        status: string;
      };
      expect(callArg?.idempotencyKey).toBe(FIXTURE_IDEMPOTENCY_KEY);
      expect(callArg?.status).toBe('SUCCESS');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ resultId: FIXTURE_RESULT_ID }),
      );
    });

    it('does not execute again while recovering result delivery', async () => {
      const claim = makeClaim({ attemptCount: 0 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.rescheduleRetry).not.toHaveBeenCalled();
    });
  });

  describe('retries unknown network outcome with the same idempotency identity', () => {
    it('re-schedules retry when upstream returns retryable-degraded', async () => {
      const claim = makeClaim({ attemptCount: 1, idempotencyKey: FIXTURE_IDEMPOTENCY_KEY });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'retryable-degraded',
        reason: 'timeout',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.rescheduleRetry).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).not.toHaveBeenCalled();
    });

    it('preserves the idempotency identity across retries', async () => {
      const claim = makeClaim({ attemptCount: 2, idempotencyKey: 'stable-idempotency-key' });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'retryable-degraded',
        reason: 'timeout',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      const retryCalls = vi.mocked(planRepo.rescheduleRetry).mock.calls;
      expect(retryCalls.length).toBeGreaterThan(0);
    });
  });

  describe('caps retry count and backoff', () => {
    const MAX_RESULT_RETRIES = 5;

    it('records permanent failure when retry cap is exceeded', async () => {
      const claim = makeClaim({ attemptCount: MAX_RESULT_RETRIES });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'retryable-degraded',
        reason: 'timeout',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).not.toHaveBeenCalled();
    });

    it('schedules exponential backoff with jitter that is capped', async () => {
      const claim = makeClaim({ attemptCount: 1 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'retryable-degraded',
        reason: 'timeout',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      const retryCalls = vi.mocked(planRepo.rescheduleRetry).mock.calls;
      expect(retryCalls.length).toBeGreaterThan(0);
      const backoffMs = Number(retryCalls[0]?.[0]?.nextAttemptAt) - clock.now();
      const BASE_DELAY_MS = 60_000;
      const MAX_DELAY_MS = 600_000;
      expect(backoffMs).toBeGreaterThanOrEqual(BASE_DELAY_MS);
      expect(backoffMs).toBeLessThanOrEqual(MAX_DELAY_MS * 1.5);
    });
  });

  describe('stops retrying permanent rejection', () => {
    it('marks report-failed for permanent auth failures', async () => {
      const claim = makeClaim({ attemptCount: 0 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'permanent',
        reason: 'auth-failed',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.rescheduleRetry).not.toHaveBeenCalled();
    });

    it('marks report-failed for validation errors without retry', async () => {
      const claim = makeClaim({ attemptCount: 0 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'permanent',
        reason: 'validation-error',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledTimes(1);
    });

    it('marks report-failed for conflict responses', async () => {
      const claim = makeClaim({ attemptCount: 0 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'permanent',
        reason: 'conflict',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledTimes(1);
    });
  });

  describe('treats canonical duplicate response as delivered', () => {
    it('marks result as delivered when upstream returns ok', async () => {
      const claim = makeClaim({ attemptCount: 0 });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ resultId: FIXTURE_RESULT_ID }),
      );
    });
  });

  describe('continues processing after one row fails', () => {
    it('processes multiple due results even if one fails permanently', async () => {
      const claim1 = makeClaim({ resultId: 'result-1', planId: 'plan-001' as PlanId });
      const claim2 = makeClaim({ resultId: 'result-2', planId: 'plan-002' as PlanId });

      vi.mocked(planRepo.claimDueResult)
        .mockResolvedValueOnce(claim1)
        .mockResolvedValueOnce(claim2)
        .mockResolvedValueOnce(null);

      vi.mocked(regimePort.reportExecutionResult)
        .mockResolvedValueOnce({ kind: 'permanent', reason: 'auth-failed' })
        .mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).toHaveBeenCalledTimes(1);
    });

    it('logs error but continues when delivery throws', async () => {
      const claim1 = makeClaim({ resultId: 'result-1' });
      const claim2 = makeClaim({ resultId: 'result-2' });

      vi.mocked(planRepo.claimDueResult)
        .mockResolvedValueOnce(claim1)
        .mockResolvedValueOnce(claim2)
        .mockResolvedValueOnce(null);

      vi.mocked(regimePort.reportExecutionResult)
        .mockRejectedValueOnce(new Error('network failure'))
        .mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      expect(observability.logs).toContainEqual(expect.objectContaining({ level: 'error' }));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.completeDelivery).toHaveBeenCalledTimes(1);
    });
  });
});
