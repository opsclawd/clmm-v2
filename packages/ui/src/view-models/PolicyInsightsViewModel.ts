import type {
  PolicyInsightBlock,
  PolicyInsightMarketRegime,
  PolicyInsightFundamentalRegime,
  PolicyInsightPosture,
  PolicyInsightRangeBias,
  PolicyInsightRebalanceSensitivity,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
  PolicyInsightSelectionStatus,
  PolicyInsightWarningCode,
} from '@clmm/application/public';

export type PolicyInsightsSeverity = 'danger' | 'warning' | 'neutral';

export type PolicyInsightsViewModel = {
  actionLabel: string;
  severity: PolicyInsightsSeverity;
  marketRegimeLabel: string;
  fundamentalRegimeLabel: string;
  postureLabel: string;
  rangeBiasLabel: string;
  rebalanceSensitivityLabel: string;
  maxDeploymentLabel: string;
  riskLabel: string;
  confidenceLabel: string;
  dataQualityLabel: string;
  freshnessLabel: string;
  asOfLabel: string;
  expiresLabel: string;
  isStale: boolean;
  isDegraded: boolean;
  isLowConfidence: boolean;
  supportsLabel: string | null;
  resistancesLabel: string | null;
  levelsUnavailableLabel: string | null;
  evidenceSummary: string;
  warningLabels: string[];
  reasoning: string;
  subtitle: string;
};

const ACTION_LABELS: Record<PolicyInsightRecommendedAction, string> = {
  HOLD: 'Hold',
  MONITOR_LOWER_BOUND: 'Monitor lower bound',
  MONITOR_UPPER_BOUND: 'Monitor upper bound',
  EXIT_TO_USDC: 'Exit to USDC',
  EXIT_TO_SOL: 'Exit to SOL',
  STAND_DOWN: 'Stand down',
};

const MARKET_REGIME_LABELS: Record<PolicyInsightMarketRegime, string> = {
  UP: 'Up market',
  DOWN: 'Down market',
  CHOP: 'Choppy market',
};

const FUNDAMENTAL_REGIME_LABELS: Record<PolicyInsightFundamentalRegime, string> = {
  BULLISH: 'Bullish',
  BEARISH: 'Bearish',
  NEUTRAL: 'Neutral',
  UNKNOWN: 'Unknown',
};

const POSTURE_LABELS: Record<PolicyInsightPosture, string> = {
  AGGRESSIVE: 'Aggressive',
  MODERATELY_AGGRESSIVE: 'Moderately aggressive',
  NEUTRAL: 'Neutral',
  DEFENSIVE: 'Defensive',
  PAUSED: 'Paused',
};

const RANGE_BIAS_LABELS: Record<PolicyInsightRangeBias, string> = {
  TIGHT: 'Tight',
  MEDIUM: 'Medium',
  WIDE: 'Wide',
  PASSIVE: 'Passive',
};

const REBALANCE_SENSITIVITY_LABELS: Record<PolicyInsightRebalanceSensitivity, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  PAUSED: 'Paused',
};

const RISK_LABELS: Record<PolicyInsightRiskLevel, string> = {
  NORMAL: 'Normal risk',
  ELEVATED: 'Elevated risk',
  CRITICAL: 'Critical risk',
};

const DATA_QUALITY_LABELS: Record<PolicyInsightDataQuality, string> = {
  COMPLETE: 'Complete data',
  PARTIAL: 'Partial data',
  STALE: 'Stale data',
};

const EVIDENCE_STATUS_LABELS: Record<PolicyInsightSelectionStatus, string> = {
  FULL: 'Full evidence coverage',
  PARTIAL: 'Partial evidence coverage',
  DEGRADED: 'Limited evidence coverage',
};

type PolicyInsightReasonCode =
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

const WARNING_CODE_LABELS: Record<PolicyInsightWarningCode, string> = {
  MARKET_DATA_HARD_STALE: 'Market data hard stale',
  EVIDENCE_STALE_INPUT: 'Evidence stale input',
  EVIDENCE_MISSING_FAMILY: 'Evidence missing family',
  EVIDENCE_REJECTED_FAMILY: 'Evidence rejected family',
  EVIDENCE_CONFLICTED_FAMILY: 'Evidence conflicted family',
  EVIDENCE_NO_SELECTED_RESEARCH: 'Evidence no selected research',
  NO_ELIGIBLE_PRICE_LEVELS: 'No eligible price levels',
};

const REASON_CODE_LABELS: Record<PolicyInsightReasonCode, string> = {
  ADVISORY_ONLY: 'Advisory only',
  DATA_HARD_STALE: 'Data hard stale',
  DATA_INSUFFICIENT_SAMPLES: 'Data insufficient samples',
  CLMM_BREACH_LOWER: 'CLMM breach lower',
  CLMM_BREACH_UPPER: 'CLMM breach upper',
  CHURN_STAND_DOWN_ACTIVE: 'Churn stand-down active',
  CHURN_COOLDOWN_ACTIVE: 'Churn cooldown active',
  MARKET_REGIME_UP: 'Market regime up',
  MARKET_REGIME_DOWN: 'Market regime down',
  MARKET_REGIME_CHOP: 'Market regime chop',
  FEATURE_THRESHOLD_BREACHED: 'Feature threshold breached',
  CONTEXTUAL_EVIDENCE_VOTE: 'Contextual evidence vote',
  RESEARCH_BRIEF_ANALYSIS: 'Research brief analysis',
  NO_ELIGIBLE_PRICE_LEVELS: 'No eligible price levels',
};

const LEXICAL_ZERO_VALUES = new Set(['0', '0.0', '0.00']);

function formatPercentFromBps(bps: number): string {
  const percent = bps / 100;
  if (percent === 0) return '0%';
  return `${percent}%`;
}

function formatFreshness(ageSeconds: number): string {
  const MS_PER_MINUTE = 60_000;
  const MS_PER_HOUR = 3_600_000;
  const ageMs = ageSeconds * 1000;
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return `${minutes}m ago`;
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  return `${hours}h ago`;
}

function filterZeroLevels(levels: string[]): string[] {
  return levels.filter((level) => !LEXICAL_ZERO_VALUES.has(level));
}

function formatLevelsLabel(levels: string[]): string | null {
  const filtered = filterZeroLevels(levels);
  if (filtered.length === 0) return null;
  return `${filtered.join(', ')} USDC/SOL`;
}

function formatEvidenceSummary(
  selectionStatus: PolicyInsightSelectionStatus,
  bundleCount: number,
  sourceCount: number,
): string {
  const label = EVIDENCE_STATUS_LABELS[selectionStatus];
  if (selectionStatus === 'FULL' || (bundleCount === 0 && sourceCount === 0)) {
    return label;
  }
  const bundleStr = `${bundleCount} bundle${bundleCount !== 1 ? 's' : ''}`;
  const sourceStr = `${sourceCount} source${sourceCount !== 1 ? 's' : ''}`;
  return `${label} (${bundleStr}, ${sourceStr})`;
}

function getWarningLabelsFromCodes(
  codes: (PolicyInsightWarningCode | PolicyInsightReasonCode)[],
): string[] {
  const seen = new Set<PolicyInsightWarningCode | PolicyInsightReasonCode>();
  const labels: string[] = [];
  for (const code of codes) {
    if (!seen.has(code)) {
      seen.add(code);
      const warningLabel = WARNING_CODE_LABELS[code as PolicyInsightWarningCode];
      if (warningLabel) {
        labels.push(warningLabel);
      } else {
        const reasonLabel = REASON_CODE_LABELS[code as PolicyInsightReasonCode];
        if (reasonLabel) {
          labels.push(reasonLabel);
        }
      }
    }
    if (labels.length >= 3) break;
  }
  return labels;
}

function deriveSeverity(
  riskLevel: PolicyInsightRiskLevel,
  recommendedAction: PolicyInsightRecommendedAction,
  isStale: boolean,
  isDegraded: boolean,
  isLowConfidence: boolean,
): PolicyInsightsSeverity {
  if (
    riskLevel === 'CRITICAL' ||
    recommendedAction === 'EXIT_TO_USDC' ||
    recommendedAction === 'EXIT_TO_SOL'
  ) {
    return 'danger';
  }
  if (
    riskLevel === 'ELEVATED' ||
    recommendedAction === 'STAND_DOWN' ||
    isStale ||
    isDegraded ||
    isLowConfidence
  ) {
    return 'warning';
  }
  return 'neutral';
}

function boundReasoning(reasoning: string): string {
  if (reasoning.length <= 240) return reasoning;
  return reasoning.slice(0, 239) + '…';
}

export function buildPolicyInsightsViewModel(
  block: PolicyInsightBlock,
  now: number,
): PolicyInsightsViewModel {
  const expiresAtMs = Date.parse(block.expiresAt);
  const isExpired = expiresAtMs <= now;
  const isStaleDueToFreshness = block.freshness.status === 'STALE';
  const isStale = isStaleDueToFreshness || isExpired;

  const isDegraded =
    block.evidence.selectionStatus === 'PARTIAL' ||
    block.evidence.selectionStatus === 'DEGRADED' ||
    block.dataQuality !== 'COMPLETE';

  const isLowConfidence = block.confidenceBps < 5000;

  const severity = deriveSeverity(
    block.riskLevel,
    block.recommendedAction,
    isStale,
    isDegraded,
    isLowConfidence,
  );

  const supports = formatLevelsLabel(block.levels.supportsUsdcPerSol);
  const resistances = formatLevelsLabel(block.levels.resistancesUsdcPerSol);
  const levelsUnavailableLabel =
    supports === null && resistances === null ? 'No eligible support or resistance levels' : null;

  return {
    actionLabel: ACTION_LABELS[block.recommendedAction],
    severity,
    marketRegimeLabel: MARKET_REGIME_LABELS[block.marketRegime],
    fundamentalRegimeLabel: FUNDAMENTAL_REGIME_LABELS[block.fundamentalRegime],
    postureLabel: POSTURE_LABELS[block.posture],
    rangeBiasLabel: RANGE_BIAS_LABELS[block.clmmPolicy.rangeBias],
    rebalanceSensitivityLabel: REBALANCE_SENSITIVITY_LABELS[block.clmmPolicy.rebalanceSensitivity],
    maxDeploymentLabel: formatPercentFromBps(block.clmmPolicy.maxCapitalDeploymentBps),
    riskLabel: RISK_LABELS[block.riskLevel],
    confidenceLabel: `${block.confidenceBps / 100}% confidence`,
    dataQualityLabel: DATA_QUALITY_LABELS[block.dataQuality],
    freshnessLabel: formatFreshness(block.freshness.ageSeconds),
    asOfLabel: block.asOf.replace(/\.\d{3}Z$/, 'Z'),
    expiresLabel: block.expiresAt.replace(/\.\d{3}Z$/, 'Z'),
    isStale,
    isDegraded,
    isLowConfidence,
    supportsLabel: supports,
    resistancesLabel: resistances,
    levelsUnavailableLabel,
    evidenceSummary: formatEvidenceSummary(
      block.evidence.selectionStatus,
      block.evidence.selectedBundleRefs.length,
      block.evidence.selectedSourceRefs.length,
    ),
    warningLabels: getWarningLabelsFromCodes([
      ...block.warnings.map((w) => w.code),
      ...block.reasonCodes,
    ]),
    reasoning: boundReasoning(block.reasoning),
    subtitle:
      'Advisory policy context only. Nothing is signed or applied; deterministic stop-loss monitoring continues independently.',
  };
}
