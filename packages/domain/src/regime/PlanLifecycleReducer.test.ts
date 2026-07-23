import { describe, it, expect } from 'vitest';
import {
  applyPlanLifecycleTransition,
  LOWER_BOUND_BREACH,
  type PositionPlan,
  type PlanLifecycleState,
  type ExecutionOrigin,
  type ClockTimestamp,
  makePlanId,
  makeCanonicalHash,
} from './PlanLifecycleReducer.js';

function createPlan(overrides: Partial<PositionPlan> = {}): PositionPlan {
  return {
    planId: makePlanId('plan-001'),
    canonicalHash: makeCanonicalHash('abc123'),
    positionId: 'pos-001' as PositionPlan['positionId'],
    createdAt: 1000 as PositionPlan['createdAt'],
    state: { kind: 'requested' },
    ...overrides,
  };
}

function getStateKind(state: PlanLifecycleState): string {
  return state.kind;
}

function isAdvisoryReady(
  state: PlanLifecycleState,
): state is Extract<PlanLifecycleState, { kind: 'advisory-ready' }> {
  return state.kind === 'advisory-ready';
}

function isResultPending(
  state: PlanLifecycleState,
): state is Extract<PlanLifecycleState, { kind: 'result-pending' }> {
  return state.kind === 'result-pending';
}

function isSuperseded(
  state: PlanLifecycleState,
): state is Extract<PlanLifecycleState, { kind: 'superseded' }> {
  return state.kind === 'superseded';
}

function isExitPreviewed(
  state: PlanLifecycleState,
): state is Extract<PlanLifecycleState, { kind: 'exit-previewed' }> {
  return state.kind === 'exit-previewed';
}

function isRegimePlanOrigin(
  origin: ExecutionOrigin,
): origin is Extract<ExecutionOrigin, { kind: 'regime-plan' }> {
  return origin.kind === 'regime-plan';
}

describe('PlanLifecycleReducer', () => {
  describe('transitions a valid requested plan to advisory-ready', () => {
    it('requested + regime-response(HOLD) → advisory-ready(HOLD)', () => {
      const plan = createPlan();
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'regime-response-received',
        regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
      });
      expect(getStateKind(result.state)).toBe('advisory-ready');
      if (isAdvisoryReady(result.state)) {
        expect(result.state.advisoryAction.kind).toBe('HOLD');
      }
    });

    it('requested + regime-response(STAND_DOWN) → advisory-ready(STAND_DOWN)', () => {
      const plan = createPlan();
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'regime-response-received',
        regimeResponse: { kind: 'regime-response', regime: 'CHOP', suitability: 'CAUTION' },
      });
      expect(getStateKind(result.state)).toBe('advisory-ready');
      if (isAdvisoryReady(result.state)) {
        expect(result.state.advisoryAction.kind).toBe('STAND_DOWN');
      }
    });

    it('requested + regime-response(REQUEST_EXIT_CLMM) → advisory-ready(REQUEST_EXIT_CLMM)', () => {
      const plan = createPlan();
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'regime-response-received',
        regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
      });
      expect(getStateKind(result.state)).toBe('advisory-ready');
      if (isAdvisoryReady(result.state)) {
        expect(result.state.advisoryAction.kind).toBe('REQUEST_EXIT_CLMM');
      }
    });
  });

  describe('keeps exact response replay idempotent', () => {
    it('same planId + same regimeResponse preserves advisory-ready', () => {
      const existingPlan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(existingPlan, {
        kind: 'regime-response-received',
        regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
      });
      expect(getStateKind(result.state)).toBe('advisory-ready');
      expect(result).toBe(existingPlan);
    });
  });

  describe('fails closed on same plan id with different content', () => {
    it('advisory-ready + different regimeResponse → conflict', () => {
      const existingPlan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(existingPlan, {
        kind: 'regime-response-received',
        regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
      });
      expect(getStateKind(result.state)).toBe('conflict');
    });
  });

  describe('acknowledges hold without creating execution', () => {
    it('advisory-ready(HOLD) + acknowledge → result-pending with null executionOrigin', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      expect(getStateKind(result.state)).toBe('result-pending');
      if (isResultPending(result.state)) {
        expect(result.state.outcome.kind).toBe('acknowledged');
        expect(result.state.executionOrigin).toBeNull();
      }
    });

    it('advisory-ready(STAND_DOWN) + acknowledge → result-pending with null executionOrigin', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'STAND_DOWN' },
          regimeResponse: { kind: 'regime-response', regime: 'CHOP', suitability: 'CAUTION' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      expect(getStateKind(result.state)).toBe('result-pending');
      if (isResultPending(result.state)) {
        expect(result.state.outcome.kind).toBe('stand-down');
        expect(result.state.executionOrigin).toBeNull();
      }
    });
  });

  describe('supersedes advisory work when a breach qualifies', () => {
    it('advisory-ready + breach-qualified → superseded with breachOrigin', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'breach-qualified',
        breachDirection: LOWER_BOUND_BREACH,
      });
      expect(getStateKind(result.state)).toBe('superseded');
      if (isSuperseded(result.state)) {
        expect(result.state.priorPlan.state.kind).toBe('advisory-ready');
        expect(result.state.breachOrigin.kind).toBe('qualified-breach');
        expect(result.state.breachOrigin.breachDirection.kind).toBe('lower-bound-breach');
      }
    });
  });

  describe('prevents execution after expiry or material position change', () => {
    it('advisory-ready + expire → result-pending with expired outcome', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, { kind: 'expire' });
      expect(getStateKind(result.state)).toBe('result-pending');
      if (isResultPending(result.state)) {
        expect(result.state.outcome.kind).toBe('expired');
        expect(result.state.executionOrigin).toBeNull();
      }
    });

    it('advisory-ready + position-changed → result-pending with position-changed outcome', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, { kind: 'position-changed' });
      expect(getStateKind(result.state)).toBe('result-pending');
      if (isResultPending(result.state)) {
        expect(result.state.outcome.kind).toBe('position-changed');
        expect(result.state.executionOrigin).toBeNull();
      }
    });
  });

  describe('keeps retryable result delivery pending', () => {
    it('result-pending + delivery-success → reported', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const pendingPlan = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      const result = applyPlanLifecycleTransition(pendingPlan, {
        kind: 'delivery-success',
        reportedAt: 2000 as ClockTimestamp,
      });
      expect(getStateKind(result.state)).toBe('reported');
    });

    it('result-pending + retry-scheduled → result-pending remains', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const pendingPlan = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      const result = applyPlanLifecycleTransition(pendingPlan, {
        kind: 'retry-scheduled',
        reason: 'network error',
      });
      expect(getStateKind(result.state)).toBe('result-pending');
    });

    it('result-pending + permanent-rejection → report-failed', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const pendingPlan = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      const result = applyPlanLifecycleTransition(pendingPlan, {
        kind: 'permanent-rejection',
        reason: 'user declined',
      });
      expect(getStateKind(result.state)).toBe('report-failed');
    });
  });

  describe('rejects duplicate execution from a terminal plan', () => {
    it('reported plan rejects preview', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const acknowledgedPlan = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      const reportedPlan = applyPlanLifecycleTransition(acknowledgedPlan, {
        kind: 'delivery-success',
        reportedAt: 2000 as ClockTimestamp,
      });
      expect(() =>
        applyPlanLifecycleTransition(reportedPlan, {
          kind: 'preview',
          preview: {
            plan: {
              steps: [],
              postExitPosture: { kind: 'exit-to-usdc' },
              swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
            },
            freshness: { kind: 'fresh', expiresAt: 3000 },
            estimatedAt: 2500,
          },
        }),
      ).toThrow();
    });

    it('conflict plan rejects preview', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const conflictPlan = applyPlanLifecycleTransition(plan, {
        kind: 'regime-response-received',
        regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
      });
      expect(() =>
        applyPlanLifecycleTransition(conflictPlan, {
          kind: 'preview',
          preview: {
            plan: {
              steps: [],
              postExitPosture: { kind: 'exit-to-usdc' },
              swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
            },
            freshness: { kind: 'fresh', expiresAt: 3000 },
            estimatedAt: 2500,
          },
        }),
      ).toThrow();
    });

    it('report-failed plan rejects preview', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const pendingPlan = applyPlanLifecycleTransition(plan, { kind: 'acknowledge' });
      const failedPlan = applyPlanLifecycleTransition(pendingPlan, {
        kind: 'permanent-rejection',
        reason: 'user declined',
      });
      expect(() =>
        applyPlanLifecycleTransition(failedPlan, {
          kind: 'preview',
          preview: {
            plan: {
              steps: [],
              postExitPosture: { kind: 'exit-to-usdc' },
              swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
            },
            freshness: { kind: 'fresh', expiresAt: 3000 },
            estimatedAt: 2500,
          },
        }),
      ).toThrow();
    });
  });

  describe('keeps breach and regime-plan execution origins disjoint', () => {
    it('qualified-breach origin has real BreachDirection', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'HOLD' },
          regimeResponse: { kind: 'regime-response', regime: 'UP', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'breach-qualified',
        breachDirection: LOWER_BOUND_BREACH,
      });
      expect(getStateKind(result.state)).toBe('superseded');
      if (isSuperseded(result.state)) {
        expect(result.state.breachOrigin.kind).toBe('qualified-breach');
        expect(result.state.breachOrigin.breachDirection).toBe(LOWER_BOUND_BREACH);
      }
    });

    it('regime-plan origin has planId and canonicalExitIntent', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'preview',
        preview: {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'fresh', expiresAt: 3000 },
          estimatedAt: 2500,
        },
      });
      expect(getStateKind(result.state)).toBe('exit-previewed');
      if (isExitPreviewed(result.state) && isRegimePlanOrigin(result.state.executionOrigin)) {
        expect(result.state.executionOrigin.kind).toBe('regime-plan');
        expect(result.state.executionOrigin.planId).toBe(plan.planId);
        expect(result.state.executionOrigin.canonicalExitIntent).toBe('exit-to-usdc');
      }
    });
  });

  describe('advisory-ready(REQUEST_EXIT_CLMM) + preview flow', () => {
    it('advisory-ready(REQUEST_EXIT_CLMM) + preview → exit-previewed', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
      const result = applyPlanLifecycleTransition(plan, {
        kind: 'preview',
        preview: {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'fresh', expiresAt: 3000 },
          estimatedAt: 2500,
        },
      });
      expect(getStateKind(result.state)).toBe('exit-previewed');
      if (isExitPreviewed(result.state)) {
        expect(result.state.executionOrigin.kind).toBe('regime-plan');
      }
    });

    it('exit-previewed + request-signature → awaiting-signature', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
      const previewedPlan = applyPlanLifecycleTransition(plan, {
        kind: 'preview',
        preview: {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'fresh', expiresAt: 3000 },
          estimatedAt: 2500,
        },
      });
      const result = applyPlanLifecycleTransition(previewedPlan, { kind: 'request-signature' });
      expect(getStateKind(result.state)).toBe('awaiting-signature');
    });

    it('awaiting-signature + submit → submitted', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
      const previewedPlan = applyPlanLifecycleTransition(plan, {
        kind: 'preview',
        preview: {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'fresh', expiresAt: 3000 },
          estimatedAt: 2500,
        },
      });
      const awaitingPlan = applyPlanLifecycleTransition(previewedPlan, {
        kind: 'request-signature',
      });
      const result = applyPlanLifecycleTransition(awaitingPlan, { kind: 'submit' });
      expect(getStateKind(result.state)).toBe('submitted');
    });

    it('submitted + confirm → result-pending with regime-plan origin', () => {
      const plan = createPlan({
        state: {
          kind: 'advisory-ready',
          advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
          regimeResponse: { kind: 'regime-response', regime: 'DOWN', suitability: 'ALLOWED' },
        },
      });
      const previewedPlan = applyPlanLifecycleTransition(plan, {
        kind: 'preview',
        preview: {
          plan: {
            steps: [],
            postExitPosture: { kind: 'exit-to-usdc' },
            swapInstruction: { fromAsset: 'SOL', toAsset: 'USDC', policyReason: '' },
          },
          freshness: { kind: 'fresh', expiresAt: 3000 },
          estimatedAt: 2500,
        },
      });
      const awaitingPlan = applyPlanLifecycleTransition(previewedPlan, {
        kind: 'request-signature',
      });
      const submittedPlan = applyPlanLifecycleTransition(awaitingPlan, { kind: 'submit' });
      const result = applyPlanLifecycleTransition(submittedPlan, { kind: 'confirm' });
      expect(getStateKind(result.state)).toBe('result-pending');
      if (
        isResultPending(result.state) &&
        result.state.executionOrigin !== null &&
        isRegimePlanOrigin(result.state.executionOrigin)
      ) {
        expect(result.state.executionOrigin.kind).toBe('regime-plan');
      }
    });
  });
});
