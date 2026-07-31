import { describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException, HttpException, HttpStatus, ConflictException } from '@nestjs/common';
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
import { makeWalletId, makePositionId } from '@clmm/domain';
import type { WalletId } from '@clmm/domain';
import type { ResolveRegimePlanRequestConfigResult } from '../../composition/RegimePlanRequestConfig.js';
import inRangeFixture from '../../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

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

    const configuredConfig: ResolveRegimePlanRequestConfigResult = {
      kind: 'configured',
      config: inRangeFixture.config,
    };

    controller = new PlanController(
      fakePlanRepo,
      fakeRegimePort,
      fakePositionRepo,
      fakeTriggerRepo,
      fakeExecutionRepo,
      fakePrepPort,
      fakeHistoryRepo,
      configuredConfig,
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

      fakeClock.advance(16 * 60 * 1000);
      const freshPos = { ...FIXTURE_POSITION_IN_RANGE, lastObservedAt: fakeClock.now() };
      fakePositionRepo = new FakeSupportedPositionReadPort(
        [freshPos],
        { [freshPos.poolId]: FIXTURE_POOL_DATA },
        { ...FIXTURE_POSITION_DETAIL, position: freshPos },
      );
      controller = new PlanController(
        fakePlanRepo,
        fakeRegimePort,
        fakePositionRepo,
        fakeTriggerRepo,
        fakeExecutionRepo,
        fakePrepPort,
        fakeHistoryRepo,
        { kind: 'configured', config: inRangeFixture.config },
        fakeClock,
        fakeIds,
        fakeObservability,
      );

      const second = await controller.requestPlan(TEST_WALLET, TEST_POSITION);
      expect(second.status).toBe('ok');
      expect(second.conflict).toBe(false);
    });
  });

  describe('returns throttled envelope when request is inside minimum interval', () => {
    it('returns throttled envelope without throwing 409 when called repeatedly', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      const first = await controller.requestPlan(TEST_WALLET, TEST_POSITION);
      expect(first.status).toBe('ok');

      const second = await controller.requestPlan(TEST_WALLET, TEST_POSITION);
      expect(second.status).toBe('throttled');
      if (second.status === 'throttled') {
        expect(second.reason).toBe('minimum-interval');
      }
    });
  });

  describe('returns conflict without preview or submission', () => {
    it('throws HttpException 409 without exposing plan details', async () => {
      const planResponse = createAdvisoryReadyPlanResponse();
      fakeRegimePort.setPlanResponse(planResponse);

      await controller.requestPlan(TEST_WALLET, TEST_POSITION);

      fakeRegimePort.setPlanError('conflict');
      fakeClock.advance(16 * 60 * 1000);
      const freshPos = { ...FIXTURE_POSITION_IN_RANGE, lastObservedAt: fakeClock.now() };
      fakePositionRepo = new FakeSupportedPositionReadPort(
        [freshPos],
        { [freshPos.poolId]: FIXTURE_POOL_DATA },
        { ...FIXTURE_POSITION_DETAIL, position: freshPos },
      );
      controller = new PlanController(
        fakePlanRepo,
        fakeRegimePort,
        fakePositionRepo,
        fakeTriggerRepo,
        fakeExecutionRepo,
        fakePrepPort,
        fakeHistoryRepo,
        { kind: 'configured', config: inRangeFixture.config },
        fakeClock,
        fakeIds,
        fakeObservability,
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

  describe('recordDecision', () => {
    const TEST_PLAN_ID = 'test-plan-id' as import('@clmm/domain').PlanId;

    async function seedAdvisoryReadyPlan(): Promise<void> {
      await fakePlanRepo.createRequest({
        planId: TEST_PLAN_ID,
        canonicalHash: 'test-hash' as import('@clmm/domain').CanonicalHash,
        positionId: TEST_POSITION,
        walletId: TEST_WALLET,
        requestedAt: fakeClock.now(),
        action: { kind: 'REQUEST_EXIT_CLMM' },
      });
      await fakePlanRepo.updateLifecycleState({
        planId: TEST_PLAN_ID,
        lifecycleState: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
    }

    it('throws NotFoundException when position does not exist', async () => {
      await expect(
        controller.recordDecision(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
          decision: 'acknowledged',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns recorded decision successfully', async () => {
      await seedAdvisoryReadyPlan();

      const result = await controller.recordDecision(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
        decision: 'acknowledged',
      });

      expect(result.kind).toBe('recorded');
      expect(result).toHaveProperty('resultId');
    });

    it('throws ConflictException when conflict-detected is returned', async () => {
      await seedAdvisoryReadyPlan();

      await controller.recordDecision(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
        decision: 'acknowledged',
      });

      await expect(
        controller.recordDecision(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
          decision: 'stand-down',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      await expect(
        controller.recordDecision(
          TEST_WALLET,
          TEST_POSITION,
          'nonexistent-plan' as import('@clmm/domain').PlanId,
          {
            decision: 'acknowledged',
          },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('approvePlan', () => {
    const TEST_PLAN_ID = 'test-plan-id' as import('@clmm/domain').PlanId;

    async function seedAdvisoryReadyPlan(): Promise<void> {
      await fakePlanRepo.createRequest({
        planId: TEST_PLAN_ID,
        canonicalHash: 'test-hash' as import('@clmm/domain').CanonicalHash,
        positionId: TEST_POSITION,
        walletId: TEST_WALLET,
        requestedAt: fakeClock.now(),
        action: { kind: 'REQUEST_EXIT_CLMM' },
      });
      await fakePlanRepo.updateLifecycleState({
        planId: TEST_PLAN_ID,
        lifecycleState: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
    }

    it('throws NotFoundException when position does not exist', async () => {
      const nonExistentPosition = makePositionId('non-existent-position');
      await expect(
        controller.approvePlan(TEST_WALLET, nonExistentPosition, TEST_PLAN_ID, {
          previewId: 'preview-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when plan does not exist', async () => {
      await seedAdvisoryReadyPlan();

      await expect(
        controller.approvePlan(
          TEST_WALLET,
          TEST_POSITION,
          'wrong-plan-id' as import('@clmm/domain').PlanId,
          { previewId: 'preview-1' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when preview does not exist', async () => {
      await seedAdvisoryReadyPlan();
      await controller.createPreview(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID);

      await expect(
        controller.approvePlan(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
          previewId: 'nonexistent-preview',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns approval result successfully', async () => {
      await seedAdvisoryReadyPlan();

      const preview = await controller.createPreview(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID);
      const result = await controller.approvePlan(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
        previewId: preview.previewId,
      });

      expect(result).toHaveProperty('attemptId');
      expect(result.lifecycleState.kind).toBe('awaiting-signature');
      expect(result).toHaveProperty('executionOrigin');
    });

    it('throws ConflictException when plan is already linked to an attempt', async () => {
      await seedAdvisoryReadyPlan();

      const preview = await controller.createPreview(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID);
      await controller.approvePlan(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
        previewId: preview.previewId,
      });

      await expect(
        controller.approvePlan(TEST_WALLET, TEST_POSITION, TEST_PLAN_ID, {
          previewId: preview.previewId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
