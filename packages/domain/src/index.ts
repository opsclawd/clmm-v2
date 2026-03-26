// Shared value objects
export * from './shared/index.js';

// Positions + range state
export * from './positions/index.js';

// Triggers
export * from './triggers/index.js';
export { qualifyTrigger } from './triggers/TriggerQualificationService.js';
export type {
  BreachObservation,
  TriggerQualificationResult,
} from './triggers/TriggerQualificationService.js';

// Exit policy — THE CORE INVARIANT
export { applyDirectionalExitPolicy } from './exit-policy/DirectionalExitPolicyService.js';
export type { DirectionalExitPolicyResult } from './exit-policy/DirectionalExitPolicyService.js';

// Execution types + factories + policies
export * from './execution/index.js';
export { buildExecutionPlan } from './execution/ExecutionPlanFactory.js';
export { evaluatePreviewFreshness } from './execution/PreviewFreshnessPolicy.js';
export { evaluateRetryEligibility } from './execution/RetryBoundaryPolicy.js';
export { applyLifecycleTransition } from './execution/ExecutionStateReducer.js';

// History
export * from './history/index.js';
