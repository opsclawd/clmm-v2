import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EvidenceBundle } from '@clmm/application/public';
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import { buildEvidenceViewModel } from '../view-models/EvidenceViewModel.js';
import { EvidenceFamilyCard } from '../components/EvidenceFamilyCard.js';

afterEach(() => {
  cleanup();
});

const NOW = Date.parse('2024-01-15T18:00:00.000Z');

const liveness = {
  market_state: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  risk: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' },
  flows: { isConfigured: true, lastCollectedAt: '2024-01-15T17:30:00.000Z' },
  supportResistance: { isConfigured: false, lastCollectedAt: null },
};

function createSimulatedOutageBundle(): EvidenceBundle {
  const bundle = JSON.parse(JSON.stringify(deterministicOnlyFixture)) as unknown as EvidenceBundle;

  bundle.deterministicFeatures = [
    {
      featureId: 'feat-risk-001',
      family: 'risk',
      featureKind: 'number',
      status: 'unavailable',
      value: null,
      unit: null,
      observedAt: null,
      freshUntil: null,
      confidenceBps: 0,
      calculator: { name: 'risk-calc', version: '1.0.0' },
      inputLineage: [],
      warnings: [],
    },
  ];

  bundle.contextualEvidence = {
    supportResistance: [],
    flows: [],
    derivatives: [],
    events: [],
    newsRegulatory: [],
  };

  bundle.assessment.coverage = {
    deterministic: 'unavailable',
    supportResistance: 'unavailable',
    flows: 'unavailable',
    derivatives: 'unavailable',
    events: 'unavailable',
    newsRegulatory: 'unavailable',
    researchBrief: 'unavailable',
  };

  const coverageRecord = bundle.assessment.coverage as unknown as Record<string, string>;
  coverageRecord['risk'] = 'unavailable';
  coverageRecord['market_state'] = 'unavailable';

  (bundle.assessment as unknown as Record<string, unknown>)['liveness'] = liveness;

  return bundle;
}

describe('EvidenceLiveness regression', () => {
  it('configured stale unavailable family is rendered as Collection stopped with its last run', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const card = vm.cards.find((c) => c.id === 'risk');
    expect(card).toBeDefined();

    const projectedCard = card as unknown as {
      availability: string;
      lastCollectedLabel?: string;
    };

    expect(projectedCard.availability).toBe('collection_stopped');
    expect(projectedCard.lastCollectedLabel).toBe('Last run 8h ago');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('Collection stopped')).toBeDefined();
    expect(screen.getByText('Last run 8h ago')).toBeDefined();
  });

  it('configured fresh unavailable family is rendered as No qualifying data', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const card = vm.cards.find((c) => c.id === 'flows');
    expect(card).toBeDefined();

    const projectedCard = card as unknown as {
      availability: string;
      lastCollectedLabel?: string;
    };

    expect(projectedCard.availability).toBe('no_data');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('No qualifying data')).toBeDefined();
  });

  it('unconfigured unavailable family is rendered as Not configured', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const card = vm.cards.find((c) => c.id === 'supportResistance');
    expect(card).toBeDefined();

    const projectedCard = card as unknown as {
      availability: string;
      lastCollectedLabel?: string;
    };

    expect(projectedCard.availability).toBe('not_configured');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('Not configured')).toBeDefined();
  });
});
