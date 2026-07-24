export type MarketRegime = 'UP' | 'DOWN' | 'CHOP';
export type ClmmSuitabilityStatus = 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';

export type {
  PositionPlan,
  PlanLifecycleState,
  PlanLifecycleEvent,
  PlanAction,
  ExecutionOrigin,
  NonExecutedOutcome,
  RegimeResponse,
  PlanId,
  CanonicalHash,
  ExitIntentPosture,
} from './PositionPlan.js';

export {
  makePositionPlan,
  applyPlanLifecycleTransition,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
} from './PlanLifecycleReducer.js';
