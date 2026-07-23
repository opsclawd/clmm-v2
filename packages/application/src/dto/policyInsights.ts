export type PolicyInsightMarketRegime = 'UP' | 'DOWN' | 'CHOP';
export type PolicyInsightFundamentalRegime = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNKNOWN';
export type PolicyInsightPosture =
  | 'AGGRESSIVE'
  | 'MODERATELY_AGGRESSIVE'
  | 'NEUTRAL'
  | 'DEFENSIVE'
  | 'PAUSED';
export type PolicyInsightRecommendedAction =
  | 'HOLD'
  | 'MONITOR_LOWER_BOUND'
  | 'MONITOR_UPPER_BOUND'
  | 'EXIT_TO_USDC'
  | 'EXIT_TO_SOL'
  | 'STAND_DOWN';
export type PolicyInsightRiskLevel = 'NORMAL' | 'ELEVATED' | 'CRITICAL';
export type PolicyInsightRangeBias = 'TIGHT' | 'MEDIUM' | 'WIDE' | 'PASSIVE';
export type PolicyInsightRebalanceSensitivity = 'LOW' | 'NORMAL' | 'HIGH' | 'PAUSED';
export type PolicyInsightDataQuality = 'COMPLETE' | 'PARTIAL' | 'STALE';
export type PolicyInsightFreshnessStatus = 'FRESH' | 'STALE';
export type PolicyInsightSelectionStatus = 'FULL' | 'PARTIAL' | 'DEGRADED';

export type PolicyInsightWarningCode =
  | 'MARKET_DATA_HARD_STALE'
  | 'EVIDENCE_STALE_INPUT'
  | 'EVIDENCE_MISSING_FAMILY'
  | 'EVIDENCE_REJECTED_FAMILY'
  | 'EVIDENCE_CONFLICTED_FAMILY'
  | 'EVIDENCE_NO_SELECTED_RESEARCH'
  | 'NO_ELIGIBLE_PRICE_LEVELS';

export type PolicyInsightReasonCode =
  | 'ADVISORY_ONLY'
  | 'DATA_HARD_STALE'
  | 'DATA_INSUFFICIENT_SAMPLES'
  | 'CLMM_BREACH_LOWER'
  | 'CLMM_BREACH_UPPER'
  | 'CHURN_STAND_DOWN_ACTIVE'
  | 'CHURN_COOLDOWN_ACTIVE'
  | 'MARKET_REGIME_UP'
  | 'MARKET_REGIME_DOWN'
  | 'MARKET_REGIME_CHOP'
  | 'FEATURE_THRESHOLD_BREACHED'
  | 'CONTEXTUAL_EVIDENCE_VOTE'
  | 'RESEARCH_BRIEF_ANALYSIS'
  | 'NO_ELIGIBLE_PRICE_LEVELS';

export type PolicyInsightClmmPolicy = {
  rangeBias: PolicyInsightRangeBias;
  rebalanceSensitivity: PolicyInsightRebalanceSensitivity;
  maxCapitalDeploymentBps: number;
};

export type PolicyInsightLevels = {
  supportsUsdcPerSol: string[];
  resistancesUsdcPerSol: string[];
};

export type PolicyInsightPositionScope = {
  network: 'solana-mainnet';
  walletAddress: string;
  whirlpoolAddress: string;
  positionId: string;
} | null;

export type PolicyInsightBundleRef = {
  bundleHash: string;
  publisher: string;
  sourceId: string;
  runId: string;
};

export type PolicyInsightSourceRef = {
  referenceId: string;
  sourceType: 'api' | 'database' | 'chain' | 'document' | 'internal_bundle';
  locator: string;
  observedAt: string;
};

export type PolicyInsightEvidence = {
  selectionStatus: PolicyInsightSelectionStatus;
  selectionPolicyVersion: string;
  selectedBundleRefs: PolicyInsightBundleRef[];
  selectedSourceRefs: PolicyInsightSourceRef[];
};

export type PolicyInsightWarning = {
  code: PolicyInsightWarningCode;
  message: string;
};

export type PolicyInsightFreshness = {
  status: PolicyInsightFreshnessStatus;
  evaluatedAt: string;
  ageSeconds: number;
};

export type PolicyInsightBlock = {
  schemaVersion: 'policy-insight.v1';
  insightId: string;
  rulesetVersion: string;
  pair: 'SOL/USDC';
  position: PolicyInsightPositionScope;
  generatedAt: string;
  asOf: string;
  expiresAt: string;
  marketRegime: PolicyInsightMarketRegime;
  fundamentalRegime: PolicyInsightFundamentalRegime;
  posture: PolicyInsightPosture;
  recommendedAction: PolicyInsightRecommendedAction;
  riskLevel: PolicyInsightRiskLevel;
  clmmPolicy: PolicyInsightClmmPolicy;
  levels: PolicyInsightLevels;
  evidence: PolicyInsightEvidence;
  confidenceBps: number;
  dataQuality: PolicyInsightDataQuality;
  reasonCodes: PolicyInsightReasonCode[];
  reasoning: string;
  warnings: PolicyInsightWarning[];
  freshness: PolicyInsightFreshness;
};

export type PolicyInsightsUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'upstream-error';
