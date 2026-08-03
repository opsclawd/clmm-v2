import type {
  PolicyInsightBlock,
  PolicyInsightMarketRegime,
  PolicyInsightFundamentalRegime,
  PolicyInsightRecommendedAction,
  PolicyInsightDataQuality,
  PolicyInsightSelectionStatus,
  PolicyInsightWarningCode,
  PolicyInsightReasonCode,
  PolicyInsightSourceRef,
} from '@clmm/application/public';

export type SynthesisFamilyId =
  | 'deterministic'
  | 'supportResistance'
  | 'flows'
  | 'derivatives'
  | 'events'
  | 'newsRegulatory';

export type SynthesisFamilyStatus = 'AVAILABLE' | 'MISSING' | 'REJECTED' | 'CONFLICTED';

export interface SynthesisFamilyViewModel {
  id: SynthesisFamilyId;
  label: string;
  status: SynthesisFamilyStatus;
  statusLabel: string;
}

export interface SynthesisViewModel {
  pairLabel: string;
  recommendationLabel: string;
  marketRegimeLabel: string;
  fundamentalRegimeLabel: string;
  confidenceLabel: string;
  dataQualityLabel: string;
  selectionStatusLabel: string;
  selectionPolicyVersion: string;
  reasoning: string;
  reasonBullets: string[];
  families: SynthesisFamilyViewModel[];
  familyStatusesReliable: boolean;
  familyStatusCaveat: string | null;
  warningLabels: string[];
  bundleReferences: Array<{
    bundleHash: string;
    publisher: string;
    sourceId: string;
    runId: string;
  }>;
  sourceReferences: Array<{
    referenceId: string;
    sourceTypeLabel: string;
    locator: string;
    observedAtLabel: string;
  }>;
}

const CANONICAL_FAMILY_IDS: SynthesisFamilyId[] = [
  'deterministic',
  'supportResistance',
  'flows',
  'derivatives',
  'events',
  'newsRegulatory',
];

const FAMILY_LABELS: Record<SynthesisFamilyId, string> = {
  deterministic: 'Deterministic',
  supportResistance: 'Support & Resistance',
  flows: 'Flows',
  derivatives: 'Derivatives',
  events: 'Events',
  newsRegulatory: 'News & Regulatory',
};

const FAMILY_STATUS_LABELS: Record<SynthesisFamilyStatus, string> = {
  AVAILABLE: 'Available',
  MISSING: 'Missing',
  REJECTED: 'Rejected',
  CONFLICTED: 'Conflicted',
};

const RECOMMENDATION_LABELS: Record<PolicyInsightRecommendedAction, string> = {
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

const DATA_QUALITY_LABELS: Record<PolicyInsightDataQuality, string> = {
  COMPLETE: 'Complete data',
  PARTIAL: 'Partial data',
  STALE: 'Stale data',
};

const SELECTION_STATUS_LABELS: Record<PolicyInsightSelectionStatus, string> = {
  FULL: 'Full evidence coverage',
  PARTIAL: 'Partial evidence coverage',
  DEGRADED: 'Limited evidence coverage',
};

const REASON_CODE_SENTENCES: Record<PolicyInsightReasonCode, string> = {
  ADVISORY_ONLY: 'Advisory recommendation only.',
  DATA_HARD_STALE: 'Market data is hard stale.',
  DATA_INSUFFICIENT_SAMPLES: 'Insufficient market data samples available.',
  CLMM_BREACH_LOWER: 'Position lower bound has been breached.',
  CLMM_BREACH_UPPER: 'Position upper bound has been breached.',
  CHURN_STAND_DOWN_ACTIVE: 'Stand-down protection is active to prevent churn.',
  CHURN_COOLDOWN_ACTIVE: 'Cooldown period is active to prevent churn.',
  MARKET_REGIME_UP: 'Market regime is upward trending.',
  MARKET_REGIME_DOWN: 'Market regime is downward trending.',
  MARKET_REGIME_CHOP: 'Market regime is choppy or range-bound.',
  FEATURE_THRESHOLD_BREACHED: 'Feature threshold has been breached.',
  CONTEXTUAL_EVIDENCE_VOTE: 'Contextual evidence voted on recommendation.',
  RESEARCH_BRIEF_ANALYSIS: 'Research brief analysis contributed to recommendation.',
  NO_ELIGIBLE_PRICE_LEVELS: 'No eligible price levels found.',
};

const WARNING_CODE_LABELS: Record<PolicyInsightWarningCode, string> = {
  MARKET_DATA_HARD_STALE: 'Market data hard stale',
  EVIDENCE_STALE_INPUT: 'Evidence stale input',
  EVIDENCE_MISSING_FAMILY: 'Evidence missing family',
  EVIDENCE_REJECTED_FAMILY: 'Evidence rejected family',
  EVIDENCE_CONFLICTED_FAMILY: 'Evidence conflicted family',
  EVIDENCE_NO_SELECTED_RESEARCH: 'Evidence no selected research',
  NO_ELIGIBLE_PRICE_LEVELS: 'No eligible price levels',
};

const FAMILY_WARNING_CODES = new Set<PolicyInsightWarningCode>([
  'EVIDENCE_MISSING_FAMILY',
  'EVIDENCE_REJECTED_FAMILY',
  'EVIDENCE_CONFLICTED_FAMILY',
]);

const WARNING_CODE_TO_FAMILY_STATUS: Record<
  'EVIDENCE_MISSING_FAMILY' | 'EVIDENCE_REJECTED_FAMILY' | 'EVIDENCE_CONFLICTED_FAMILY',
  SynthesisFamilyStatus
> = {
  EVIDENCE_MISSING_FAMILY: 'MISSING',
  EVIDENCE_REJECTED_FAMILY: 'REJECTED',
  EVIDENCE_CONFLICTED_FAMILY: 'CONFLICTED',
};

const STATUS_PRECEDENCE: Record<SynthesisFamilyStatus, number> = {
  AVAILABLE: 0,
  MISSING: 1,
  REJECTED: 2,
  CONFLICTED: 3,
};

const SOURCE_TYPE_LABELS: Record<PolicyInsightSourceRef['sourceType'], string> = {
  api: 'API',
  database: 'Database',
  chain: 'On-Chain',
  document: 'Document',
  internal_bundle: 'Internal Bundle',
};

const FAMILY_ALIASES: Record<SynthesisFamilyId, string[]> = {
  deterministic: ['deterministic'],
  supportResistance: [
    'support & resistance',
    'support/resistance',
    'support and resistance',
    'support resistance',
  ],
  flows: ['flows'],
  derivatives: ['derivatives'],
  events: ['events'],
  newsRegulatory: [
    'news & regulatory',
    'news/regulatory',
    'news and regulatory',
    'news regulatory',
  ],
};

function formatPercentFromBps(bps: number): string {
  const percent = bps / 100;
  if (percent === 0) return '0%';
  return `${percent}%`;
}

function formatDateLabel(isoTimestamp: string | null): string {
  if (!isoTimestamp) return '—';
  return isoTimestamp.replace(/\.\d{3}Z$/, 'Z');
}

function findMentionedFamilies(message: string): SynthesisFamilyId[] {
  const normalized = message.toLowerCase().replace(/\s+/g, ' ');
  const matched: SynthesisFamilyId[] = [];
  for (const familyId of CANONICAL_FAMILY_IDS) {
    const aliases = FAMILY_ALIASES[familyId];
    const isMatched = aliases.some((alias) => normalized.includes(alias));
    if (isMatched) {
      matched.push(familyId);
    }
  }
  return matched;
}

export function buildSynthesisViewModel(block: PolicyInsightBlock): SynthesisViewModel {
  const familyStatuses = new Map<SynthesisFamilyId, SynthesisFamilyStatus>([
    ['deterministic', 'AVAILABLE'],
    ['supportResistance', 'AVAILABLE'],
    ['flows', 'AVAILABLE'],
    ['derivatives', 'AVAILABLE'],
    ['events', 'AVAILABLE'],
    ['newsRegulatory', 'AVAILABLE'],
  ]);

  let familyStatusesReliable = true;

  for (const w of block.warnings) {
    if (FAMILY_WARNING_CODES.has(w.code)) {
      const matchedFamilies = findMentionedFamilies(w.message);
      const familyId = matchedFamilies[0];
      if (matchedFamilies.length === 1 && familyId !== undefined) {
        const newStatus =
          WARNING_CODE_TO_FAMILY_STATUS[w.code as keyof typeof WARNING_CODE_TO_FAMILY_STATUS];
        const currentStatus = familyStatuses.get(familyId) ?? 'AVAILABLE';
        if (STATUS_PRECEDENCE[newStatus] > STATUS_PRECEDENCE[currentStatus]) {
          familyStatuses.set(familyId, newStatus);
        }
      } else {
        familyStatusesReliable = false;
      }
    }
  }

  const familyStatusCaveat = familyStatusesReliable
    ? null
    : 'Family status incomplete: one or more warnings could not be attributed to a single evidence family.';

  const families: SynthesisFamilyViewModel[] = CANONICAL_FAMILY_IDS.map((id) => {
    const status = familyStatuses.get(id) ?? 'AVAILABLE';
    return {
      id,
      label: FAMILY_LABELS[id],
      status,
      statusLabel: FAMILY_STATUS_LABELS[status],
    };
  });

  const reasonBullets = block.reasonCodes.map((code) => REASON_CODE_SENTENCES[code]);

  const seenWarnings = new Set<string>();
  const warningLabels: string[] = [];
  for (const w of block.warnings) {
    const codeLabel = WARNING_CODE_LABELS[w.code] ?? w.code;
    const displayString = w.message
      ? w.message.startsWith(codeLabel)
        ? w.message
        : `${codeLabel}: ${w.message}`
      : codeLabel;
    if (!seenWarnings.has(displayString)) {
      seenWarnings.add(displayString);
      warningLabels.push(displayString);
    }
  }
  if (warningLabels.length === 0) {
    warningLabels.push('No active warnings');
  }

  const bundleReferences = block.evidence.selectedBundleRefs.map((ref) => ({
    bundleHash: ref.bundleHash,
    publisher: ref.publisher,
    sourceId: ref.sourceId,
    runId: ref.runId,
  }));

  const sourceReferences = block.evidence.selectedSourceRefs.map((ref) => ({
    referenceId: ref.referenceId,
    sourceTypeLabel: SOURCE_TYPE_LABELS[ref.sourceType] ?? ref.sourceType,
    locator: ref.locator,
    observedAtLabel: formatDateLabel(ref.observedAt),
  }));

  return {
    pairLabel: block.pair,
    recommendationLabel: RECOMMENDATION_LABELS[block.recommendedAction],
    marketRegimeLabel: MARKET_REGIME_LABELS[block.marketRegime],
    fundamentalRegimeLabel: FUNDAMENTAL_REGIME_LABELS[block.fundamentalRegime],
    confidenceLabel: formatPercentFromBps(block.confidenceBps),
    dataQualityLabel: DATA_QUALITY_LABELS[block.dataQuality],
    selectionStatusLabel: SELECTION_STATUS_LABELS[block.evidence.selectionStatus],
    selectionPolicyVersion: block.evidence.selectionPolicyVersion,
    reasoning: block.reasoning,
    reasonBullets,
    families,
    familyStatusesReliable,
    familyStatusCaveat,
    warningLabels,
    bundleReferences,
    sourceReferences,
  };
}
