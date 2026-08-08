/**
 * Canonical Application DTO for SOL/USDC Evidence Bundle (evidence-bundle.v1)
 */

export type EvidenceUnavailableReason =
  | 'not-found'
  | 'store-unavailable'
  | 'config-error'
  | 'malformed'
  | 'upstream-error';

export type EvidenceScope =
  | { kind: 'pair' }
  | { kind: 'whirlpool'; network: 'solana-mainnet'; whirlpoolAddress: string }
  | { kind: 'wallet'; network: 'solana-mainnet'; walletAddress: string }
  | {
      kind: 'position';
      network: 'solana-mainnet';
      walletAddress: string;
      whirlpoolAddress: string;
      positionId: string;
    };

export interface EvidenceSourceIdentity {
  publisher: 'sol-usdc-clmm-intelligence';
  sourceId: string;
  sourceVersion: string;
}

export interface EvidenceCalculator {
  name: string;
  version: string;
}

export type EvidenceNumericUnit =
  | 'usd'
  | 'sol'
  | 'usdc'
  | 'percent'
  | 'basis_points'
  | 'ratio'
  | 'seconds'
  | 'milliseconds'
  | 'count'
  | 'price_usdc_per_sol';

export type EvidenceBooleanUnit = 'boolean';
export type EvidenceCategoryUnit = 'category';

export type DeterministicFeatureFamily =
  | 'market_state'
  | 'price_quality'
  | 'clmm_economics'
  | 'position_state'
  | 'liquidity'
  | 'risk';

export interface DeterministicFeatureAvailableNumber {
  featureId: string;
  family: DeterministicFeatureFamily;
  featureKind: 'number';
  status: 'available';
  value: number;
  unit: EvidenceNumericUnit;
  observedAt: string;
  freshUntil: string;
  confidenceBps: number;
  calculator: EvidenceCalculator;
  inputLineage: string[];
  warnings: string[];
}

export interface DeterministicFeatureAvailableBoolean {
  featureId: string;
  family: DeterministicFeatureFamily;
  featureKind: 'boolean';
  status: 'available';
  value: boolean;
  unit: EvidenceBooleanUnit;
  observedAt: string;
  freshUntil: string;
  confidenceBps: number;
  calculator: EvidenceCalculator;
  inputLineage: string[];
  warnings: string[];
}

export interface DeterministicFeatureAvailableCategory {
  featureId: string;
  family: DeterministicFeatureFamily;
  featureKind: 'category';
  status: 'available';
  value: string;
  unit: EvidenceCategoryUnit;
  observedAt: string;
  freshUntil: string;
  confidenceBps: number;
  calculator: EvidenceCalculator;
  inputLineage: string[];
  warnings: string[];
}

export interface DeterministicFeatureUnavailable {
  featureId: string;
  family: DeterministicFeatureFamily;
  featureKind: 'number' | 'boolean' | 'category';
  status: 'unavailable';
  value: null;
  unit: null;
  observedAt: null;
  freshUntil: null;
  confidenceBps: 0;
  calculator: EvidenceCalculator;
  inputLineage: string[];
  warnings: string[];
}

export interface DeterministicFeatureInvalid {
  featureId: string;
  family: DeterministicFeatureFamily;
  featureKind: 'number' | 'boolean' | 'category';
  status: 'invalid';
  value: null;
  unit: null;
  observedAt?: string | null;
  freshUntil?: string | null;
  confidenceBps: 0;
  calculator: EvidenceCalculator;
  inputLineage: string[];
  warnings: string[];
}

export type DeterministicFeature =
  | DeterministicFeatureAvailableNumber
  | DeterministicFeatureAvailableBoolean
  | DeterministicFeatureAvailableCategory
  | DeterministicFeatureUnavailable
  | DeterministicFeatureInvalid;

export type EvidenceClaimDirection = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'unknown';
export type EvidenceProvenanceMethod = 'collected' | 'derived' | 'human_authored';

export interface SupportResistanceClaim {
  evidenceId: string;
  kind: 'support_zone' | 'resistance_zone' | 'breakout_level';
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceBps: number;
  observedAt: string;
  expiresAt: string | null;
  sourceReferenceIds: string[];
  provenanceMethod: EvidenceProvenanceMethod;
}

export interface FlowClaim {
  evidenceId: string;
  kind: 'spot_flow' | 'stablecoin_flow' | 'exchange_flow';
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceBps: number;
  observedAt: string;
  expiresAt: string | null;
  sourceReferenceIds: string[];
  provenanceMethod: EvidenceProvenanceMethod;
}

export interface DerivativesClaim {
  evidenceId: string;
  kind: 'funding' | 'open_interest' | 'liquidation' | 'options_skew';
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceBps: number;
  observedAt: string;
  expiresAt: string | null;
  sourceReferenceIds: string[];
  provenanceMethod: EvidenceProvenanceMethod;
}

export interface EventClaim {
  evidenceId: string;
  kind: 'scheduled_event' | 'protocol_incident' | 'network_incident';
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceBps: number;
  observedAt: string;
  expiresAt: string | null;
  sourceReferenceIds: string[];
  provenanceMethod: EvidenceProvenanceMethod;
}

export interface NewsRegulatoryClaim {
  evidenceId: string;
  kind: 'ecosystem_news' | 'regulatory_update';
  claim: string;
  direction: EvidenceClaimDirection;
  confidenceBps: number;
  observedAt: string;
  expiresAt: string | null;
  sourceReferenceIds: string[];
  provenanceMethod: EvidenceProvenanceMethod;
}

export interface ContextualEvidence {
  supportResistance: SupportResistanceClaim[];
  flows: FlowClaim[];
  derivatives: DerivativesClaim[];
  events: EventClaim[];
  newsRegulatory: NewsRegulatoryClaim[];
}

export interface EvidenceModelInfo {
  provider: string;
  modelId: string;
  modelVersion: string;
}

export interface ResearchBrief {
  briefId: string;
  generatedAt: string;
  summary: string;
  keyFindings: string[];
  uncertainties: string[];
  model: EvidenceModelInfo;
  promptVersion: string;
  sourceEvidenceIds: string[];
}

export interface EvidenceSourceReference {
  referenceId: string;
  sourceType: 'api' | 'database' | 'chain' | 'document' | 'internal_bundle';
  locator: string;
  publishedAt?: string | null;
  observedAt: string;
  contentHash?: string | null;
}

export type CoverageStatus = 'available' | 'partial' | 'unavailable' | 'not_applicable';

export interface FamilyCoverage {
  deterministic: CoverageStatus;
  supportResistance: CoverageStatus;
  flows: CoverageStatus;
  derivatives: CoverageStatus;
  events: CoverageStatus;
  newsRegulatory: CoverageStatus;
  researchBrief: CoverageStatus;
}

export interface BundleWarning {
  code: string;
  message: string;
  affectedFamilies: string[];
}

export type QualityLevel = 'complete' | 'partial' | 'degraded';

export interface EvidenceCollectorLiveness {
  isConfigured: boolean;
  lastCollectedAt: string | null;
}

export interface BundleAssessment {
  overallConfidenceBps: number;
  quality: QualityLevel;
  coverage: FamilyCoverage;
  warnings: BundleWarning[];
  liveness?: Record<string, EvidenceCollectorLiveness>;
}

export interface BundleProvenance {
  pipelineVersion: string;
  gitCommit: string;
  environment: 'production' | 'staging' | 'development' | 'test';
  upstreamRunIds: string[];
}

export interface EvidenceBundle {
  schemaVersion: 'evidence-bundle.v1';
  pair: 'SOL/USDC';
  scope: EvidenceScope;
  source: EvidenceSourceIdentity;
  runId: string;
  correlationId: string;
  createdAt: string;
  asOf: string;
  freshUntil: string;
  expiresAt: string;
  deterministicFeatures: DeterministicFeature[];
  contextualEvidence: ContextualEvidence;
  researchBrief: ResearchBrief | null;
  sourceReferences: EvidenceSourceReference[];
  assessment: BundleAssessment;
  provenance: BundleProvenance;
}
