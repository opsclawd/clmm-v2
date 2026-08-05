import type {
  EvidenceBundle,
  EvidenceClaimDirection,
  CoverageStatus,
  EvidenceSourceReference,
} from '@clmm/application/public';

export interface EvidenceContextualClaimViewModel {
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceLabel: string;
  observedAtLabel: string;
  expiresAtLabel: string;
}

export interface EvidenceDerivationInputViewModel {
  locator: string;
  observedAtLabel: string;
}

export interface EvidenceFeatureDerivationViewModel {
  inputCount: number;
  timeSpanLabel: string;
  calculatorLabel: string;
  observedAtLabel: string;
  freshUntilLabel: string;
  isStale: boolean;
  inputs: EvidenceDerivationInputViewModel[];
}

export interface EvidenceFamilyCardRowViewModel {
  label: string;
  value: string;
  derivation?: EvidenceFeatureDerivationViewModel;
  warnings?: string[];
}

export interface EvidenceFamilyCardViewModel {
  id: string;
  title: string;
  availability: CoverageStatus | 'available' | 'unavailable' | 'partial' | 'invalid';
  freshnessLabel: string;
  stale: boolean;
  rows: EvidenceFamilyCardRowViewModel[];
  claims: EvidenceContextualClaimViewModel[];
  warnings?: string[];
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

const KNOWN_FAMILY_IDS = new Set<string>([
  ...Object.keys(DETERMINISTIC_FAMILY_TITLES),
  ...CONTEXTUAL_FAMILIES.map((f) => f.id),
]);

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

function formatTimeSpanLabel(resolvedReferences: EvidenceSourceReference[]): string {
  const timestamps: number[] = [];
  for (const ref of resolvedReferences) {
    if (ref.observedAt) {
      const ms = Date.parse(ref.observedAt);
      if (!Number.isNaN(ms)) {
        timestamps.push(ms);
      }
    }
  }

  if (timestamps.length === 0) {
    return 'Unknown time span';
  }

  const minMs = Math.min(...timestamps);
  const maxMs = Math.max(...timestamps);
  const diffMs = Math.max(0, maxMs - minMs);
  const minutes = Math.round(diffMs / 60000);

  if (minutes === 0) {
    return '0 minutes';
  }
  if (minutes === 1) {
    return '1 minute';
  }
  return `${minutes} minutes`;
}

function addMessage(targetArray: string[], message: string): void {
  if (!targetArray.includes(message)) {
    targetArray.push(message);
  }
}

export function buildEvidenceViewModel(
  bundle: EvidenceBundle,
  now: number,
): EvidenceScreenViewModel {
  const bundleFreshUntilMs = Date.parse(bundle.freshUntil);
  const bundleExpiresAtMs = Date.parse(bundle.expiresAt);
  const isBundleExpired = bundleFreshUntilMs <= now || bundleExpiresAtMs <= now;

  const sourceReferenceById = new Map<string, EvidenceSourceReference>();
  for (const ref of bundle.sourceReferences || []) {
    sourceReferenceById.set(ref.referenceId, ref);
  }

  const knownFeatureIds = new Set<string>();
  const renderedDeterministicFamilyIds = new Set<string>();
  for (const feature of bundle.deterministicFeatures || []) {
    knownFeatureIds.add(feature.featureId);
    if (feature.family in DETERMINISTIC_FAMILY_TITLES) {
      renderedDeterministicFamilyIds.add(feature.family);
    }
  }

  const familyCardWarnings = new Map<string, string[]>();
  const featureRowWarnings = new Map<string, string[]>();
  const fallbackWarnings: string[] = [];

  for (const warning of bundle.assessment?.warnings || []) {
    const msg = warning.message;
    const targets = warning.affectedFamilies || [];

    const hasKnownTarget = targets.some(
      (t) => KNOWN_FAMILY_IDS.has(t) || knownFeatureIds.has(t) || t === 'deterministic',
    );

    if (!hasKnownTarget) {
      addMessage(fallbackWarnings, msg);
    } else {
      for (const target of targets) {
        if (KNOWN_FAMILY_IDS.has(target)) {
          let list = familyCardWarnings.get(target);
          if (!list) {
            list = [];
            familyCardWarnings.set(target, list);
          }
          addMessage(list, msg);
        } else if (knownFeatureIds.has(target)) {
          let list = featureRowWarnings.get(target);
          if (!list) {
            list = [];
            featureRowWarnings.set(target, list);
          }
          addMessage(list, msg);
        } else if (target === 'deterministic') {
          for (const familyId of renderedDeterministicFamilyIds) {
            let list = familyCardWarnings.get(familyId);
            if (!list) {
              list = [];
              familyCardWarnings.set(familyId, list);
            }
            addMessage(list, msg);
          }
        }
      }
    }
  }

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
      const resolvedReferences: EvidenceSourceReference[] = [];
      const inputs: EvidenceDerivationInputViewModel[] = (feature.inputLineage || []).map(
        (referenceId) => {
          const reference = sourceReferenceById.get(referenceId);
          if (reference) {
            resolvedReferences.push(reference);
            return {
              locator: reference.locator,
              observedAtLabel: formatDateLabel(reference.observedAt),
            };
          }
          return {
            locator: `Unresolved reference (${referenceId})`,
            observedAtLabel: '—',
          };
        },
      );

      const derivation: EvidenceFeatureDerivationViewModel = {
        inputCount: (feature.inputLineage || []).length,
        timeSpanLabel: formatTimeSpanLabel(resolvedReferences),
        calculatorLabel: `${feature.calculator.name} v${feature.calculator.version}`,
        observedAtLabel: formatDateLabel(feature.observedAt),
        freshUntilLabel: formatDateLabel(feature.freshUntil),
        isStale: feature.freshUntil !== null && Date.parse(feature.freshUntil) <= now,
        inputs,
      };

      const rowWarnings: string[] = [];
      for (const w of feature.warnings || []) {
        addMessage(rowWarnings, w);
      }
      for (const w of featureRowWarnings.get(feature.featureId) || []) {
        addMessage(rowWarnings, w);
      }

      let valueLabel = '—';
      if (feature.status === 'available') {
        const value = (feature as { value: unknown }).value;
        const unit = (feature as { unit?: unknown }).unit;
        if (value !== null && value !== undefined) {
          valueLabel = unit ? `${String(value)} ${String(unit)}` : `${String(value)}`;
        }
      }

      return {
        label: feature.featureId,
        value: valueLabel,
        derivation,
        warnings: rowWarnings,
      };
    });

    cards.push({
      id,
      title,
      availability,
      freshnessLabel: isStale ? 'Stale' : 'Fresh',
      stale: isStale,
      rows,
      claims: [],
      warnings: familyCardWarnings.get(id) || [],
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
        rows: [{ label: 'Claims', value: '—', warnings: [] }],
        claims: [],
        warnings: familyCardWarnings.get(fam.id) || [],
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
      rows: [{ label: 'Claims count', value: `${claimsArray.length}`, warnings: [] }],
      claims: mappedClaims,
      warnings: familyCardWarnings.get(fam.id) || [],
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
    warnings: fallbackWarnings,
  };
}
