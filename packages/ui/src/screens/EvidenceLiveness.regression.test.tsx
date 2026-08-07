import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EvidenceBundle } from '@clmm/application/public';
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import {
  buildEvidenceViewModel,
  collectionStaleAfterMs,
} from '../view-models/EvidenceViewModel.js';
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

    expect(card!.availability).toBe('collection_stopped');
    expect(card!.lastCollectedLabel).toBe('Last run 8h ago');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('Collection stopped')).toBeDefined();
    expect(screen.getByText('Last run 8h ago')).toBeDefined();
  });

  it('configured fresh unavailable family is rendered as No qualifying data', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const card = vm.cards.find((c) => c.id === 'flows');
    expect(card).toBeDefined();

    expect(card!.availability).toBe('no_data');
    expect(card!.lastCollectedLabel).toBe('Last run 30m ago');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('No qualifying data')).toBeDefined();
    expect(screen.getByText('Last run 30m ago')).toBeDefined();
  });

  it('unconfigured unavailable family is rendered as Not configured', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const card = vm.cards.find((c) => c.id === 'supportResistance');
    expect(card).toBeDefined();

    expect(card!.availability).toBe('not_configured');
    expect(card!.lastCollectedLabel).toBe('No collector configured');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('Not configured')).toBeDefined();
    expect(screen.getByText('No collector configured')).toBeDefined();
  });

  it('configured unavailable family with no successful run is rendered as Collection stopped', () => {
    const bundle = createSimulatedOutageBundle();
    (bundle.assessment as unknown as Record<string, unknown>)['liveness'] = {
      ...liveness,
      derivatives: { isConfigured: true, lastCollectedAt: null },
    };

    const vm = buildEvidenceViewModel(bundle, NOW);
    const card = vm.cards.find((c) => c.id === 'derivatives');
    expect(card).toBeDefined();

    expect(card!.availability).toBe('collection_stopped');
    expect(card!.lastCollectedLabel).toBe('No successful run recorded');

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.getByText('Collection stopped')).toBeDefined();
    expect(screen.getByText('No successful run recorded')).toBeDefined();
  });

  it('becomes stopped exactly at the family-specific staleness boundary', () => {
    const bundle = createSimulatedOutageBundle();
    const threshold = collectionStaleAfterMs('flows');
    const atBoundary = new Date(NOW - threshold).toISOString();
    const oneMsInsideBoundary = new Date(NOW - threshold + 1).toISOString();

    (bundle.assessment as unknown as Record<string, unknown>)['liveness'] = {
      flows: { isConfigured: true, lastCollectedAt: oneMsInsideBoundary },
    };
    expect(
      buildEvidenceViewModel(bundle, NOW).cards.find((c) => c.id === 'flows')?.availability,
    ).toBe('no_data');

    (bundle.assessment as unknown as Record<string, unknown>)['liveness'] = {
      flows: { isConfigured: true, lastCollectedAt: atBoundary },
    };
    expect(
      buildEvidenceViewModel(bundle, NOW).cards.find((c) => c.id === 'flows')?.availability,
    ).toBe('collection_stopped');
  });

  it('applies each family its own cadence, so a slow collector is not reported as stopped', () => {
    const bundle = createSimulatedOutageBundle();
    const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1_000).toISOString();

    (bundle.assessment as unknown as Record<string, unknown>)['liveness'] = {
      derivatives: { isConfigured: true, lastCollectedAt: threeHoursAgo },
      events: { isConfigured: true, lastCollectedAt: threeHoursAgo },
    };

    const vm = buildEvidenceViewModel(bundle, NOW);

    // perp-liquidation runs every 5 minutes — 3h silent is an outage.
    expect(vm.cards.find((c) => c.id === 'derivatives')?.availability).toBe('collection_stopped');
    // context-events runs every 4 hours — 3h silent is entirely normal.
    expect(vm.cards.find((c) => c.id === 'events')?.availability).toBe('no_data');
  });

  it('available partial and invalid evidence states are not overwritten by liveness', () => {
    const bundle = createSimulatedOutageBundle();
    // Risk feature has status available
    bundle.deterministicFeatures[0]!.status = 'available';
    bundle.deterministicFeatures[0]!.value = 42;

    (bundle.assessment as unknown as Record<string, unknown>)['liveness'] = {
      risk: { isConfigured: true, lastCollectedAt: '2024-01-15T10:00:00.000Z' }, // 8h ago
    };

    let vm = buildEvidenceViewModel(bundle, NOW);
    let card = vm.cards.find((c) => c.id === 'risk');
    expect(card?.availability).toBe('available');

    // Change status to invalid
    bundle.deterministicFeatures[0]!.status = 'invalid';
    vm = buildEvidenceViewModel(bundle, NOW);
    card = vm.cards.find((c) => c.id === 'risk');
    expect(card?.availability).toBe('invalid');
  });

  it('one family never borrows another family last collection time', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const riskCard = vm.cards.find((c) => c.id === 'risk');
    const flowsCard = vm.cards.find((c) => c.id === 'flows');

    expect(riskCard?.lastCollectedLabel).toBe('Last run 8h ago');
    expect(flowsCard?.lastCollectedLabel).toBe('Last run 30m ago');
  });

  it('accessibility label describes the human-facing liveness state', () => {
    const bundle = createSimulatedOutageBundle();
    const vm = buildEvidenceViewModel(bundle, NOW);

    const card = vm.cards.find((c) => c.id === 'risk');
    render(<EvidenceFamilyCard card={card!} />);

    const cardElement = screen.getByTestId('evidence-family-card-risk');
    const ariaLabel = cardElement.getAttribute('aria-label') || '';

    expect(ariaLabel).toContain('Collection stopped');
    expect(ariaLabel).toContain('Last run 8h ago');
    expect(ariaLabel).not.toContain('collection_stopped');
  });
});
