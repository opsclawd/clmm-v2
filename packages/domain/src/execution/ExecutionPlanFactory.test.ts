import { describe, it, expect } from 'vitest';
import { buildExecutionPlan } from './ExecutionPlanFactory.js';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '../shared/index.js';

describe('ExecutionPlanFactory', () => {
  it('builds a downside plan with SOL→USDC swap and ExitToUSDC posture', () => {
    const plan = buildExecutionPlan(LOWER_BOUND_BREACH);
    expect(plan.postExitPosture.kind).toBe('exit-to-usdc');
    expect(plan.swapInstruction.fromAsset).toBe('SOL');
    expect(plan.swapInstruction.toAsset).toBe('USDC');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]?.kind).toBe('remove-liquidity');
    expect(plan.steps[1]?.kind).toBe('collect-fees');
    expect(plan.steps[2]?.kind).toBe('swap-assets');
  });

  it('builds an upside plan with USDC→SOL swap and ExitToSOL posture', () => {
    const plan = buildExecutionPlan(UPPER_BOUND_BREACH);
    expect(plan.postExitPosture.kind).toBe('exit-to-sol');
    expect(plan.swapInstruction.fromAsset).toBe('USDC');
    expect(plan.swapInstruction.toAsset).toBe('SOL');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[2]?.kind).toBe('swap-assets');
  });

  it('plan is never direction-agnostic', () => {
    const downside = buildExecutionPlan(LOWER_BOUND_BREACH);
    const upside = buildExecutionPlan(UPPER_BOUND_BREACH);
    expect(downside.postExitPosture.kind).not.toBe(upside.postExitPosture.kind);
  });
});
