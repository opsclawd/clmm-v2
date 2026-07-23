export type MarketRegime = 'UP' | 'DOWN' | 'CHOP';
export type ClmmSuitabilityStatus = 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';

export type {
  PositionPlan,
  PlanLifecycleState,
  PlanLifecycleEvent,
  ExecutionOrigin,
  AdvisoryAction,
  NonExecutedOutcome,
  RegimeResponse,
  PlanId,
  CanonicalHash,
} from './PlanLifecycleReducer.js';

export {
  makePositionPlan,
  applyPlanLifecycleTransition,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from './PlanLifecycleReducer.js';
