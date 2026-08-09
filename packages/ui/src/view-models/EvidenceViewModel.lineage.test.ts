import { describe, expect, it } from 'vitest';
import type { EvidenceBundle } from '@clmm/application/public';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import { buildEvidenceViewModel } from './EvidenceViewModel.js';

describe('EvidenceViewModel lineage projection', () => {
  const FIXED_NOW = Date.parse('2024-01-15T10:30:00.000Z');

  it('projects feature lineage as reference type and observation time without locator data', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    const URL_LOCATOR = 'https://api.example.com/price-feed-v1';

    bundle.sourceReferences = [
      {
        referenceId: 'ref-api-001',
        sourceType: 'api',
        locator: URL_LOCATOR,
        observedAt: '2024-01-15T09:30:00.000Z',
      },
    ];

    bundle.deterministicFeatures = [
      {
        featureId: 'feat-price-001',
        family: 'market_state',
        featureKind: 'number',
        status: 'available',
        value: 150.25,
        unit: 'usd',
        observedAt: '2024-01-15T10:00:00.000Z',
        freshUntil: '2024-01-15T11:00:00.000Z',
        confidenceBps: 9500,
        calculator: { name: 'price-aggregator', version: '1.0.0' },
        inputLineage: ['ref-api-001', 'missing-lineage-id-999'],
        warnings: [],
      },
    ];

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    const card = vm.cards.find((c) => c.id === 'market_state');
    const row = card?.rows.find((r) => r.label === 'feat-price-001');
    const derivation = row?.derivation;

    expect(derivation).toBeDefined();
    expect(derivation?.inputs).toHaveLength(2);

    const resolvedInput = derivation?.inputs[0];
    expect(resolvedInput).toEqual({
      referenceId: 'ref-api-001',
      sourceTypeLabel: 'API',
      observedAtLabel: '2024-01-15T09:30:00Z',
      isResolved: true,
    });
    expect(resolvedInput).not.toHaveProperty('locator');

    const unresolvedInput = derivation?.inputs[1];
    expect(unresolvedInput).toEqual({
      referenceId: 'missing-lineage-id-999',
      sourceTypeLabel: 'Unknown source type',
      observedAtLabel: '—',
      isResolved: false,
    });
    expect(unresolvedInput).not.toHaveProperty('locator');

    const rawJson = JSON.stringify(derivation?.inputs);
    expect(rawJson).not.toContain(URL_LOCATOR);
  });

  it('projects contextual claim lineage and preserves unresolved references honestly', () => {
    const bundle = JSON.parse(JSON.stringify(contextualFixture)) as unknown as EvidenceBundle;
    const HASH_CHAIN_LOCATOR = '0x1234567890abcdef1234567890abcdef12345678';
    const DOC_LOCATOR = 'https://docs.example.com/governance-proposal-42';

    bundle.sourceReferences = [
      {
        referenceId: 'ref-chain-001',
        sourceType: 'chain',
        locator: HASH_CHAIN_LOCATOR,
        observedAt: '2024-01-15T09:45:00.000Z',
      },
      {
        referenceId: 'ref-doc-001',
        sourceType: 'document',
        locator: DOC_LOCATOR,
        observedAt: '2024-01-15T08:00:00.000Z',
      },
    ];

    bundle.contextualEvidence = {
      supportResistance: [
        {
          evidenceId: 'ctx-sr-001',
          kind: 'support_zone',
          claim: 'Strong support at 148.50',
          direction: 'bullish',
          confidenceBps: 7500,
          observedAt: '2024-01-15T09:30:00.000Z',
          expiresAt: '2024-01-15T12:00:00.000Z',
          sourceReferenceIds: ['ref-chain-001', 'ref-doc-001', 'unresolved-claim-ref-888'],
          provenanceMethod: 'derived',
        },
      ],
      flows: [],
      derivatives: [],
      events: [],
      newsRegulatory: [],
    };

    const vm = buildEvidenceViewModel(bundle, FIXED_NOW);
    const srCard = vm.cards.find((c) => c.id === 'supportResistance');
    const claim = srCard?.claims[0];

    expect(claim).toBeDefined();
    expect(claim?.sources).toHaveLength(3);

    expect(claim?.sources[0]).toEqual({
      referenceId: 'ref-chain-001',
      sourceTypeLabel: 'On-Chain',
      observedAtLabel: '2024-01-15T09:45:00Z',
      isResolved: true,
    });
    expect(claim?.sources[0]).not.toHaveProperty('locator');

    expect(claim?.sources[1]).toEqual({
      referenceId: 'ref-doc-001',
      sourceTypeLabel: 'Document',
      observedAtLabel: '2024-01-15T08:00:00Z',
      isResolved: true,
    });
    expect(claim?.sources[1]).not.toHaveProperty('locator');

    expect(claim?.sources[2]).toEqual({
      referenceId: 'unresolved-claim-ref-888',
      sourceTypeLabel: 'Unknown source type',
      observedAtLabel: '—',
      isResolved: false,
    });
    expect(claim?.sources[2]).not.toHaveProperty('locator');

    const rawJson = JSON.stringify(claim?.sources);
    expect(rawJson).not.toContain(HASH_CHAIN_LOCATOR);
    expect(rawJson).not.toContain(DOC_LOCATOR);
  });
});
