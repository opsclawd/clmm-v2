import type { BreachDirection, PositionId, ClockTimestamp } from '../shared/index.js';
import type { ExecutionOrigin, PlanId, CanonicalHash } from '../execution/index.js';

export type { BreachDirection, ClockTimestamp };
export type { ExecutionOrigin, PlanId, CanonicalHash } from '../execution/index.js';

export type RegimeResponse = {
  readonly kind: 'regime-response';
  readonly regime: 'UP' | 'DOWN' | 'CHOP';
  readonly suitability: 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
};

export type PlanAction =
  | { readonly kind: 'HOLD' }
  | { readonly kind: 'STAND_DOWN' }
  | { readonly kind: 'REQUEST_EXIT_CLMM' };

export type NonExecutedOutcome =
  | { readonly kind: 'acknowledged' }
  | { readonly kind: 'stand-down' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'position-changed' }
  | { readonly kind: 'rejected' };

export type ExecutedOutcome = { readonly kind: 'executed' } | { readonly kind: 'failed' };

export type ExecutionPlan = {
  readonly steps: readonly { readonly kind: string }[];
  readonly postExitPosture: { readonly kind: 'exit-to-usdc' | 'exit-to-sol' };
  readonly swapInstruction: {
    readonly fromAsset: string;
    readonly toAsset: string;
    readonly policyReason: string;
  };
};

export type PreviewFreshness =
  | { readonly kind: 'fresh'; readonly expiresAt: number }
  | { readonly kind: 'stale' }
  | { readonly kind: 'expired' };

export type PlanLifecycleState =
  | { readonly kind: 'requested' }
  | {
      readonly kind: 'advisory-ready';
      readonly advisoryAction: PlanAction;
      readonly regimeResponse: RegimeResponse;
    }
  | {
      readonly kind: 'exit-previewed';
      readonly advisoryAction: PlanAction;
      readonly preview: {
        readonly plan: ExecutionPlan;
        readonly freshness: PreviewFreshness;
        readonly estimatedAt: number;
      };
      readonly executionOrigin: ExecutionOrigin;
    }
  | {
      readonly kind: 'awaiting-signature';
      readonly advisoryAction: PlanAction;
      readonly executionOrigin: ExecutionOrigin;
    }
  | {
      readonly kind: 'submitted';
      readonly advisoryAction: PlanAction;
      readonly executionOrigin: ExecutionOrigin;
    }
  | {
      readonly kind: 'result-pending';
      readonly outcome: NonExecutedOutcome | ExecutedOutcome;
      readonly executionOrigin: ExecutionOrigin | null;
    }
  | {
      readonly kind: 'reported';
      readonly outcome: ExecutedOutcome;
      readonly executionOrigin: ExecutionOrigin | null;
      readonly reportedAt: ClockTimestamp;
    }
  | {
      readonly kind: 'report-failed';
      readonly outcome: ExecutedOutcome;
      readonly executionOrigin: ExecutionOrigin | null;
    }
  | {
      readonly kind: 'conflict';
      readonly priorPlanId: PlanId;
      readonly canonicalHash: CanonicalHash;
      readonly conflictingHash: CanonicalHash;
    }
  | {
      readonly kind: 'superseded';
      readonly priorPlan: {
        readonly planId: PlanId;
        readonly canonicalHash: CanonicalHash;
        readonly state: PlanLifecycleState;
      };
      readonly breachOrigin: ExecutionOrigin & { readonly kind: 'qualified-breach' };
    };

export type PlanLifecycleEvent =
  | { readonly kind: 'regime-response-received'; readonly regimeResponse: RegimeResponse }
  | { readonly kind: 'acknowledge' }
  | {
      readonly kind: 'preview';
      readonly preview: {
        readonly plan: ExecutionPlan;
        readonly freshness: PreviewFreshness;
        readonly estimatedAt: number;
      };
    }
  | { readonly kind: 'request-signature' }
  | { readonly kind: 'submit' }
  | { readonly kind: 'confirm' }
  | { readonly kind: 'expire' }
  | { readonly kind: 'position-changed' }
  | { readonly kind: 'breach-qualified'; readonly breachDirection: BreachDirection }
  | { readonly kind: 'delivery-success'; readonly reportedAt?: ClockTimestamp }
  | { readonly kind: 'retry-scheduled'; readonly reason: string }
  | { readonly kind: 'permanent-rejection'; readonly reason: string };

export interface PositionPlan {
  readonly planId: PlanId;
  readonly canonicalHash: CanonicalHash;
  readonly positionId: PositionId;
  readonly regimeResponse?: RegimeResponse;
  readonly createdAt: ClockTimestamp;
  readonly state: PlanLifecycleState;
}

export function makePlanId(raw: string): PlanId {
  return raw as PlanId;
}

export function makeCanonicalHash(raw: string): CanonicalHash {
  return raw as CanonicalHash;
}

export function makePositionPlan(params: {
  planId: PlanId;
  canonicalHash: CanonicalHash;
  positionId: PositionId;
  createdAt: ClockTimestamp;
}): PositionPlan {
  return {
    planId: params.planId,
    canonicalHash: params.canonicalHash,
    positionId: params.positionId,
    createdAt: params.createdAt,
    state: { kind: 'requested' },
  };
}
