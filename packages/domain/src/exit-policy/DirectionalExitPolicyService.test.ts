import { describe, it, expect } from 'vitest';
import { applyDirectionalExitPolicy } from './DirectionalExitPolicyService.js';
import {
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  type BreachDirection,
} from '../shared/index.js';

describe('DirectionalExitPolicyService', () => {
  describe('LOWER BOUND BREACH → ExitToUSDC + SOL→USDC swap', () => {
    const result = applyDirectionalExitPolicy(LOWER_BOUND_BREACH);

    it('produces exit-to-usdc posture', () => {
      expect(result.postExitPosture.kind).toBe('exit-to-usdc');
    });

    it('swap instruction is SOL → USDC', () => {
      expect(result.swapInstruction.fromAsset).toBe('SOL');
      expect(result.swapInstruction.toAsset).toBe('USDC');
    });

    it('swap instruction includes policyReason', () => {
      expect(result.swapInstruction.policyReason).toBeTruthy();
      expect(result.swapInstruction.policyReason.toLowerCase()).toContain('lower');
    });

    it('step order is: remove-liquidity, collect-fees, swap-assets', () => {
      const kinds = result.executionStepSkeleton.map((s) => s.kind);
      expect(kinds).toEqual(['remove-liquidity', 'collect-fees', 'swap-assets']);
    });

    it('swap step carries the SOL→USDC instruction', () => {
      const swapStep = result.executionStepSkeleton[2];
      expect(swapStep?.kind).toBe('swap-assets');
      if (swapStep?.kind === 'swap-assets') {
        expect(swapStep.instruction.fromAsset).toBe('SOL');
        expect(swapStep.instruction.toAsset).toBe('USDC');
      }
    });
  });

  describe('UPPER BOUND BREACH → ExitToSOL + USDC→SOL swap', () => {
    const result = applyDirectionalExitPolicy(UPPER_BOUND_BREACH);

    it('produces exit-to-sol posture', () => {
      expect(result.postExitPosture.kind).toBe('exit-to-sol');
    });

    it('swap instruction is USDC → SOL', () => {
      expect(result.swapInstruction.fromAsset).toBe('USDC');
      expect(result.swapInstruction.toAsset).toBe('SOL');
    });

    it('swap instruction includes policyReason', () => {
      expect(result.swapInstruction.policyReason).toBeTruthy();
      expect(result.swapInstruction.policyReason.toLowerCase()).toContain('upper');
    });

    it('step order is: remove-liquidity, collect-fees, swap-assets', () => {
      const kinds = result.executionStepSkeleton.map((s) => s.kind);
      expect(kinds).toEqual(['remove-liquidity', 'collect-fees', 'swap-assets']);
    });

    it('swap step carries the USDC→SOL instruction', () => {
      const swapStep = result.executionStepSkeleton[2];
      expect(swapStep?.kind).toBe('swap-assets');
      if (swapStep?.kind === 'swap-assets') {
        expect(swapStep.instruction.fromAsset).toBe('USDC');
        expect(swapStep.instruction.toAsset).toBe('SOL');
      }
    });
  });

  describe('exhaustive direction coverage', () => {
    const directions: BreachDirection[] = [LOWER_BOUND_BREACH, UPPER_BOUND_BREACH];

    it('every BreachDirection kind produces a non-generic result', () => {
      for (const direction of directions) {
        const result = applyDirectionalExitPolicy(direction);
        // Neither result may be direction-agnostic
        if (direction.kind === 'lower-bound-breach') {
          expect(result.postExitPosture.kind).toBe('exit-to-usdc');
          expect(result.swapInstruction.fromAsset).toBe('SOL');
        } else {
          expect(result.postExitPosture.kind).toBe('exit-to-sol');
          expect(result.swapInstruction.fromAsset).toBe('USDC');
        }
      }
    });

    it('lower-bound and upper-bound results are never identical', () => {
      const lower = applyDirectionalExitPolicy(LOWER_BOUND_BREACH);
      const upper = applyDirectionalExitPolicy(UPPER_BOUND_BREACH);
      expect(lower.postExitPosture.kind).not.toBe(upper.postExitPosture.kind);
      expect(lower.swapInstruction.fromAsset).not.toBe(upper.swapInstruction.fromAsset);
    });
  });
});
