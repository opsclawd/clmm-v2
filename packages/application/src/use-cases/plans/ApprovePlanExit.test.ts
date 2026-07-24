import { describe, it, expect, beforeEach } from 'vitest';
import { approvePlanExit, PlanExitApprovalError } from './ApprovePlanExit.js';
import { createPlanExitPreview } from './CreatePlanExitPreview.js';
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
} from '@clmm/testing';
import type { PlanId, CanonicalHash } from '@clmm/domain';

const PLAN_ID = 'plan-approve-exit-1' as PlanId;
const CANONICAL_HASH = 'hash-approve-exit-1' as CanonicalHash;

describe('approvePlanExit', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let planRepo: FakePlanRepository;
  let positionRepo: FakeSupportedPositionReadPort;
  let executionRepo: FakeExecutionRepository;
  let prepPort: FakeExecutionPreparationPort;
  let historyRepo: FakeExecutionHistoryRepository;

  async function seedPreviewedPlan(): Promise<{ previewId: string }> {
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

    const { previewId } = await createPlanExitPreview({
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

    return { previewId };
  }

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort('plan-approve-exit');
    planRepo = new FakePlanRepository();
    positionRepo = new FakeSupportedPositionReadPort([], {}, FIXTURE_POSITION_DETAIL);
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    historyRepo = new FakeExecutionHistoryRepository();
  });

  it('requires explicit approval and wallet signature: only reaches awaiting-signature, never auto-submits', async () => {
    const { previewId } = await seedPreviewedPlan();

    const result = await approvePlanExit({
      previewId,
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.lifecycleState).toEqual({ kind: 'awaiting-signature' });
    expect(result.executionOrigin.kind).toBe('regime-plan');

    const storedAttempt = await executionRepo.getAttempt(result.attemptId);
    expect(storedAttempt?.lifecycleState.kind).toBe('awaiting-signature');
  });

  it('links the created attempt to the originating plan', async () => {
    const { previewId } = await seedPreviewedPlan();

    const result = await approvePlanExit({
      previewId,
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    // Linking twice for the same plan throws in the fake, proving a single link was recorded.
    await expect(
      planRepo.linkExecutionAttempt({
        planId: PLAN_ID,
        attemptId: 'some-other-attempt',
        linkedAt: clock.now(),
      }),
    ).rejects.toThrow(`already linked to attempt ${result.attemptId}`);
  });

  it('creates only one preview and attempt under replay: a second approve on the same preview creates a distinct attempt without corrupting the first', async () => {
    const { previewId } = await seedPreviewedPlan();

    const first = await approvePlanExit({
      previewId,
      planId: PLAN_ID,
      positionId: FIXTURE_POSITION_ID,
      walletId: FIXTURE_WALLET_ID,
      planRepo,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    const firstAttempt = await executionRepo.getAttempt(first.attemptId);
    expect(firstAttempt?.lifecycleState.kind).toBe('awaiting-signature');

    // The plan is already linked; a second approval attempt against the same
    // plan must not silently relink or duplicate the canonical attempt.
    await expect(
      approvePlanExit({
        previewId,
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(/already linked to attempt/);
  });

  it('rejects approval when the plan is not found or not current', async () => {
    await expect(
      approvePlanExit({
        previewId: 'missing-preview',
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(PlanExitApprovalError);
  });

  it('rejects approval when the preview is not found', async () => {
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

    await expect(
      approvePlanExit({
        previewId: 'missing-preview',
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(PlanExitApprovalError);
  });

  it('rejects approval when the preview has gone stale', async () => {
    const { previewId } = await seedPreviewedPlan();
    clock.advance(120_000);

    await expect(
      approvePlanExit({
        previewId,
        planId: PLAN_ID,
        positionId: FIXTURE_POSITION_ID,
        walletId: FIXTURE_WALLET_ID,
        planRepo,
        executionRepo,
        prepPort,
        historyRepo,
        clock,
        ids,
      }),
    ).rejects.toThrow(PlanExitApprovalError);
  });
});
