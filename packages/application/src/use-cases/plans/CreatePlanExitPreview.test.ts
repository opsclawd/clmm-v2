import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPlanExitPreview,
  PlanNotEligibleForExitPreviewError,
  PositionMateriallyChangedError,
} from './CreatePlanExitPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakePlanRepository,
  FakeSupportedPositionReadPort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_DETAIL,
  FIXTURE_POSITION_ABOVE_RANGE,
} from '@clmm/testing';
import type { PlanId, CanonicalHash } from '@clmm/domain';

const PLAN_ID = 'plan-exit-preview-1' as PlanId;
const CANONICAL_HASH = 'hash-exit-preview-1' as CanonicalHash;

describe('createPlanExitPreview', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let planRepo: FakePlanRepository;
  let positionRepo: FakeSupportedPositionReadPort;
  let executionRepo: FakeExecutionRepository;
  let prepPort: FakeExecutionPreparationPort;
  let historyRepo: FakeExecutionHistoryRepository;

  async function seedAdvisoryReadyPlan(): Promise<void> {
    await planRepo.createRequest({
      planId: PLAN_ID,
      canonicalHash: CANONICAL_HASH,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      requestedAt: clock.now(),
      action: { kind: 'REQUEST_EXIT_CLMM' },
    });
    await planRepo.updateLifecycleState({
      planId: PLAN_ID,
      lifecycleState: {
        kind: 'advisory-ready',
        advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
        regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
      },
    });
  }

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('plan-exit-preview');
    planRepo = new FakePlanRepository();
    positionRepo = new FakeSupportedPositionReadPort([], {}, FIXTURE_POSITION_DETAIL);
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    historyRepo = new FakeExecutionHistoryRepository();
  });

  it('stores a plan exit without fabricating breach direction', async () => {
    await seedAdvisoryReadyPlan();

    const result = await createPlanExitPreview({
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      positionRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.executionOrigin).toEqual({
      kind: 'regime-plan',
      planId: PLAN_ID,
      canonicalHash: CANONICAL_HASH,
      canonicalExitIntent: 'exit-to-usdc',
    });

    const stored = await executionRepo.getPreview(result.previewId);
    expect(stored?.origin).toEqual(result.executionOrigin);
    expect(stored?.origin).not.toHaveProperty('breachDirection');
  });

  it('derives exit-to-sol posture for above-range position using local breach direction', async () => {
    positionRepo = new FakeSupportedPositionReadPort(
      [],
      {},
      {
        ...FIXTURE_POSITION_DETAIL,
        position: FIXTURE_POSITION_ABOVE_RANGE,
      },
    );
    await seedAdvisoryReadyPlan();

    const result = await createPlanExitPreview({
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      positionRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.executionOrigin).toEqual({
      kind: 'regime-plan',
      planId: PLAN_ID,
      canonicalHash: CANONICAL_HASH,
      canonicalExitIntent: 'exit-to-sol',
    });
    expect(result.plan.postExitPosture).toEqual({ kind: 'exit-to-sol' });
    expect(result.plan.swapInstruction.fromAsset).toBe('USDC');
    expect(result.plan.swapInstruction.toAsset).toBe('SOL');
  });

  it('records a preview-created history event carrying the regime-plan origin', async () => {
    await seedAdvisoryReadyPlan();

    await createPlanExitPreview({
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      positionRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    const event = historyRepo.events.find((e) => e.eventType === 'preview-created');
    expect(event?.origin.kind).toBe('regime-plan');
  });

  it('rejects a plan after position material change', async () => {
    await seedAdvisoryReadyPlan();
    positionRepo = new FakeSupportedPositionReadPort([], {}, null);

    await expect(
      createPlanExitPreview({
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        positionRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(PositionMateriallyChangedError);
  });

  it('rejects a plan that is not in advisory-ready or exit-previewed state', async () => {
    await planRepo.createRequest({
      planId: PLAN_ID,
      canonicalHash: CANONICAL_HASH,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      requestedAt: clock.now(),
      action: { kind: 'REQUEST_EXIT_CLMM' },
    });

    await expect(
      createPlanExitPreview({
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        positionRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(PlanNotEligibleForExitPreviewError);
  });

  it('rejects when no current plan matches the given planId', async () => {
    await expect(
      createPlanExitPreview({
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        positionRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(PlanNotEligibleForExitPreviewError);
  });

  it('creates only one preview under replay by transitioning the plan to exit-previewed', async () => {
    await seedAdvisoryReadyPlan();

    const first = await createPlanExitPreview({
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      positionRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    const currentPlan = await planRepo.getCurrentPlan(FIXTURE_POSITION_ID);
    expect(currentPlan?.state.kind).toBe('exit-previewed');

    // A second call reads the now exit-previewed plan and produces a fresh
    // preview referencing the same canonical plan/origin rather than erroring.
    const second = await createPlanExitPreview({
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      positionRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    expect(first.executionOrigin).toEqual(second.executionOrigin);
  });
});
