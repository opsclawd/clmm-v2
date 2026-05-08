// Drift guard: this DTO is structurally validated by
// packages/adapters/src/outbound/regime-engine/CurrentPolicyInsightsAdapter.ts
// AND by apps/app/src/api/policyInsights.ts. Any field added or removed
// here MUST be reflected in both validators and the upstream contract
// section of the implementation plan. Application MUST NOT import from
// adapters or apps.

export type PolicyInsightRecommendedAction =
  | 'hold'
  | 'watch'
  | 'tighten_range'
  | 'widen_range'
  | 'exit_range'
  | 'pause_rebalances';

export type PolicyInsightConfidence = 'low' | 'medium' | 'high';
export type PolicyInsightRiskLevel = 'normal' | 'elevated' | 'critical';
export type PolicyInsightDataQuality = 'complete' | 'partial' | 'stale';
export type PolicyInsightStatus = 'FRESH' | 'STALE';

export type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error';

export type PolicyInsightClmmPolicy = {
  posture: string;
  rangeBias: string;
  rebalanceSensitivity: string;
  maxCapitalDeploymentPct: number;
};

export type PolicyInsightLevels = {
  supports: number[];
  resistances: number[];
};

export type PolicyInsightFreshness = {
  capturedAtUnixMs: number;
  stale: boolean;
};

export type PolicyInsightBlock = {
  schemaVersion: '1.0';
  pair: 'SOL/USDC';
  asOf: string;
  source: 'openclaw';
  runId: string;
  status: PolicyInsightStatus;
  marketRegime: string;
  fundamentalRegime: string;
  recommendedAction: PolicyInsightRecommendedAction;
  confidence: PolicyInsightConfidence;
  riskLevel: PolicyInsightRiskLevel;
  dataQuality: PolicyInsightDataQuality;
  clmmPolicy: PolicyInsightClmmPolicy;
  levels: PolicyInsightLevels;
  reasoning: string[];
  sourceRefs: string[];
  expiresAt: string;
  payloadHash: string;
  receivedAtIso: string;
  freshness: PolicyInsightFreshness;
};
