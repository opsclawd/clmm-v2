import type { PolicyInsightBlock } from '@clmm/application/public';

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
  reasoning: string[];
  subtitle: string;
};

const ACTION_LABELS: Record<PolicyInsightBlock['recommendedAction'], string> = {
  hold: 'Hold',
  watch: 'Watch',
  tighten_range: 'Tighten range',
  widen_range: 'Widen range',
  exit_range: 'Exit range',
  pause_rebalances: 'Pause rebalances',
};

const RISK_LABELS: Record<PolicyInsightBlock['riskLevel'], string> = {
  normal: 'Normal risk',
  elevated: 'Elevated risk',
  critical: 'Critical risk',
};

const CONFIDENCE_LABELS: Record<PolicyInsightBlock['confidence'], string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

const DATA_QUALITY_LABELS: Record<PolicyInsightBlock['dataQuality'], string> = {
  complete: 'Complete data',
  partial: 'Partial data',
  stale: 'Stale data',
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

function formatPercent(fraction: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  return `${Math.round(clamped * 100)}%`;
}

function formatFreshness(capturedAtUnixMs: number, now: number): string {
  const ageMs = Math.max(0, now - capturedAtUnixMs);
  if (ageMs < MS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(ageMs / MS_PER_MINUTE));
    return `${minutes}m ago`;
  }
  const hours = Math.round(ageMs / MS_PER_HOUR);
  return `${hours}h ago`;
}

function deriveSeverity(block: PolicyInsightBlock): PolicyInsightsSeverity {
  if (block.riskLevel === 'critical' || block.recommendedAction === 'exit_range') {
    return 'danger';
  }
  if (block.riskLevel === 'elevated' || block.recommendedAction === 'pause_rebalances') {
    return 'warning';
  }
  return 'neutral';
}

function firstNonEmpty(values: string[], limit: number): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) {
      out.push(v);
      if (out.length === limit) break;
    }
  }
  return out;
}

export function buildPolicyInsightsViewModel(
  block: PolicyInsightBlock,
  now: number,
): PolicyInsightsViewModel {
  return {
    actionLabel: ACTION_LABELS[block.recommendedAction],
    severity: deriveSeverity(block),
    postureLabel: `Posture: ${block.clmmPolicy.posture}`,
    rangeBiasLabel: `Range bias: ${block.clmmPolicy.rangeBias}`,
    rebalanceSensitivityLabel: `Rebalance sensitivity: ${block.clmmPolicy.rebalanceSensitivity}`,
    maxDeploymentLabel: formatPercent(block.clmmPolicy.maxCapitalDeploymentPct),
    riskLabel: RISK_LABELS[block.riskLevel],
    confidenceLabel: CONFIDENCE_LABELS[block.confidence],
    dataQualityLabel: DATA_QUALITY_LABELS[block.dataQuality],
    freshnessLabel: formatFreshness(block.freshness.capturedAtUnixMs, now),
    isStale: block.status === 'STALE' || block.freshness.stale === true,
    reasoning: firstNonEmpty(block.reasoning, 3),
    subtitle: 'Advisory CLMM policy signal. Nothing has been applied.',
  };
}
