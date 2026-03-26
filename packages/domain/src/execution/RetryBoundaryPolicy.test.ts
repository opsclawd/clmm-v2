import { describe, it, expect } from 'vitest';
import { evaluateRetryEligibility } from './RetryBoundaryPolicy.js';
import type { ExecutionAttempt } from './index.js';

const baseAttempt: ExecutionAttempt = {
  lifecycleState: { kind: 'failed' },
  completedSteps: [],
  transactionReferences: [],
};

describe('RetryBoundaryPolicy', () => {
  describe('full retry allowed when no chain step confirmed', () => {
    it('eligible after failed with no completed steps', () => {
      const result = evaluateRetryEligibility(baseAttempt);
      expect(result.kind).toBe('eligible');
    });

    it('eligible after expired with no completed steps', () => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind: 'expired' },
      });
      expect(result.kind).toBe('eligible');
    });
  });

  describe('retry BLOCKED after partial completion', () => {
    it('ineligible when in partial state', () => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind: 'partial' },
        completedSteps: ['remove-liquidity'],
      });
      expect(result.kind).toBe('ineligible');
      if (result.kind === 'ineligible') {
        expect(result.reason).toContain('partial');
      }
    });

    it('ineligible when failed but chain steps already confirmed', () => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind: 'failed' },
        completedSteps: ['remove-liquidity'],
      });
      expect(result.kind).toBe('ineligible');
    });
  });

  describe('terminal states block retry permanently', () => {
    it.each([
      { kind: 'confirmed' as const },
      { kind: 'abandoned' as const },
    ])('$kind is ineligible', ({ kind }) => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind },
      });
      expect(result.kind).toBe('ineligible');
    });
  });

  describe('in-flight states block retry', () => {
    it.each([
      { kind: 'awaiting-signature' as const },
      { kind: 'submitted' as const },
    ])('$kind is ineligible', ({ kind }) => {
      const result = evaluateRetryEligibility({
        ...baseAttempt,
        lifecycleState: { kind },
      });
      expect(result.kind).toBe('ineligible');
    });
  });
});
