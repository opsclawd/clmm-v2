import type {
  PolicyInsightBlock,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
} from '@clmm/application/public';

export type PolicyInsightsSeverity = 'danger' | 'warning' | 'neutral';

export type PolicyInsightsViewModel = {
  actionLabel: string;
  severity: PolicyInsightsSeverity;
  postureLabel: string;
  rangeBiasLabel: string;
  rebalanceSensitivityLabel: string;
  maxDeploymentLabel: string;
  riskLabel: string;
  confidenceLabel: string;
  dataQualityLabel: string;
  freshnessLabel: string;
  isStale: boolean;
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

function formatPercentFromBps(bps: number): string {
  const fraction = Math.max(0, Math.min(10000, bps)) / 10000;
  return `${Math.round(fraction * 100)}%`;
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

function deriveSeverity(block: PolicyInsightBlock): PolicyInsightsSeverity {
  if (
    block.riskLevel === 'CRITICAL' ||
    block.recommendedAction === 'EXIT_TO_USDC' ||
    block.recommendedAction === 'EXIT_TO_SOL'
  ) {
    return 'danger';
  }
  if (block.riskLevel === 'ELEVATED' || block.recommendedAction === 'STAND_DOWN') {
    return 'warning';
  }
  return 'neutral';
}

export function buildPolicyInsightsViewModel(
  block: PolicyInsightBlock,
  _now: number,
): PolicyInsightsViewModel {
  return {
    actionLabel: ACTION_LABELS[block.recommendedAction],
    severity: deriveSeverity(block),
    postureLabel: `Posture: ${block.posture}`,
    rangeBiasLabel: `Range bias: ${block.clmmPolicy.rangeBias}`,
    rebalanceSensitivityLabel: `Rebalance sensitivity: ${block.clmmPolicy.rebalanceSensitivity}`,
    maxDeploymentLabel: formatPercentFromBps(block.clmmPolicy.maxCapitalDeploymentBps),
    riskLabel: RISK_LABELS[block.riskLevel],
    confidenceLabel: `${block.confidenceBps / 100}% confidence`,
    dataQualityLabel: DATA_QUALITY_LABELS[block.dataQuality],
    freshnessLabel: formatFreshness(block.freshness.ageSeconds),
    isStale: block.freshness.status === 'STALE',
    reasoning: block.reasoning,
    subtitle: 'Advisory CLMM policy signal. Nothing has been applied.',
  };
}
