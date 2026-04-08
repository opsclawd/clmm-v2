import type { ExecutionPlan, ExecutionPreview } from '@clmm/domain';
import { buildExecutionPlan } from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

export const FIXTURE_LOWER_EXECUTION_PLAN: ExecutionPlan = buildExecutionPlan(LOWER_BOUND_BREACH);
export const FIXTURE_UPPER_EXECUTION_PLAN: ExecutionPlan = buildExecutionPlan(UPPER_BOUND_BREACH);

const FIXTURE_ESTIMATED_AT = makeClockTimestamp(1_000_000);

export const FIXTURE_FRESH_PREVIEW: ExecutionPreview = {
  plan: FIXTURE_LOWER_EXECUTION_PLAN,
  freshness: { kind: 'fresh', expiresAt: FIXTURE_ESTIMATED_AT + 60_000 },
  estimatedAt: FIXTURE_ESTIMATED_AT,
};

export const FIXTURE_STALE_PREVIEW: ExecutionPreview = {
  plan: FIXTURE_LOWER_EXECUTION_PLAN,
  freshness: { kind: 'stale' },
  estimatedAt: FIXTURE_ESTIMATED_AT,
};

export const FIXTURE_EXPIRED_PREVIEW: ExecutionPreview = {
  plan: FIXTURE_LOWER_EXECUTION_PLAN,
  freshness: { kind: 'expired' },
  estimatedAt: FIXTURE_ESTIMATED_AT,
};
