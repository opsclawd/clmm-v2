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

const FIXTURE_CANONICAL_HASH = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
const FIXTURE_POSITION_ID = 'pos-sol-usdc-01';

function makeClaim(overrides: Partial<PlanResultClaim> = {}): PlanResultClaim {
  return {
    resultId: FIXTURE_RESULT_ID,
    planId: FIXTURE_PLAN_ID,
    canonicalResult: {
      id: FIXTURE_RESULT_ID,
      payload: {
        planId: FIXTURE_PLAN_ID,
        canonicalHash: FIXTURE_CANONICAL_HASH,
        positionId: FIXTURE_POSITION_ID,
        decisionKind: 'acknowledged',
        completedAtUnixMs: 1700000000000,
      },
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
    it('reports a persisted terminal result with shared schemaVersion 1.0', async () => {
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
        schemaVersion: string;
      };
      expect(callArg?.idempotencyKey).toBe(FIXTURE_IDEMPOTENCY_KEY);
      expect(callArg?.status).toBe('SUCCESS');
      expect(callArg?.schemaVersion).toBe('1.0');
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

  describe('correlates execution result identity', () => {
    it('reports the persisted remote planId and planHash unchanged', async () => {
      const claim = makeClaim({
        planId: 'plan_exit_987654321' as PlanId,
        canonicalResult: {
          id: 'result-001',
          payload: {
            planId: 'plan_exit_987654321',
            canonicalHash: 'f9e8d7c6b5a40123456789abcdef0123456789abcdef0123456789abcdef0123',
            positionId: 'pos_sol_usdc_02',
            decisionKind: 'executed',
            completedAtUnixMs: 1700000000000,
          },
        },
      });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(planRepo.getPlanActionKind).mockResolvedValueOnce('REQUEST_EXIT_CLMM');
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).toHaveBeenCalledOnce();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      const callArg = vi.mocked(regimePort.reportExecutionResult).mock.calls[0]?.[0] as {
        planId: string;
        planHash: string;
        positionId: string;
        requestedAction: string;
      };
      expect(callArg?.planId).toBe('plan_exit_987654321');
      expect(callArg?.planHash).toBe(
        'f9e8d7c6b5a40123456789abcdef0123456789abcdef0123456789abcdef0123',
      );
      expect(callArg?.positionId).toBe('pos_sol_usdc_02');
      expect(callArg?.requestedAction).toBe('REQUEST_EXIT_CLMM');
    });

    it('extracts completedAtUnixMs from canonicalResult payload instead of using clock.now()', async () => {
      const customTimestamp = 1695000000000;
      const claim = makeClaim({
        canonicalResult: {
          id: FIXTURE_RESULT_ID,
          payload: {
            planId: FIXTURE_PLAN_ID,
            canonicalHash: FIXTURE_CANONICAL_HASH,
            positionId: FIXTURE_POSITION_ID,
            decisionKind: 'executed',
            completedAtUnixMs: customTimestamp,
          },
        },
      });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({ kind: 'ok' });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).toHaveBeenCalledOnce();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      const callArg = vi.mocked(regimePort.reportExecutionResult).mock.calls[0]?.[0] as {
        completedAtUnixMs: number;
      };
      expect(callArg?.completedAtUnixMs).toBe(customTimestamp);
    });

    it('permanently rejects unrecognized decision kinds without defaulting to SKIPPED or UNKNOWN', async () => {
      const invalidDecisionClaim = makeClaim({
        canonicalResult: {
          id: FIXTURE_RESULT_ID,
          payload: {
            planId: FIXTURE_PLAN_ID,
            canonicalHash: FIXTURE_CANONICAL_HASH,
            positionId: FIXTURE_POSITION_ID,
            decisionKind: 'unrecognized_decision_kind',
            completedAtUnixMs: 1700000000000,
          },
        },
      });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(invalidDecisionClaim);

      const result = await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: FIXTURE_PLAN_ID,
          resultId: FIXTURE_RESULT_ID,
          reason: 'permanent:schema-invalid',
        }),
      );
      expect(result.permanentlyRejected).toBe(1);
    });

    it('validates the built result before transport', async () => {
      const invalidHashClaim = makeClaim({
        canonicalResult: {
          id: 'result-001',
          payload: {
            planId: FIXTURE_PLAN_ID,
            canonicalHash: 'not-a-valid-sha256',
            positionId: FIXTURE_POSITION_ID,
            decisionKind: 'executed',
            completedAtUnixMs: 1700000000000,
          },
        },
      });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(invalidHashClaim);

      const result = await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: FIXTURE_PLAN_ID,
          resultId: FIXTURE_RESULT_ID,
          reason: 'permanent:schema-invalid',
        }),
      );
      expect(result.permanentlyRejected).toBe(1);
    });

    it('preserves remote identity across retries', async () => {
      const claim = makeClaim({
        planId: 'plan_exit_987654321' as PlanId,
        idempotencyKey: 'idem_exit_987654321_01',
        attemptCount: 1,
        canonicalResult: {
          id: 'result-001',
          payload: {
            planId: 'plan_exit_987654321',
            canonicalHash: 'f9e8d7c6b5a40123456789abcdef0123456789abcdef0123456789abcdef0123',
            positionId: 'pos_sol_usdc_02',
            decisionKind: 'executed',
            completedAtUnixMs: 1700000000000,
          },
        },
      });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(claim);
      vi.mocked(planRepo.getPlanActionKind).mockResolvedValueOnce('REQUEST_EXIT_CLMM');
      vi.mocked(regimePort.reportExecutionResult).mockResolvedValueOnce({
        kind: 'retryable-degraded',
        reason: 'timeout',
      });

      await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/unbound-method
      const callArg = vi.mocked(regimePort.reportExecutionResult).mock.calls[0]?.[0] as {
        planId: string;
        planHash: string;
        idempotencyKey: string;
      };
      expect(callArg?.planId).toBe('plan_exit_987654321');
      expect(callArg?.planHash).toBe(
        'f9e8d7c6b5a40123456789abcdef0123456789abcdef0123456789abcdef0123',
      );
      expect(callArg?.idempotencyKey).toBe('idem_exit_987654321_01');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.rescheduleRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          resultId: FIXTURE_RESULT_ID,
        }),
      );
    });

    it('fails the outbox row permanently when the persisted payload cannot form a canonical result', async () => {
      const incompletePayloadClaim = makeClaim({
        canonicalResult: {
          id: 'result-001',
          payload: {
            planId: FIXTURE_PLAN_ID,
            // missing canonicalHash, positionId, decisionKind
          },
        },
      });
      vi.mocked(planRepo.claimDueResult).mockResolvedValueOnce(incompletePayloadClaim);

      const result = await syncPlanExecutionResults(deps);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(regimePort.reportExecutionResult).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(planRepo.failDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: FIXTURE_PLAN_ID,
          resultId: FIXTURE_RESULT_ID,
          reason: 'permanent:schema-invalid',
        }),
      );
      expect(result.permanentlyRejected).toBe(1);
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
