import type {
  EvidenceBundle,
  EvidenceClaimDirection,
  CoverageStatus,
} from '@clmm/application/public';

export interface EvidenceContextualClaimViewModel {
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceLabel: string;
  observedAtLabel: string;
  expiresAtLabel: string;
}

export interface EvidenceFamilyCardRowViewModel {
  label: string;
  value: string;
}

export interface EvidenceFamilyCardViewModel {
  id: string;
  title: string;
  availability: CoverageStatus | 'available' | 'unavailable' | 'partial' | 'invalid';
  freshnessLabel: string;
  stale: boolean;
  rows: EvidenceFamilyCardRowViewModel[];
  claims: EvidenceContextualClaimViewModel[];
}

export interface EvidenceResearchBriefViewModel {
  summary: string;
  keyFindings: string[];
  uncertainties: string[];
  modelLabel: string;
}

export interface EvidenceScreenViewModel {
  asOfLabel: string;
  freshUntilLabel: string;
  expiresAtLabel: string;
  lastCollectedLabel: string;
  overallConfidenceLabel: string;
  qualityLabel: string;
  isStale: boolean;
  cards: EvidenceFamilyCardViewModel[];
  brief: EvidenceResearchBriefViewModel | null;
  warnings: string[];
}

const DETERMINISTIC_FAMILY_TITLES = {
  market_state: 'Market state',
  price_quality: 'Price quality',
  clmm_economics: 'CLMM economics',
  position_state: 'Position state',
  liquidity: 'Liquidity',
  risk: 'Risk',
} as const;

const CONTEXTUAL_FAMILIES = [
  { id: 'supportResistance', title: 'Support & resistance' },
  { id: 'flows', title: 'Flows' },
  { id: 'derivatives', title: 'Derivatives' },
  { id: 'events', title: 'Events' },
  { id: 'newsRegulatory', title: 'News & regulatory' },
] as const;

function formatPercentFromBps(bps: number): string {
  const percent = bps / 100;
  if (percent === 0) return '0%';
  return `${percent}%`;
}

function formatDateLabel(isoTimestamp: string | null): string {
  if (!isoTimestamp) return '—';
  return isoTimestamp.replace(/\.\d{3}Z$/, 'Z');
}

function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function findLastCollectedTimestamp(bundle: EvidenceBundle): string {
  let latestMs = 0;
  let latestStr = bundle.asOf;

  for (const ref of bundle.sourceReferences) {
    if (ref.observedAt) {
      const ms = Date.parse(ref.observedAt);
      if (ms > latestMs) {
        latestMs = ms;
        latestStr = ref.observedAt;
      }
    }
  }

  for (const feature of bundle.deterministicFeatures) {
    if (feature.observedAt) {
      const ms = Date.parse(feature.observedAt);
      if (ms > latestMs) {
        latestMs = ms;
        latestStr = feature.observedAt;
      }
    }
  }

  if (bundle.contextualEvidence) {
    const categories = [
      bundle.contextualEvidence.supportResistance,
      bundle.contextualEvidence.flows,
      bundle.contextualEvidence.derivatives,
      bundle.contextualEvidence.events,
      bundle.contextualEvidence.newsRegulatory,
    ];
    for (const claims of categories) {
      if (Array.isArray(claims)) {
        for (const claim of claims) {
          if (claim.observedAt) {
            const ms = Date.parse(claim.observedAt);
            if (ms > latestMs) {
              latestMs = ms;
              latestStr = claim.observedAt;
            }
          }
        }
      }
    }
  }

  return formatDateLabel(latestStr);
}

export function buildEvidenceViewModel(
  bundle: EvidenceBundle,
  now: number,
): EvidenceScreenViewModel {
  const bundleFreshUntilMs = Date.parse(bundle.freshUntil);
  const bundleExpiresAtMs = Date.parse(bundle.expiresAt);
  const isBundleExpired = bundleFreshUntilMs <= now || bundleExpiresAtMs <= now;

  const cards: EvidenceFamilyCardViewModel[] = [];

  // 1. Build deterministic family cards (in canonical order)
  for (const [id, title] of Object.entries(DETERMINISTIC_FAMILY_TITLES)) {
    const features = bundle.deterministicFeatures.filter((feature) => feature.family === id);

    if (features.length === 0) {
      continue;
    }

    const hasInvalid = features.some((feature) => feature.status === 'invalid');
    const allAvailable = features.every((feature) => feature.status === 'available');
    const allUnavailable = features.every((feature) => feature.status === 'unavailable');

    let availability: EvidenceFamilyCardViewModel['availability'] = 'partial';
    if (hasInvalid) availability = 'invalid';
    else if (allAvailable) availability = 'available';
    else if (allUnavailable) availability = 'unavailable';

    const isFeatureStale = features.some(
      (feature) => Boolean(feature.freshUntil) && Date.parse(feature.freshUntil!) <= now,
    );
    const isStale = isBundleExpired || isFeatureStale;

    const rows: EvidenceFamilyCardRowViewModel[] = features.map((feature) => {
      if (feature.status === 'available') {
        const value = (feature as { value: unknown }).value;
        const unit = (feature as { unit?: unknown }).unit;
        if (value !== null && value !== undefined) {
          const valueLabel = unit ? `${String(value)} ${String(unit)}` : `${String(value)}`;
          return { label: feature.featureId, value: valueLabel };
        }
      }
      return { label: feature.featureId, value: '—' };
    });

    cards.push({
      id,
      title,
      availability,
      freshnessLabel: isStale ? 'Stale' : 'Fresh',
      stale: isStale,
      rows,
      claims: [],
    });
  }

  // 2. Build contextual family cards (in canonical order)
  for (const fam of CONTEXTUAL_FAMILIES) {
    const rawClaims = bundle.contextualEvidence ? bundle.contextualEvidence[fam.id] : [];
    const claimsArray = Array.isArray(rawClaims) ? rawClaims : [];
    const availability = bundle.assessment.coverage[fam.id];

    if (claimsArray.length === 0) {
      cards.push({
        id: fam.id,
        title: fam.title,
        availability,
        freshnessLabel: '—',
        stale: false,
        rows: [{ label: 'Claims', value: '—' }],
        claims: [],
      });
      continue;
    }

    const hasExpiredClaim = claimsArray.some(
      (c) => c.expiresAt !== null && Date.parse(c.expiresAt) <= now,
    );
    const isStale = isBundleExpired || hasExpiredClaim;

    const mappedClaims: EvidenceContextualClaimViewModel[] = claimsArray.map((c) => ({
      claim: c.claim,
      direction: c.direction,
      confidenceLabel: formatPercentFromBps(c.confidenceBps),
      observedAtLabel: formatDateLabel(c.observedAt),
      expiresAtLabel: formatDateLabel(c.expiresAt),
    }));

    cards.push({
      id: fam.id,
      title: fam.title,
      availability,
      freshnessLabel: isStale ? 'Stale' : 'Fresh',
      stale: isStale,
      rows: [{ label: 'Claims count', value: `${claimsArray.length}` }],
      claims: mappedClaims,
    });
  }

  const isStale = isBundleExpired || cards.some((c) => c.stale);

  const brief: EvidenceResearchBriefViewModel | null = bundle.researchBrief
    ? {
        summary: bundle.researchBrief.summary,
        keyFindings: bundle.researchBrief.keyFindings,
        uncertainties: bundle.researchBrief.uncertainties,
        modelLabel: `${bundle.researchBrief.model.provider} / ${bundle.researchBrief.model.modelId} (v${bundle.researchBrief.model.modelVersion})`,
      }
    : null;

  const warnings = (bundle.assessment.warnings || []).map((w) => w.message);

  return {
    asOfLabel: formatDateLabel(bundle.asOf),
    freshUntilLabel: formatDateLabel(bundle.freshUntil),
    expiresAtLabel: formatDateLabel(bundle.expiresAt),
    lastCollectedLabel: findLastCollectedTimestamp(bundle),
    overallConfidenceLabel: formatPercentFromBps(bundle.assessment.overallConfidenceBps),
    qualityLabel: capitalize(bundle.assessment.quality),
    isStale,
    cards,
    brief,
    warnings,
  };
}
