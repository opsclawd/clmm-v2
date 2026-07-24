import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { PlanController } from './PlanController.js';
import {
  FakePlanRepository,
  FakeRegimePlanPort,
  FakeSupportedPositionReadPort,
  FakeExecutionRepository,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POOL_DATA,
  FakeExecutionPreparationPort,
  FakeIdGeneratorPort,
  FakeObservabilityPort,
  FakeClockPort,
} from '@clmm/testing';
import type { RegimePlanResponse, TriggerRepository } from '@clmm/application';
import { makeWalletId } from '@clmm/domain';
import type { WalletId } from '@clmm/domain';

const TEST_WALLET = FIXTURE_POSITION_IN_RANGE.walletId;
const TEST_POSITION = FIXTURE_POSITION_IN_RANGE.positionId;
const TEST_POOL = FIXTURE_POSITION_IN_RANGE.poolId;
const OTHER_WALLET = makeWalletId('other-wallet');

function createAdvisoryReadyPlanResponse(): RegimePlanResponse {
  return {
    schemaVersion: 'position-plan.v1',
    planId: 'regime-plan-id',
    planHash: 'abc123',
    asOfUnixMs: Date.now(),
    expiresAtUnixMs: Date.now() + 3600000,
    scope: {
      kind: 'position',
      positionId: TEST_POSITION,
      poolAddress: TEST_POOL,
      symbol: 'SOL/USDC',
    },
    regime: 'UP',
    actions: [
      {
        type: 'REQUEST_EXIT_CLMM',
        reasonCode: 'BREACH_LIKELY',
        exitIntent: { posture: 'ExitToUSDC' },
      },
    ],
    constraints: {
      cooldownUntilUnixMs: 0,
      standDownUntilUnixMs: 0,
      notes: [],
    },
    reasons: [{ code: 'BREACH_LIKELY', severity: 'WARN', message: 'Breach likely' }],
  };
}

class FakeTriggerRepository implements TriggerRepository {
  triggers: Map<string, import('@clmm/domain').ExitTrigger> = new Map();

  async getTrigger(_triggerId: string): Promise<import('@clmm/domain').ExitTrigger | null> {
    return null;
  }

  async listActionableTriggers(_walletId: WalletId): Promise<import('@clmm/domain').ExitTrigger[]> {
    return Array.from(this.triggers.values());
  }

  async deleteTrigger(_triggerId: string): Promise<void> {}
}

class FakeRegimePort extends FakeRegimePlanPort {
  override getRequests(): readonly import('@clmm/application').RegimePlanRequest[] {
    return super.getRequests();
  }
}

describe('PlanController', () => {
  let controller: PlanController;
  let fakePlanRepo: FakePlanRepository;
  let fakeRegimePort: FakeRegimePort;
  let fakePositionRepo: FakeSupportedPositionReadPort;
  let fakeTriggerRepo: FakeTriggerRepository;
  let fakeExecutionRepo: FakeExecutionRepository;
  let fakePrepPort: FakeExecutionPreparationPort;
  let fakeHistoryRepo: FakeExecutionHistoryRepository;
  let fakeClock: FakeClockPort;
  let fakeIds: FakeIdGeneratorPort;
  let fakeObservability: FakeObservabilityPort;

  beforeEach(() => {
    fakePlanRepo = new FakePlanRepository();
    fakeRegimePort = new FakeRegimePort();
    fakePositionRepo = new FakeSupportedPositionReadPort(
      [FIXTURE_POSITION_IN_RANGE],
      { [FIXTURE_POSITION_IN_RANGE.poolId]: FIXTURE_POOL_DATA },
      FIXTURE_POSITION_DETAIL,
    );
    fakeTriggerRepo = new FakeTriggerRepository();
    fakeExecutionRepo = new FakeExecutionRepository();
    fakePrepPort = new FakeExecutionPreparationPort();
    fakeHistoryRepo = new FakeExecutionHistoryRepository();
    fakeClock = new FakeClockPort();
    fakeIds = new FakeIdGeneratorPort();
    fakeObservability = new FakeObservabilityPort();

    controller = new PlanController(
      fakePlanRepo,
      fakeRegimePort,
      fakePositionRepo,
      fakeTriggerRepo,
      fakeExecutionRepo,
      fakePrepPort,
      fakeHistoryRepo,
      fakeClock,
      fakeIds,
      fakeObservability,
    );
  });

  describe('returns a position-scoped plan envelope', () => {
    it('returns a plan envelope for a valid position', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      const result = await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      expect(result.status).toBe('ok');
      expect(result.conflict).toBe(false);
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('fingerprint');
    });
  });

  describe('returns advisory degraded without affecting position routes', () => {
    it('returns degraded status without throwing when regime is unavailable', async () => {
      fakeRegimePort.setPlanError('retryable-degraded');

      const result = await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      expect(result.status).toBe('degraded');
      expect(result).toHaveProperty('reason');
    });
  });

  describe('rejects wallet ownership mismatch', () => {
    it('throws NotFoundException when wallet does not own the position', async () => {
      await expect(controller.requestPlan(OTHER_WALLET, TEST_POSITION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when getting current plan for non-owned position', async () => {
      await expect(controller.getCurrentPlan(OTHER_WALLET, TEST_POSITION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('returns existing identity for replay', () => {
    it('returns ok when making the exact same request twice (idempotent replay)', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      const first = await controller.requestPlan(TEST_WALLET, TEST_POSITION);
      expect(first.status).toBe('ok');
      expect(first.conflict).toBe(false);

      const second = await controller.requestPlan(TEST_WALLET, TEST_POSITION);
      expect(second.status).toBe('ok');
      expect(second.conflict).toBe(false);
    });
  });

  describe('returns conflict without preview or submission', () => {
    it('throws HttpException 409 without exposing plan details', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      fakeRegimePort.setPlanError('conflict');

      await expect(controller.requestPlan(TEST_WALLET, TEST_POSITION)).rejects.toThrow(
        HttpException,
      );

      try {
        await controller.requestPlan(TEST_WALLET, TEST_POSITION);
        expect.fail('Should have thrown HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
        const response = (err as HttpException).getResponse() as {
          status: string;
          priorPlanId: string;
        };
        expect(response.status).toBe('conflict');
        expect(response).not.toHaveProperty('plan');
      }
    });
  });

  describe('never exposes Regime credentials or raw validation diagnostics', () => {
    it('does not include regime internal token in response', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      const result = await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('X-CLMM-Internal-Token');
      expect(resultStr).not.toContain('REGIME_ENGINE_INTERNAL_TOKEN');
      expect(resultStr).not.toContain('baseUrl');
    });

    it('returns degraded without exposing regime error details', async () => {
      fakeRegimePort.setPlanError('permanent');

      const result = await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      expect(result.status).toBe('degraded');
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain('schema-invalid');
      expect(resultStr).not.toContain('malformed-body');
    });
  });

  describe('getCurrentPlan', () => {
    it('returns the current plan for a position', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      const current = await controller.getCurrentPlan(TEST_WALLET, TEST_POSITION);

      expect(current).not.toBeNull();
      expect(current).toHaveProperty('planId');
      expect(current).toHaveProperty('canonicalHash');
      expect(current).toHaveProperty('positionId');
    });

    it('returns null when no plan exists', async () => {
      const current = await controller.getCurrentPlan(TEST_WALLET, TEST_POSITION);
      expect(current).toBeNull();
    });
  });
});
