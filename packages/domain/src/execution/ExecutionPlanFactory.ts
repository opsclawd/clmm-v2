import type { BreachDirection } from '../shared/index.js';
import { applyDirectionalExitPolicy } from '../exit-policy/DirectionalExitPolicyService.js';
import type { ExecutionPlan } from './index.js';

export function buildExecutionPlan(direction: BreachDirection): ExecutionPlan {
  const policy = applyDirectionalExitPolicy(direction);
  return {
    steps: policy.executionStepSkeleton,
    postExitPosture: policy.postExitPosture,
    swapInstruction: policy.swapInstruction,
  };
}
