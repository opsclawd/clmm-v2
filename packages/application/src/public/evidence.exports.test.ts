import { describe, expect, it } from 'vitest';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import type {
  EvidenceBundle,
  EvidenceUnavailableReason,
  EvidenceScope,
  EvidenceSourceIdentity,
  DeterministicFeature,
  DeterministicFeatureInvalid,
  ContextualEvidence,
  ResearchBrief,
  EvidenceSourceReference,
  BundleAssessment,
  BundleProvenance,
} from './index.js';
import { parseEvidenceBundle } from './index.js';

describe('Public Evidence API exports', () => {
  it('exports parseEvidenceBundle and parses a typed canonical sample', () => {
    const sample: EvidenceBundle = contextualFixture as unknown as EvidenceBundle;

    const _scope: EvidenceScope = sample.scope;
    const _source: EvidenceSourceIdentity = sample.source;
    const _features: DeterministicFeature[] = sample.deterministicFeatures;
    const _context: ContextualEvidence = sample.contextualEvidence;
    const _brief: ResearchBrief | null = sample.researchBrief;
    const _refs: EvidenceSourceReference[] = sample.sourceReferences;
    const _assessment: BundleAssessment = sample.assessment;
    const _provenance: BundleProvenance = sample.provenance;

    expect(sample.schemaVersion).toBe('evidence-bundle.v1');
    expect(sample.pair).toBe('SOL/USDC');
    expect(_scope).toBeDefined();
    expect(_source).toBeDefined();
    expect(_features.length).toBeGreaterThan(0);
    expect(_context).toBeDefined();
    expect(_brief).toBeDefined();
    expect(_refs.length).toBeGreaterThan(0);
    expect(_assessment).toBeDefined();
    expect(_provenance).toBeDefined();

    const parsed = parseEvidenceBundle(sample);
    expect(parsed).toBe(sample);
  });

  it('exports EvidenceUnavailableReason type values', () => {
    const reasons: EvidenceUnavailableReason[] = [
      'not-found',
      'store-unavailable',
      'config-error',
      'malformed',
      'upstream-error',
    ];
    expect(reasons.length).toBe(5);
  });

  it('allows optional fields on EvidenceSourceReference and DeterministicFeatureInvalid', () => {
    const refWithoutOptionals: EvidenceSourceReference = {
      referenceId: 'ref-1',
      sourceType: 'api',
      locator: 'https://example.com',
      observedAt: '2026-01-01T00:00:00.000Z',
    };

    const invalidFeatureWithoutOptionals: DeterministicFeatureInvalid = {
      featureId: 'feat-1',
      family: 'market_state',
      featureKind: 'number',
      status: 'invalid',
      value: null,
      unit: null,
      confidenceBps: 0,
      calculator: { name: 'calc', version: '1.0' },
      inputLineage: ['lineage-1'],
      warnings: ['warning-1'],
    };

    expect(refWithoutOptionals.publishedAt).toBeUndefined();
    expect(invalidFeatureWithoutOptionals.observedAt).toBeUndefined();
  });
});
