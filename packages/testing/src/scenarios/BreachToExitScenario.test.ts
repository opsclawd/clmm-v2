import { describe, it, expect } from 'vitest';
import { runBreachToExitScenario } from './BreachToExitScenario.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';

describe('Breach-to-Exit Smoke Scenario', () => {
  describe('LOWER BOUND BREACH end-to-end', () => {
    it('scan → qualify → preview → approve → result: downside exits to USDC via SOL→USDC swap', async () => {
      const result = await runBreachToExitScenario({ direction: LOWER_BOUND_BREACH });
      expect(result.previewPosture.kind).toBe('exit-to-usdc');
      expect(result.swapInstruction.fromAsset).toBe('SOL');
      expect(result.swapInstruction.toAsset).toBe('USDC');
      expect(result.approvalOutcome.kind).toBe('submitted');
    });
  });

  describe('UPPER BOUND BREACH end-to-end', () => {
    it('scan → qualify → preview → approve → result: upside exits to SOL via USDC→SOL swap', async () => {
      const result = await runBreachToExitScenario({ direction: UPPER_BOUND_BREACH });
      expect(result.previewPosture.kind).toBe('exit-to-sol');
      expect(result.swapInstruction.fromAsset).toBe('USDC');
      expect(result.swapInstruction.toAsset).toBe('SOL');
      expect(result.approvalOutcome.kind).toBe('submitted');
    });
  });

  describe('invariant: lower and upper are always different', () => {
    it('downside and upside produce different postures and swap directions', async () => {
      const lower = await runBreachToExitScenario({ direction: LOWER_BOUND_BREACH });
      const upper = await runBreachToExitScenario({ direction: UPPER_BOUND_BREACH });
      expect(lower.previewPosture.kind).not.toBe(upper.previewPosture.kind);
      expect(lower.swapInstruction.fromAsset).not.toBe(upper.swapInstruction.fromAsset);
    });
  });
});
