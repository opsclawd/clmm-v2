import { describe, it, expect } from 'vitest';
import {
  makeWalletId,
  makePositionId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  type LiquidityPosition,
  type PlanId,
  type CanonicalHash,
  type ExitTrigger,
  type ExitTriggerId,
  type BreachEpisodeId,
  type PositionDetail,
} from '@clmm/domain';
import {
  requestPositionPlan,
  createPlanExitPreview,
  approvePlanExit,
  recordPlanDecision,
  syncPlanExecutionResults,
  resumeExecutionAttempt,
  getAwaitingSignaturePayload,
  recordSignatureDecline,
  submitExecutionAttempt,
} from '@clmm/application';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeWalletSigningPort,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FakeTriggerRepository,
  FakePlanRepository,
  FakeRegimePlanPort,
  FakeObservabilityPort,
} from '../fakes/index.js';
import { FIXTURE_POSITION_BELOW_RANGE, FIXTURE_POOL_DATA } from '../fixtures/index.js';
import type { ResolveRegimePlanRequestConfigResult } from '@clmm/application';
import inRangeFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

const CONFIGURED_CONFIG: ResolveRegimePlanRequestConfigResult = {
  kind: 'configured',
  config: inRangeFixture.config,
};

describe('PositionPlanLifecycle Scenarios', () => {
  function buildEnvironment() {
    const walletId = makeWalletId('wallet-123');
    const positionId = makePositionId('pos-123');
    const clock = new FakeClockPort(1000);
    const idGenerator = new FakeIdGeneratorPort('id');
    const observability = new FakeObservabilityPort();

    const position: LiquidityPosition = {
      ...FIXTURE_POSITION_BELOW_RANGE,
      positionId,
      walletId,
      bounds: { lowerBound: 100, upperBound: 200 },
      lastObservedAt: makeClockTimestamp(1000),
      rangeState: { kind: 'in-range', currentPrice: 150 },
    };

    const positionDetail: PositionDetail = {
      position,
      poolData: FIXTURE_POOL_DATA,
      fees: { feeOwedA: 0n, feeOwedB: 0n, rewardInfos: [] },
      positionLiquidity: 1000n,
      principalTokenAmounts: {
        amountA: 500n,
        amountB: 500n,
        observedAt: makeClockTimestamp(1000),
      },
    };

    const positionReadPort = new FakeSupportedPositionReadPort(
      [position],
      { [position.poolId]: FIXTURE_POOL_DATA },
      positionDetail,
    );
    const triggerRepository = new FakeTriggerRepository();
    const planRepository = new FakePlanRepository();
    const regimePlanPort = new FakeRegimePlanPort();
    const swapQuotePort = new FakeSwapQuotePort();
    const executionRepo = new FakeExecutionRepository();
    const prepPort = new FakeExecutionPreparationPort();
    const signingPort = new FakeWalletSigningPort();
    const submissionPort = new FakeExecutionSubmissionPort();
    const historyRepo = new FakeExecutionHistoryRepository();

    return {
      walletId,
      positionId,
      clock,
      idGenerator,
      observability,
      positionReadPort,
      triggerRepository,
      planRepository,
      regimePlanPort,
      swapQuotePort,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
    };
  }

  async function seedAdvisoryReadyPlan(
    env: ReturnType<typeof buildEnvironment>,
    planIdStr = 'plan-1',
  ) {
    const planId = planIdStr as PlanId;
    const canonicalHash =
      'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123' as CanonicalHash;
    await env.planRepository.createRequest({
      planId,
      canonicalHash,
      positionId: env.positionId,
      walletId: env.walletId,
      requestedAt: env.clock.now(),
      action: { kind: 'REQUEST_EXIT_CLMM' },
    });
    await env.planRepository.updateLifecycleState({
      planId,
      lifecycleState: {
        kind: 'advisory-ready',
        advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
        regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
      },
    });
    return { planId, canonicalHash };
  }

  it('qualified lower breach outranks unavailable plan', async () => {
    const env = buildEnvironment();
    env.regimePlanPort.setPlanError('retryable-degraded');

    const trigger: ExitTrigger = {
      triggerId: 'trig-lower' as ExitTriggerId,
      positionId: env.positionId,
      breachDirection: LOWER_BOUND_BREACH,
      triggeredAt: makeClockTimestamp(1000),
      confirmationEvaluatedAt: makeClockTimestamp(1000),
      confirmationPassed: true,
      episodeId: 'ep-1' as BreachEpisodeId,
    };
    env.triggerRepository.triggers.set(trigger.triggerId, trigger);

    const result = await requestPositionPlan({
      walletId: env.walletId,
      positionId: env.positionId,
      positionReadPort: env.positionReadPort,
      triggerRepository: env.triggerRepository,
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      executionHistoryRepository: env.historyRepo,
      config: CONFIGURED_CONFIG,
      clock: env.clock,
      idGenerator: env.idGenerator,
      observability: env.observability,
    });

    expect(result.status).toBe('superseded');
    if (result.status === 'superseded') {
      expect(result.breachDirection.kind).toBe('lower-bound-breach');
    }
  });

  it('qualified upper breach remains authoritative over an accepted hold plan', async () => {
    const env = buildEnvironment();
    env.regimePlanPort.setPlanResponse({
      planId: 'plan-hold',
      schemaVersion: '1.0',
      planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
      asOfUnixMs: 1000,
      scope: {
        kind: 'position',
        positionId: env.positionId,
        poolAddress: 'fake-pool',
        symbol: 'SOL/USDC',
      },
      regime: 'UP',
      targets: {
        solBps: 5000,
        usdcBps: 5000,
        allowClmm: true,
      },
      actions: [{ type: 'HOLD', reasonCode: 'HOLD_POLICY' }],
      constraints: {
        cooldownUntilUnixMs: 0,
        standDownUntilUnixMs: 0,
        notes: [],
      },
      nextRegimeState: {
        current: 'UP',
        barsInRegime: 12,
        pending: null,
        pendingBars: 0,
      },
      reasons: [{ code: 'HOLD_POLICY', severity: 'INFO', message: 'Hold' }],
      telemetry: {
        realizedVolShort: 0.05,
      },
      marketData: {
        source: 'pyth',
        network: 'solana-mainnet',
        poolAddress: 'fake-pool',
        requestedTimeframe: '15m',
        sourceTimeframe: '15m',
        candleCount: 100,
        sourceCandleCount: 100,
        freshness: {
          generatedAtIso: '2026-08-01T20:00:00.000Z',
          lastCandleOpenUnixMs: 1700000000000,
          lastCandleOpenIso: '2026-08-01T19:45:00.000Z',
          lastCandleCloseUnixMs: 1700000900000,
          lastCandleCloseIso: '2026-08-01T20:00:00.000Z',
          ageSeconds: 5,
          softStale: false,
          hardStale: false,
          softStaleSeconds: 300,
          hardStaleSeconds: 900,
        },
      },
    });

    const trigger: ExitTrigger = {
      triggerId: 'trig-upper' as ExitTriggerId,
      positionId: env.positionId,
      breachDirection: UPPER_BOUND_BREACH,
      triggeredAt: makeClockTimestamp(1000),
      confirmationEvaluatedAt: makeClockTimestamp(1000),
      confirmationPassed: true,
      episodeId: 'ep-2' as BreachEpisodeId,
    };
    env.triggerRepository.triggers.set(trigger.triggerId, trigger);

    const result = await requestPositionPlan({
      walletId: env.walletId,
      positionId: env.positionId,
      positionReadPort: env.positionReadPort,
      triggerRepository: env.triggerRepository,
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      executionHistoryRepository: env.historyRepo,
      config: CONFIGURED_CONFIG,
      clock: env.clock,
      idGenerator: env.idGenerator,
      observability: env.observability,
    });

    expect(result.status).toBe('superseded');
    if (result.status === 'superseded') {
      expect(result.breachDirection.kind).toBe('upper-bound-breach');
    }
  });

  it('position change before signing skips plan execution', async () => {
    const env = buildEnvironment();
    const { planId } = await seedAdvisoryReadyPlan(env);

    const previewResult = await createPlanExitPreview({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      positionRepo: env.positionReadPort,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    expect(previewResult.previewId).toBeDefined();

    // Position changes before signing - record position-changed decision
    const decisionResult = await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'position-changed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    expect(decisionResult.kind).toBe('recorded');

    // Attempting execution approval after position change must abort/skip submission
    await expect(
      approvePlanExit({
        previewId: previewResult.previewId,
        planId,
        positionId: env.positionId,
        walletId: env.walletId,
        planRepo: env.planRepository,
        executionRepo: env.executionRepo,
        prepPort: env.prepPort,
        historyRepo: env.historyRepo,
        clock: env.clock,
        ids: env.idGenerator,
      }),
    ).rejects.toThrow();

    // Confirm that the position-changed result was written to outbox
    const claim = await env.planRepository.claimDueResult();
    expect(claim?.canonicalResult.payload).toMatchObject({
      planId,
      decisionKind: 'position-changed',
    });
  });

  it('user decline reports once', async () => {
    const env = buildEnvironment();
    const { planId, canonicalHash } = await seedAdvisoryReadyPlan(env);

    const previewResult = await createPlanExitPreview({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      positionRepo: env.positionReadPort,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    const approveResult = await approvePlanExit({
      previewId: previewResult.previewId,
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    env.signingPort.willDecline();
    const signingPayload = await getAwaitingSignaturePayload({
      attemptId: approveResult.attemptId,
      executionRepo: env.executionRepo,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    if (signingPayload.kind !== 'found') {
      throw new Error('Signing payload not found');
    }

    const signingResult = await env.signingPort.requestSignature(
      signingPayload.serializedPayload,
      env.walletId,
    );
    expect(signingResult.kind).toBe('declined');

    await recordSignatureDecline({
      attemptId: approveResult.attemptId,
      executionRepo: env.executionRepo,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'rejected' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
    expect(env.regimePlanPort.getResults()[0]).toMatchObject({
      schemaVersion: '1.0',
      planId,
      planHash: canonicalHash,
      positionId: env.positionId,
      requestedAction: 'REQUEST_EXIT_CLMM',
      status: 'SKIPPED',
      reasonCode: 'REJECTED',
    });

    // Verify reporting happens only once
    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
  });

  it('successful exit reports authoritative result once', async () => {
    const env = buildEnvironment();
    const { planId, canonicalHash } = await seedAdvisoryReadyPlan(env);

    const previewResult = await createPlanExitPreview({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      positionRepo: env.positionReadPort,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    const approveResult = await approvePlanExit({
      previewId: previewResult.previewId,
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    env.signingPort._nextResult = { kind: 'signed', signedPayload: new Uint8Array([1, 2, 3]) };
    const signingPayload = await getAwaitingSignaturePayload({
      attemptId: approveResult.attemptId,
      executionRepo: env.executionRepo,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    if (signingPayload.kind !== 'found') {
      throw new Error('Signing payload not found');
    }

    const signingResult = await env.signingPort.requestSignature(
      signingPayload.serializedPayload,
      env.walletId,
    );
    expect(signingResult.kind).toBe('signed');

    if (signingResult.kind === 'signed') {
      await submitExecutionAttempt({
        attemptId: approveResult.attemptId,
        signedPayload: signingResult.signedPayload,
        executionRepo: env.executionRepo,
        submissionPort: env.submissionPort,
        historyRepo: env.historyRepo,
        clock: env.clock,
        ids: env.idGenerator,
      });
    }

    await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'executed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
    expect(env.regimePlanPort.getResults()[0]).toMatchObject({
      schemaVersion: '1.0',
      planId,
      planHash: canonicalHash,
      positionId: env.positionId,
      requestedAction: 'REQUEST_EXIT_CLMM',
      status: 'SUCCESS',
      reasonCode: 'EXECUTED',
    });

    // Verify reporting happens only once
    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
  });

  it('failed transaction reports failure once', async () => {
    const env = buildEnvironment();
    const { planId, canonicalHash } = await seedAdvisoryReadyPlan(env);

    const previewResult = await createPlanExitPreview({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      positionRepo: env.positionReadPort,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    await approvePlanExit({
      previewId: previewResult.previewId,
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'failed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
    expect(env.regimePlanPort.getResults()[0]).toMatchObject({
      schemaVersion: '1.0',
      planId,
      planHash: canonicalHash,
      positionId: env.positionId,
      requestedAction: 'REQUEST_EXIT_CLMM',
      status: 'FAILED',
      reasonCode: 'FAILED',
    });

    // Verify reporting happens only once
    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
  });

  it('restart resumes reporting without reexecution', async () => {
    const env = buildEnvironment();
    const { planId, canonicalHash } = await seedAdvisoryReadyPlan(env);

    const previewResult = await createPlanExitPreview({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      positionRepo: env.positionReadPort,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    const approveResult = await approvePlanExit({
      previewId: previewResult.previewId,
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      planRepo: env.planRepository,
      executionRepo: env.executionRepo,
      prepPort: env.prepPort,
      historyRepo: env.historyRepo,
      clock: env.clock,
      ids: env.idGenerator,
    });

    await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'executed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    await env.executionRepo.updateAttemptState(approveResult.attemptId, { kind: 'confirmed' });

    // Simulate restart & resume attempt execution
    const resumeResult = await resumeExecutionAttempt({
      attemptId: approveResult.attemptId,
      executionRepo: env.executionRepo,
    });

    expect(resumeResult.kind).toBe('not-resumable');
    if (resumeResult.kind === 'not-resumable') {
      expect(resumeResult.currentState).toBe('confirmed');
    }

    // Verify that reporting resumes and delivers the pending execution result
    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
    expect(env.regimePlanPort.getResults()[0]).toMatchObject({
      schemaVersion: '1.0',
      planId,
      planHash: canonicalHash,
      positionId: env.positionId,
      requestedAction: 'REQUEST_EXIT_CLMM',
      status: 'SUCCESS',
      reasonCode: 'EXECUTED',
    });
  });

  it('result replay preserves idempotency', async () => {
    const env = buildEnvironment();
    const { planId } = await seedAdvisoryReadyPlan(env);

    const firstDecision = await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'executed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    expect(firstDecision.kind).toBe('recorded');

    const secondDecision = await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'executed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    expect(secondDecision.kind).toBe('recorded');

    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    expect(env.regimePlanPort.getResults()).toHaveLength(1);
    expect(env.regimePlanPort.getResults()[0]?.idempotencyKey).toBe(`result-${planId}-executed`);
  });

  it('conflicting result fails permanently', async () => {
    const env = buildEnvironment();
    const { planId } = await seedAdvisoryReadyPlan(env);

    await recordPlanDecision({
      planId,
      positionId: env.positionId,
      walletId: env.walletId,
      decision: { kind: 'executed' },
      planRepository: env.planRepository,
      triggerRepository: env.triggerRepository,
      clock: env.clock,
      observability: env.observability,
    });

    env.regimePlanPort.setResultError('permanent');

    await syncPlanExecutionResults({
      planRepository: env.planRepository,
      regimePlanPort: env.regimePlanPort,
      clock: env.clock,
      observability: env.observability,
    });

    const currentPlan = await env.planRepository.getCurrentPlan(env.positionId);
    expect(currentPlan?.state.kind).toBe('report-failed');
  });
});
