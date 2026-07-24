import { describe, it, expect, beforeEach } from 'vitest';
import { recordPlanDecision } from './RecordPlanDecision.js';
import type {
  PlanRepository,
  TriggerRepository,
  ClockPort,
  ObservabilityPort,
  PlanDecisionParams,
  PlanOutcome,
} from '../../ports/index.js';
import type {
  PositionPlan,
  PlanId,
  PositionId,
  WalletId,
  ClockTimestamp,
  ExitTrigger,
  PlanLifecycleState,
  CanonicalHash,
  PlanAction,
  RegimeResponse,
} from '@clmm/domain';
import { makeWalletId, makePositionId, makeClockTimestamp, LOWER_BOUND_BREACH } from '@clmm/domain';

const FIXTURE_WALLET_ID = makeWalletId('test-wallet-1');
const FIXTURE_POSITION_ID = makePositionId('test-position-1');
const FIXTURE_PLAN_ID = 'test-plan-1' as PlanId;
const FIXTURE_CANONICAL_HASH = 'test-hash-1' as CanonicalHash;

function makeAdvisoryReadyPlan(params: {
  planId?: PlanId;
  positionId?: PositionId;
  walletId?: WalletId;
  action?: PlanAction;
  regimeResponse?: RegimeResponse;
  expiresAt?: ClockTimestamp;
}): PositionPlan {
  const {
    planId = FIXTURE_PLAN_ID,
    positionId = FIXTURE_POSITION_ID,
    action = { kind: 'HOLD' },
    regimeResponse = { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
  } = params;

  return {
    planId,
    canonicalHash: FIXTURE_CANONICAL_HASH,
    positionId,
    regimeResponse,
    createdAt: makeClockTimestamp(Date.now() - 1000),
    state: {
      kind: 'advisory-ready',
      advisoryAction: action,
      regimeResponse,
    } as PlanLifecycleState,
  };
}

function makeExpiredPlan(params: {
  planId?: PlanId;
  positionId?: PositionId;
  walletId?: WalletId;
  action?: PlanAction;
}): PositionPlan {
  const {
    planId = FIXTURE_PLAN_ID,
    positionId = FIXTURE_POSITION_ID,
    action = { kind: 'HOLD' },
  } = params;

  return {
    planId,
    canonicalHash: FIXTURE_CANONICAL_HASH,
    positionId,
    createdAt: makeClockTimestamp(Date.now() - 7200_000),
    state: {
      kind: 'advisory-ready',
      advisoryAction: action,
      regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
      expiresAt: makeClockTimestamp(Date.now() - 1000),
    } as PlanLifecycleState,
  };
}

function makeLowerTrigger(positionId: PositionId): ExitTrigger {
  return {
    triggerId: 'trigger-1' as import('@clmm/domain').ExitTriggerId,
    positionId,
    breachDirection: LOWER_BOUND_BREACH,
    triggeredAt: makeClockTimestamp(1_000_000),
    confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
    confirmationPassed: true,
    episodeId: 'episode-1' as import('@clmm/domain').BreachEpisodeId,
  };
}

class FakePlanRepository implements PlanRepository {
  private _plans = new Map<string, PositionPlan>();
  private _decisions = new Map<string, PlanDecisionParams>();
  private _outcomes = new Map<string, PlanOutcome>();

  async createRequest(): Promise<import('@clmm/application').PlanRequestResult> {
    return { kind: 'created' };
  }

  async acceptResponse(): Promise<{ kind: 'accepted' } | { kind: 'conflict-detected' }> {
    return { kind: 'accepted' };
  }

  async getCurrentPlan(positionId: PositionId): Promise<PositionPlan | null> {
    return this._plans.get(positionId) ?? null;
  }

  async recordDecision(params: PlanDecisionParams): Promise<void> {
    const plan = Array.from(this._plans.values()).find((p) => p.planId === params.planId);
    if (plan) {
      plan.state = {
        kind: 'result-pending',
        outcome: params.decision,
        executionOrigin: null,
      } as PlanLifecycleState;
    }
    this._decisions.set(params.planId, params);
    this._outcomes.set(params.planId, params.decision);
  }

  async linkExecutionAttempt(): Promise<void> {}

  async commitTerminalOutcome(): Promise<import('@clmm/application').TerminalOutcomeCommitResult> {
    return { kind: 'committed' };
  }

  async claimDueResult(): Promise<import('@clmm/application').PlanResultClaim | null> {
    return null;
  }

  async rescheduleRetry(): Promise<void> {}

  async completeDelivery(): Promise<void> {}

  async recordPermanentFailure(): Promise<void> {}

  async updateLifecycleState(): Promise<void> {}

  setPlan(plan: PositionPlan): void {
    this._plans.set(plan.positionId, plan);
  }

  getDecision(planId: PlanId): PlanDecisionParams | undefined {
    return this._decisions.get(planId);
  }

  getOutcome(planId: PlanId): PlanOutcome | undefined {
    return this._outcomes.get(planId);
  }

  getCreatedOutboxEntries(): Array<{
    planId: PlanId;
    canonicalResult: import('@clmm/application').CanonicalResult;
  }> {
    return [];
  }
}

class FakeTriggerRepository implements TriggerRepository {
  private _triggers = new Map<string, ExitTrigger>();

  async getTrigger(): Promise<ExitTrigger | null> {
    return null;
  }

  async listActionableTriggers(_walletId: WalletId): Promise<ExitTrigger[]> {
    return Array.from(this._triggers.values()).filter((t) => t.confirmationPassed);
  }

  async deleteTrigger(): Promise<void> {}

  addTrigger(trigger: ExitTrigger): void {
    this._triggers.set(trigger.triggerId, trigger);
  }

  clearTriggers(): void {
    this._triggers.clear();
  }
}

class FakeClock implements ClockPort {
  private _now: number;

  constructor(now?: number) {
    this._now = now ?? Date.now();
  }

  now(): number {
    return this._now;
  }

  setNow(now: number): void {
    this._now = now;
  }
}

class FakeObservability implements ObservabilityPort {
  logs: Array<{ level: string; message: string; data?: Record<string, unknown> }> = [];

  log(level: string, message: string, data?: Record<string, unknown>): void {
    this.logs.push({ level, message, data });
  }
}

describe('RecordPlanDecision', () => {
  let planRepo: FakePlanRepository;
  let triggerRepo: FakeTriggerRepository;
  let clock: FakeClock;
  let observability: FakeObservability;

  beforeEach(() => {
    planRepo = new FakePlanRepository();
    triggerRepo = new FakeTriggerRepository();
    clock = new FakeClock();
    observability = new FakeObservability();
  });

  describe('acknowledges hold without on-chain work', () => {
    it('persists acknowledged outcome for HOLD action', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'HOLD' } });
      planRepo.setPlan(plan);

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(result.kind).toBe('recorded');
      const savedOutcome = planRepo.getOutcome(plan.planId);
      expect(savedOutcome).toEqual({ kind: 'acknowledged' });
    });

    it('creates no preview, attempt, signature request, or submission', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'HOLD' } });
      planRepo.setPlan(plan);

      let onChainWorkInvoked = false;
      const originalCommitTerminalOutcome = planRepo.commitTerminalOutcome.bind(planRepo);

      // Override to detect on-chain work
      planRepo.commitTerminalOutcome = async () => {
        onChainWorkInvoked = true;
        return originalCommitTerminalOutcome();
      };

      await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(onChainWorkInvoked).toBe(false);
    });
  });

  describe('acknowledges stand-down without suppressing a qualified breach', () => {
    it('persists decision before checking for breach supersession', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'STAND_DOWN' } });
      planRepo.setPlan(plan);

      const trigger = makeLowerTrigger(plan.positionId);
      triggerRepo.addTrigger(trigger);

      let decisionPersisted = false;
      const originalRecordDecision = planRepo.recordDecision.bind(planRepo);
      planRepo.recordDecision = async (params) => {
        decisionPersisted = true;
        return originalRecordDecision(params);
      };

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'stand-down' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(decisionPersisted).toBe(true);
      expect(result.kind).toBe('breach-supersedes');
      expect(result.breachDirection).toEqual(LOWER_BOUND_BREACH);
    });

    it('returns breach-supersedes when qualified breach exists for stand-down', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'STAND_DOWN' } });
      planRepo.setPlan(plan);

      const trigger = makeLowerTrigger(plan.positionId);
      triggerRepo.addTrigger(trigger);

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'stand-down' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(result.kind).toBe('breach-supersedes');
      expect(result.breachDirection).toEqual(LOWER_BOUND_BREACH);
    });
  });

  describe('persists result before delivery', () => {
    it('records decision before returning success', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'HOLD' } });
      planRepo.setPlan(plan);

      let decisionPersisted = false;
      const originalRecordDecision = planRepo.recordDecision.bind(planRepo);

      planRepo.recordDecision = async (params) => {
        decisionPersisted = true;
        return originalRecordDecision(params);
      };

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(decisionPersisted).toBe(true);
      expect(result.kind).toBe('recorded');
    });
  });

  describe('replays the same acknowledgement idempotently', () => {
    it('returns same result identity when re-acknowledging same decision', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'HOLD' } });
      planRepo.setPlan(plan);

      const result1 = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      const result2 = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(result1.kind).toBe('recorded');
      expect(result2.kind).toBe('recorded');
      expect(result1.resultId).toBe(result2.resultId);
    });
  });

  describe('rejects a conflicting second decision', () => {
    it('fails when acknowledging HOLD after previously acknowledging stand-down', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'STAND_DOWN' } });
      planRepo.setPlan(plan);

      await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'stand-down' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(result.kind).toBe('conflict-detected');
    });

    it('fails when acknowledging stand-down after previously acknowledging', async () => {
      const plan = makeAdvisoryReadyPlan({ action: { kind: 'HOLD' } });
      planRepo.setPlan(plan);

      await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'stand-down' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(result.kind).toBe('conflict-detected');
    });
  });

  describe('records canonical expiry without execution', () => {
    it('enqueues expired outcome for expired plan', async () => {
      const plan = makeExpiredPlan({ action: { kind: 'HOLD' } });
      planRepo.setPlan(plan);

      const result = await recordPlanDecision({
        planId: plan.planId,
        positionId: plan.positionId,
        walletId: FIXTURE_WALLET_ID,
        decision: { kind: 'acknowledged' },
        planRepository: planRepo,
        triggerRepository: triggerRepo,
        clock,
        observability,
      });

      expect(result.kind).toBe('recorded');
      const savedOutcome = planRepo.getOutcome(plan.planId);
      expect(savedOutcome).toEqual({ kind: 'expired' });
    });
  });
});
