import { describe, it, expect, beforeEach } from 'vitest';
import { requestPositionPlan } from './RequestPositionPlan.js';
import type {
  SupportedPositionReadPort,
  TriggerRepository,
  PlanRepository,
  RegimePlanPort,
  ExecutionHistoryRepository,
  ClockPort,
  ObservabilityPort,
  PlanRequestTransportResult,
} from '../../ports/index.js';
import type { RegimePlanRequest, RegimePlanResponse } from '../../dto/regimePlan.js';
import type {
  WalletId,
  PositionId,
  PlanId,
  PoolId,
  BreachDirection,
  ClockTimestamp,
  ExitTriggerId,
  LiquidityPosition,
  PositionDetail,
  PoolData,
  ExitTrigger,
  PositionPlan,
  PlanLifecycleState,
  CanonicalHash,
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
} from '@clmm/domain';
import {
  makeWalletId,
  makePositionId,
  makeClockTimestamp,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from '@clmm/domain';
import type { ResolveRegimePlanRequestConfigResult } from '../../dto/regimePlan.js';
import inRangeFixture from '../../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

const FIXTURE_WALLET_ID = makeWalletId('test-wallet-1');
const FIXTURE_POSITION_ID = makePositionId('test-position-1');
const FIXTURE_POOL_ID = 'test-pool-1' as PoolId;

const CONFIGURED_CONFIG: ResolveRegimePlanRequestConfigResult = {
  kind: 'configured',
  config: inRangeFixture.config,
};

function makeInRangePosition(
  positionId: PositionId,
  walletId: WalletId,
  lastObservedAt?: ClockTimestamp,
): LiquidityPosition {
  return {
    positionId,
    walletId,
    poolId: FIXTURE_POOL_ID,
    bounds: { lowerBound: 100, upperBound: 200 },
    lastObservedAt: lastObservedAt ?? makeClockTimestamp(1_000_000),
    rangeState: { kind: 'in-range', currentPrice: 150 },
    monitoringReadiness: { kind: 'active' },
  };
}

function makeBelowRangePosition(positionId: PositionId, walletId: WalletId): LiquidityPosition {
  return {
    positionId,
    walletId,
    poolId: FIXTURE_POOL_ID,
    bounds: { lowerBound: 100, upperBound: 200 },
    lastObservedAt: makeClockTimestamp(1_000_000),
    rangeState: { kind: 'below-range', currentPrice: 80 },
    monitoringReadiness: { kind: 'active' },
  };
}

function makeAboveRangePosition(positionId: PositionId, walletId: WalletId): LiquidityPosition {
  return {
    positionId,
    walletId,
    poolId: FIXTURE_POOL_ID,
    bounds: { lowerBound: 100, upperBound: 200 },
    lastObservedAt: makeClockTimestamp(1_000_000),
    rangeState: { kind: 'above-range', currentPrice: 250 },
    monitoringReadiness: { kind: 'active' },
  };
}

function makeStalePosition(positionId: PositionId, walletId: WalletId): LiquidityPosition {
  return {
    positionId,
    walletId,
    poolId: FIXTURE_POOL_ID,
    bounds: { lowerBound: 100, upperBound: 200 },
    lastObservedAt: makeClockTimestamp(1_000),
    rangeState: { kind: 'below-range', currentPrice: 80 },
    monitoringReadiness: { kind: 'active' },
  };
}

const mockPoolData: PoolData = {
  poolId: FIXTURE_POOL_ID,
  tokenPair: {
    mintA: 'So11111111111111111111111111111111111111112',
    mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbolA: 'SOL',
    symbolB: 'USDC',
    decimalsA: 9,
    decimalsB: 6,
  },
  sqrtPrice: 184467440737095516n,
  feeRate: 1000,
  tickSpacing: 64,
  liquidity: 2400000000n,
  tickCurrentIndex: 150,
};

function makeFixtureDetail(position: LiquidityPosition): PositionDetail {
  return {
    position,
    poolData: mockPoolData,
    fees: { feeOwedA: 0n, feeOwedB: 0n, rewardInfos: [] },
    positionLiquidity: 1000n,
    principalTokenAmounts: {
      amountA: 33333333000n,
      amountB: 5000000000n,
      observedAt: position.lastObservedAt,
    },
  };
}

function makeLowerTrigger(positionId: PositionId): ExitTrigger {
  return {
    triggerId: 'trigger-1' as ExitTriggerId,
    positionId,
    breachDirection: LOWER_BOUND_BREACH,
    triggeredAt: makeClockTimestamp(1_000_000),
    confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
    confirmationPassed: true,
    episodeId: 'episode-1' as import('@clmm/domain').BreachEpisodeId,
  };
}

function makeUpperTrigger(positionId: PositionId): ExitTrigger {
  return {
    triggerId: 'trigger-2' as ExitTriggerId,
    positionId,
    breachDirection: UPPER_BOUND_BREACH,
    triggeredAt: makeClockTimestamp(1_000_000),
    confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
    confirmationPassed: true,
    episodeId: 'episode-2' as import('@clmm/domain').BreachEpisodeId,
  };
}

class FakeSupportedPositionReadPort implements SupportedPositionReadPort {
  private _position: LiquidityPosition | null = null;
  private _detail: PositionDetail | null = null;
  private _poolData: PoolData | null = null;

  setPosition(position: LiquidityPosition | null): void {
    this._position = position;
  }

  setDetail(detail: PositionDetail | null): void {
    this._detail = detail;
  }

  setPoolData(poolData: PoolData | null): void {
    this._poolData = poolData;
  }

  async listSupportedPositions(_walletId: WalletId): Promise<LiquidityPosition[]> {
    return this._position ? [this._position] : [];
  }

  async getPosition(
    _walletId: WalletId,
    _positionId: PositionId,
  ): Promise<LiquidityPosition | null> {
    return this._position;
  }

  async getPositionDetail(
    _walletId: WalletId,
    _positionId: PositionId,
  ): Promise<PositionDetail | null> {
    return this._detail;
  }

  async getPoolData(_poolId: PoolId): Promise<PoolData | null> {
    return this._poolData;
  }
}

class FakeTriggerRepository implements TriggerRepository {
  private _triggers: ExitTrigger[] = [];

  setTriggers(triggers: ExitTrigger[]): void {
    this._triggers = triggers;
  }

  async getTrigger(_triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    return null;
  }

  async listActionableTriggers(_walletId: WalletId): Promise<ExitTrigger[]> {
    return [...this._triggers];
  }

  async deleteTrigger(_triggerId: ExitTriggerId): Promise<void> {
    this._triggers = [];
  }
}

class FakeExecutionHistoryRepository implements ExecutionHistoryRepository {
  async appendEvent(_event: HistoryEvent): Promise<void> {}
  async recordWalletPositionOwnership(
    _walletId: WalletId,
    _positionId: PositionId,
    _observedAt: number,
  ): Promise<void> {}
  async getWalletHistory(_walletId: WalletId): Promise<readonly HistoryEvent[]> {
    return [];
  }
  async getTimeline(positionId: PositionId): Promise<HistoryTimeline> {
    return { positionId, events: [] };
  }
  async getOutcomeSummary(_positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
    return null;
  }
}

type StoredPlan = {
  planId: PlanId;
  canonicalHash: CanonicalHash;
  positionId: PositionId;
  walletId: WalletId;
  requestedAt: ClockTimestamp;
  respondedAt: ClockTimestamp | null;
  asOfAt: ClockTimestamp | null;
  expiresAt: ClockTimestamp | null;
  actionKind: string;
  actionReasons: string[];
  snapshotFingerprint: string | undefined;
  lifecycleKind: string;
  decisionKind: string | null;
  attemptId: string | null;
  executionOriginJson: Record<string, unknown> | null;
  lifecycleStateJson: PlanLifecycleState | null;
};

class FakePlanRepository implements PlanRepository {
  private _plans: Map<string, StoredPlan> = new Map();

  async createRequest(params: {
    planId: PlanId;
    canonicalHash: CanonicalHash;
    positionId: PositionId;
    walletId: WalletId;
    requestedAt: ClockTimestamp;
    action: { kind: string };
    snapshotFingerprint?: string;
  }): Promise<{ kind: 'created' } | { kind: 'exact-replay' } | { kind: 'conflict' }> {
    const existing = Array.from(this._plans.values()).find(
      (p) => p.positionId === params.positionId,
    );
    if (existing) {
      if (existing.canonicalHash === params.canonicalHash) {
        return { kind: 'exact-replay' };
      }
      return { kind: 'conflict' };
    }
    this._plans.set(params.planId, {
      planId: params.planId,
      canonicalHash: params.canonicalHash,
      positionId: params.positionId,
      walletId: params.walletId,
      requestedAt: params.requestedAt,
      respondedAt: null,
      asOfAt: null,
      expiresAt: null,
      actionKind: params.action.kind,
      actionReasons: [],
      snapshotFingerprint: params.snapshotFingerprint,
      lifecycleKind: 'requested',
      decisionKind: null,
      attemptId: null,
      executionOriginJson: null,
      lifecycleStateJson: null,
    });
    return { kind: 'created' };
  }

  async acceptResponse(params: {
    planId: PlanId;
    regimeResponse: { kind: string; regime: string; suitability: string };
    respondedAt: ClockTimestamp;
    asOfAt: ClockTimestamp;
    expiresAt: ClockTimestamp;
  }): Promise<{ kind: 'accepted' } | { kind: 'conflict-detected' }> {
    const plan = Array.from(this._plans.values()).find((p) => p.planId === params.planId);
    if (!plan) return { kind: 'conflict-detected' };
    plan.respondedAt = params.respondedAt;
    plan.asOfAt = params.asOfAt;
    plan.expiresAt = params.expiresAt;
    plan.lifecycleStateJson = {
      kind: 'advisory-ready',
      advisoryAction: { kind: 'HOLD' },
      regimeResponse: {
        kind: 'regime-response',
        regime: params.regimeResponse.regime as 'UP' | 'DOWN' | 'CHOP',
        suitability: params.regimeResponse.suitability as
          | 'ALLOWED'
          | 'CAUTION'
          | 'BLOCKED'
          | 'UNKNOWN',
      },
    };
    return { kind: 'accepted' };
  }

  async getCurrentPlan(positionId: PositionId): Promise<PositionPlan | null> {
    const plan = Array.from(this._plans.values()).find((p) => p.positionId === positionId);
    if (!plan || !plan.lifecycleStateJson) return null;
    return {
      planId: plan.planId,
      canonicalHash: plan.canonicalHash,
      positionId: plan.positionId,
      createdAt: plan.requestedAt,
      state: plan.lifecycleStateJson,
    };
  }

  async recordDecision(_params: {
    planId: PlanId;
    decision: { kind: string };
    decidedAt: ClockTimestamp;
  }): Promise<void> {}
  async linkExecutionAttempt(_params: {
    planId: PlanId;
    attemptId: string;
    linkedAt: ClockTimestamp;
  }): Promise<void> {}
  async commitTerminalOutcome(_params: {
    planId: PlanId;
    outcome: { kind: string };
    canonicalResult: { id: string; payload: Record<string, unknown> };
    resultIdempotencyKey: string;
    committedAt: ClockTimestamp;
  }): Promise<{ kind: 'committed' } | { kind: 'plan-not-found' }> {
    return { kind: 'plan-not-found' };
  }
  async claimDueResult(): Promise<{
    resultId: string;
    planId: PlanId;
    canonicalResult: { id: string; payload: Record<string, unknown> };
    idempotencyKey: string;
    attemptCount: number;
  } | null> {
    return null;
  }
  async rescheduleRetry(_params: {
    resultId: string;
    nextAttemptAt: ClockTimestamp;
    lastError?: string;
  }): Promise<void> {}
  async completeDelivery(_params: {
    resultId: string;
    deliveredAt: ClockTimestamp;
  }): Promise<void> {}
  async recordPermanentFailure(_params: {
    planId: PlanId;
    reason: string;
    failedAt: ClockTimestamp;
  }): Promise<void> {}
  async failDelivery(_params: {
    planId: PlanId;
    resultId: string;
    reason: string;
    failedAt: ClockTimestamp;
    deliveredAt: ClockTimestamp;
  }): Promise<void> {}
  async getPlanActionKind(_planId: PlanId): Promise<string | null> {
    return 'HOLD';
  }
  async updateLifecycleState(_params: {
    planId: PlanId;
    lifecycleState: PlanLifecycleState;
  }): Promise<void> {}
}

const VALID_UPSTREAM_RESPONSE: RegimePlanResponse = {
  schemaVersion: 'position-plan.v1',
  planId: 'plan_upstream_9999',
  planHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
  asOfUnixMs: 1_000_000,
  expiresAtUnixMs: 1_000_000 + 3600000,
  scope: {
    kind: 'position',
    positionId: FIXTURE_POSITION_ID,
    poolAddress: 'test-pool-1',
    symbol: 'SOL/USDC',
  },
  regime: 'UP',
  actions: [{ type: 'HOLD', reasonCode: 'HOLD_POLICY' }],
  constraints: { cooldownUntilUnixMs: 0, standDownUntilUnixMs: 0, notes: [] },
  reasons: [{ code: 'HOLD_POLICY', severity: 'INFO', message: 'Hold' }],
};

class FakeRegimePlanPort implements RegimePlanPort {
  private _response: PlanRequestTransportResult = {
    kind: 'ok',
    response: VALID_UPSTREAM_RESPONSE,
  };
  private _requests: RegimePlanRequest[] = [];

  setResponse(response: PlanRequestTransportResult): void {
    this._response = response;
  }

  getRequests(): readonly RegimePlanRequest[] {
    return this._requests;
  }

  async requestPositionPlan(request: RegimePlanRequest): Promise<PlanRequestTransportResult> {
    this._requests.push(request);
    return this._response;
  }

  async reportExecutionResult(_result: {
    schemaVersion: string;
    planId: string;
  }): Promise<
    | { kind: 'ok' }
    | { kind: 'permanent'; reason: string }
    | { kind: 'retryable-degraded'; reason: string }
  > {
    return { kind: 'ok' };
  }
}

class FakeClockPort implements ClockPort {
  private _now: ClockTimestamp;

  constructor(initialMs = 1_000_000) {
    this._now = makeClockTimestamp(initialMs);
  }

  now(): ClockTimestamp {
    return this._now;
  }

  advance(ms: number): void {
    this._now = makeClockTimestamp(this._now + ms);
  }
}

class FakeObservabilityPort implements ObservabilityPort {
  logs: { level: string; message: string; context?: Record<string, unknown> }[] = [];

  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
    this.logs.push({ level, message, ...(context !== undefined ? { context } : {}) });
  }

  recordTiming(_event: string, _durationMs: number, _tags?: Record<string, string>): void {}
  recordDetectionTiming(_record: {
    positionId: string;
    detectedAt: number;
    observedAt: number;
    durationMs: number;
  }): void {}
  recordDeliveryTiming(_record: {
    triggerId: string;
    dispatchedAt: number;
    deliveredAt: number | null;
    durationMs: number;
    channel: 'push' | 'web-push' | 'in-app';
  }): void {}
}

describe('RequestPositionPlan', () => {
  let positionRead: FakeSupportedPositionReadPort;
  let triggerRepo: FakeTriggerRepository;
  let planRepo: FakePlanRepository;
  let regimePort: FakeRegimePlanPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let clock: FakeClockPort;
  let observability: FakeObservabilityPort;

  beforeEach(() => {
    positionRead = new FakeSupportedPositionReadPort();
    positionRead.setPoolData(mockPoolData);
    triggerRepo = new FakeTriggerRepository();
    planRepo = new FakePlanRepository();
    regimePort = new FakeRegimePlanPort();
    historyRepo = new FakeExecutionHistoryRepository();
    clock = new FakeClockPort(1_000_000);
    observability = new FakeObservabilityPort();
  });

  describe('builds a position-scoped request from authoritative local state', () => {
    it('includes correct position fields from SupportedPositionReadPort', async () => {
      const position = makeBelowRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));
      triggerRepo.setTriggers([]);

      await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      const requests = regimePort.getRequests();
      expect(requests).toHaveLength(1);
      const req = requests[0]!;
      expect(req.position.positionId).toBe(FIXTURE_POSITION_ID);
      expect(req.market.symbol).toBe('SOL/USDC');
    });

    it('does not send candles or client-authored regime state', async () => {
      const position = makeBelowRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));
      triggerRepo.setTriggers([]);

      await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      const requests = regimePort.getRequests();
      expect(requests).toHaveLength(1);
      const req = requests[0]!;
      expect(req.market.symbol).toBe('SOL/USDC');
      expect(req.market.poolAddress).toBe(FIXTURE_POOL_ID);
      expect(req.market.timeframe).toBe('1h');
    });
  });

  describe('upstream identity persistence', () => {
    it('persists response planId and planHash unchanged', async () => {
      const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        const plan = (result as unknown as { plan: { planId: string; planHash: string } }).plan;
        expect(plan.planId).toBe('plan_upstream_9999');
        expect(plan.planHash).toBe(VALID_UPSTREAM_RESPONSE.planHash);
      }
    });

    it('does not generate a local plan identity', async () => {
      const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        const plan = (result as unknown as { plan: { planId: string } }).plan;
        expect(plan.planId).toBe('plan_upstream_9999');
      }
    });

    it('returns the validated remote response for an exact replay', async () => {
      const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));

      await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      const replayResult = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(replayResult.status).toBe('ok');
      if (replayResult.status === 'ok') {
        const plan = (replayResult as unknown as { plan: { planId: string } }).plan;
        expect(plan.planId).toBe('plan_upstream_9999');
      }
    });
  });

  describe('rejects stale position state before calling Regime', () => {
    it('returns stale status when position is too old', async () => {
      const stalePosition = makeStalePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(stalePosition);
      triggerRepo.setTriggers([]);

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('stale');
      expect(regimePort.getRequests()).toHaveLength(0);
    });

    it('returns unavailable when position does not exist', async () => {
      positionRead.setPosition(null);
      triggerRepo.setTriggers([]);

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('unavailable');
      expect(regimePort.getRequests()).toHaveLength(0);
    });

    it('returns unavailable when wallet ownership does not match', async () => {
      const position = makeBelowRangePosition(FIXTURE_POSITION_ID, makeWalletId('other-wallet'));
      positionRead.setPosition(position);
      triggerRepo.setTriggers([]);

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('unavailable');
      expect(regimePort.getRequests()).toHaveLength(0);
    });
  });

  describe('keeps qualified lower breach authoritative during plan outage', () => {
    it('returns superseded-with-breach when lower breach trigger exists and regime times out', async () => {
      const position = makeBelowRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));
      triggerRepo.setTriggers([makeLowerTrigger(FIXTURE_POSITION_ID)]);
      regimePort.setResponse({ kind: 'retryable-degraded', reason: 'timeout' });

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('superseded');
      expect((result as { breachDirection: BreachDirection }).breachDirection.kind).toBe(
        'lower-bound-breach',
      );
    });
  });

  describe('keeps qualified upper breach authoritative over hold', () => {
    it('qualified upper breach remains authoritative over an accepted hold plan', async () => {
      const position = makeAboveRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));
      triggerRepo.setTriggers([makeUpperTrigger(FIXTURE_POSITION_ID)]);

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('superseded');
      expect((result as { breachDirection: BreachDirection }).breachDirection.kind).toBe(
        'upper-bound-breach',
      );
    });
  });

  describe('returns advisory degraded without touching deterministic repositories', () => {
    it('returns degraded when regime is unavailable', async () => {
      const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));
      triggerRepo.setTriggers([]);
      regimePort.setResponse({ kind: 'retryable-degraded', reason: 'timeout' });

      const result = await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      expect(result.status).toBe('degraded');
      expect((result as { reason: string }).reason).toBe('timeout');
      const currentPlan = await planRepo.getCurrentPlan(FIXTURE_POSITION_ID);
      expect(currentPlan).toBeNull();
    });

    it('does not modify trigger repository on regime failure', async () => {
      const position = makeInRangePosition(FIXTURE_POSITION_ID, FIXTURE_WALLET_ID);
      positionRead.setPosition(position);
      positionRead.setDetail(makeFixtureDetail(position));
      const trigger = makeLowerTrigger(FIXTURE_POSITION_ID);
      triggerRepo.setTriggers([trigger]);
      regimePort.setResponse({ kind: 'permanent', reason: 'adapter-disabled' });

      await requestPositionPlan({
        walletId: FIXTURE_WALLET_ID,
        positionId: FIXTURE_POSITION_ID,
        positionReadPort: positionRead,
        triggerRepository: triggerRepo,
        planRepository: planRepo,
        regimePlanPort: regimePort,
        executionHistoryRepository: historyRepo,
        config: CONFIGURED_CONFIG,
        clock,
        observability,
      });

      const triggers = await triggerRepo.listActionableTriggers(FIXTURE_WALLET_ID);
      expect(triggers).toHaveLength(1);
      expect(triggers[0]?.triggerId).toBe(trigger.triggerId);
    });
  });
});
