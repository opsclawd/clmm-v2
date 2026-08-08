import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { parseEvidenceBundle } from '@clmm/application/public';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import livenessFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/liveness.json' with { type: 'json' };
import { EvidenceFamilyCard } from '../components/EvidenceFamilyCard.js';
import { buildEvidenceViewModel } from '../view-models/EvidenceViewModel.js';

afterEach(cleanup);

const NOW = Date.parse('2024-01-15T10:30:00.000Z');

function createLegacyUnavailableBundle() {
  const payload = JSON.parse(JSON.stringify(contextualFixture)) as typeof contextualFixture;
  const assessment = payload.assessment as {
    liveness?: unknown;
    coverage: { supportResistance?: string };
  };
  delete assessment.liveness;
  (payload.contextualEvidence as { supportResistance?: unknown[] }).supportResistance = [];
  assessment.coverage.supportResistance = 'unavailable';
  const parsed = parseEvidenceBundle(payload);
  if (!parsed) throw new Error('Legacy-compatible canonical evidence fixture must validate');
  return parsed;
}

function createTestBundle(
  family: string,
  statusOrStatuses:
    | 'available'
    | 'unavailable'
    | 'invalid'
    | Array<'available' | 'unavailable' | 'invalid'> = 'unavailable',
  livenessRecords?: Record<string, { isConfigured: boolean; lastCollectedAt: string | null }>,
) {
  const statuses = Array.isArray(statusOrStatuses) ? statusOrStatuses : [statusOrStatuses];
  const payload = JSON.parse(JSON.stringify(livenessFixture)) as typeof livenessFixture;
  payload.deterministicFeatures = statuses.map((status, index) => ({
    featureId: `feat-${family}-${index + 1}`,
    family: family,
    featureKind: 'number',
    status: status,
    value: status === 'available' ? 150.25 : null,
    unit: status === 'available' ? 'usd' : null,
    observedAt: status === 'available' ? '2024-01-15T10:00:00.000Z' : null,
    freshUntil: status === 'available' ? '2024-01-15T11:00:00.000Z' : null,
    confidenceBps: status === 'available' ? 9500 : 0,
    calculator: {
      name: 'test-aggregator',
      version: '1.0.0',
    },
    inputLineage: ['ref-price-source'],
    warnings: status === 'available' ? [] : ['warn-test-feature'],
  })) as typeof payload.deterministicFeatures;

  if (livenessRecords) {
    payload.assessment.liveness = {
      ...payload.assessment.liveness,
      ...livenessRecords,
    };
  }

  const parsed = parseEvidenceBundle(payload as unknown as Record<string, unknown>);
  if (!parsed) throw new Error('Test evidence bundle fixture must validate');
  return parsed;
}

describe('Evidence liveness contract regression', () => {
  it('renders missing liveness as Collector status unavailable', () => {
    const parsed = createLegacyUnavailableBundle();

    const card = buildEvidenceViewModel(parsed, NOW).cards.find(
      (candidate) => candidate.id === 'supportResistance',
    );
    expect(card).toMatchObject({
      availability: 'liveness_unknown',
      lastCollectedLabel: 'Collector status unavailable',
    });

    render(<EvidenceFamilyCard card={card!} />);
    expect(screen.getAllByText('Collector status unavailable').length).toBeGreaterThan(0);
  });

  it('announces unknown liveness in the family card accessibility label', () => {
    const parsed = createLegacyUnavailableBundle();
    const card = buildEvidenceViewModel(parsed, NOW).cards.find(
      (candidate) => candidate.id === 'supportResistance',
    );

    render(<EvidenceFamilyCard card={card!} />);
    expect(
      screen.getByTestId('evidence-family-card-supportResistance').getAttribute('aria-label'),
    ).toContain('Collector status unavailable');
  });

  it('preserves reported evidence states when liveness is missing', () => {
    for (const availability of ['available', 'partial', 'not_applicable'] as const) {
      const parsed = createLegacyUnavailableBundle();
      parsed.assessment.coverage.supportResistance = availability;

      expect(
        buildEvidenceViewModel(parsed, NOW).cards.find(
          (candidate) => candidate.id === 'supportResistance',
        )?.availability,
      ).toBe(availability);
    }
  });

  it('classifies every unavailable deterministic family at its own 30-minute boundary', () => {
    const deterministicFamilyIds = [
      'market_state',
      'price_quality',
      'clmm_economics',
      'position_state',
      'liquidity',
      'risk',
    ] as const;

    const thirtyMinutesMs = 30 * 60 * 1000;
    const atBoundary = new Date(NOW - thirtyMinutesMs).toISOString();
    const oneMsInsideBoundary = new Date(NOW - thirtyMinutesMs + 1).toISOString();

    for (const id of deterministicFamilyIds) {
      const freshBundle = createTestBundle(id, 'unavailable', {
        [id]: { isConfigured: true, lastCollectedAt: oneMsInsideBoundary },
      });
      const freshVm = buildEvidenceViewModel(freshBundle, NOW);
      const freshCard = freshVm.cards.find((c) => c.id === id);
      expect(freshCard).toBeDefined();
      expect(freshCard!.availability).toBe('no_data');

      const stoppedBundle = createTestBundle(id, 'unavailable', {
        [id]: { isConfigured: true, lastCollectedAt: atBoundary },
      });
      const stoppedVm = buildEvidenceViewModel(stoppedBundle, NOW);
      const stoppedCard = stoppedVm.cards.find((c) => c.id === id);
      expect(stoppedCard).toBeDefined();
      expect(stoppedCard!.availability).toBe('collection_stopped');
      expect(stoppedCard!.stale).toBe(true);
    }
  });

  it('uses a deterministic sub-family record and never falls back to the aggregate record', () => {
    const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    const secondsAgo = new Date(NOW - 5 * 1000).toISOString();

    const bundleWithSpecific = createTestBundle('market_state', 'unavailable', {
      deterministic: { isConfigured: true, lastCollectedAt: secondsAgo },
      market_state: { isConfigured: true, lastCollectedAt: threeHoursAgo },
    });

    const vmWithSpecific = buildEvidenceViewModel(bundleWithSpecific, NOW);
    const marketStateCard = vmWithSpecific.cards.find((c) => c.id === 'market_state');

    expect(marketStateCard).toBeDefined();
    expect(marketStateCard!.availability).toBe('collection_stopped');
    expect(marketStateCard!.lastCollectedLabel).toBe('Last run 3h ago');

    delete bundleWithSpecific.assessment.liveness?.['market_state'];

    const vmWithoutSpecific = buildEvidenceViewModel(bundleWithSpecific, NOW);
    const fallbackCard = vmWithoutSpecific.cards.find((c) => c.id === 'market_state');

    expect(fallbackCard).toBeDefined();
    expect(fallbackCard!.availability).toBe('liveness_unknown');
    expect(fallbackCard!.lastCollectedLabel).toBe('Collector status unavailable');
  });

  it('preserves available partial and invalid deterministic states when liveness is present', () => {
    const threeHoursAgo = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
    const staleLiveness = {
      market_state: { isConfigured: true, lastCollectedAt: threeHoursAgo },
    };

    const availableBundle = createTestBundle('market_state', 'available', staleLiveness);
    const availableVm = buildEvidenceViewModel(availableBundle, NOW);
    const availableCard = availableVm.cards.find((c) => c.id === 'market_state');
    expect(availableCard?.availability).toBe('available');

    const partialBundle = createTestBundle('market_state', ['available', 'unavailable'], staleLiveness);
    const partialVm = buildEvidenceViewModel(partialBundle, NOW);
    const partialCard = partialVm.cards.find((c) => c.id === 'market_state');
    expect(partialCard?.availability).toBe('partial');

    const invalidBundle = createTestBundle('market_state', 'invalid', staleLiveness);
    const invalidVm = buildEvidenceViewModel(invalidBundle, NOW);
    const invalidCard = invalidVm.cards.find((c) => c.id === 'market_state');
    expect(invalidCard?.availability).toBe('invalid');
  });

  it('suppresses the collector label for an available deterministic family', () => {
    const bundle = createTestBundle('market_state', 'available');
    const vm = buildEvidenceViewModel(bundle, NOW);
    const card = vm.cards.find((c) => c.id === 'market_state');

    expect(card).toBeDefined();
    expect(card!.lastCollectedLabel).toBeNull();

    render(<EvidenceFamilyCard card={card!} />);

    expect(screen.queryByText('Collector status unavailable')).toBeNull();
    const cardElement = screen.getByTestId('evidence-family-card-market_state');
    expect(cardElement.getAttribute('aria-label')).not.toContain('Collector status unavailable');
  });
});

