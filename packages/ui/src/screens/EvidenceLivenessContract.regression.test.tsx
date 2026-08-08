import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { parseEvidenceBundle } from '@clmm/application/public';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import livenessFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/liveness.json' with { type: 'json' };
import { EvidenceFamilyCard } from '../components/EvidenceFamilyCard.js';
import { buildEvidenceViewModel } from '../view-models/EvidenceViewModel.js';

afterEach(cleanup);

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

describe('Evidence liveness contract regression', () => {
  it('renders missing liveness as Collector status unavailable', () => {
    const parsed = createLegacyUnavailableBundle();

    const card = buildEvidenceViewModel(parsed, Date.parse('2024-01-15T10:30:00.000Z')).cards.find(
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
    const card = buildEvidenceViewModel(parsed, Date.parse('2024-01-15T10:30:00.000Z')).cards.find(
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
        buildEvidenceViewModel(parsed, Date.parse('2024-01-15T10:30:00.000Z')).cards.find(
          (candidate) => candidate.id === 'supportResistance',
        )?.availability,
      ).toBe(availability);
    }
  });
  it("does not map the contract's single `deterministic` liveness onto deterministic cards", () => {
    // The contract carries one `deterministic` liveness value, reduced with
    // Math.max() across five sources — one of which (clmm-v2-bundle) runs every
    // minute. Mapping it onto these cards would claim "Last run 1m ago" while
    // their features sat hours stale, so they report no collector status until
    // per-sub-family liveness exists. See clmm-v2#155.
    const parsed = parseEvidenceBundle(
      JSON.parse(JSON.stringify(livenessFixture)) as unknown as Record<string, unknown>,
    );
    if (!parsed) throw new Error('canonical liveness fixture must validate');
    expect(parsed.assessment.liveness?.['deterministic']).toBeDefined();

    const vm = buildEvidenceViewModel(parsed, Date.parse('2024-01-15T10:30:00.000Z'));
    const marketState = vm.cards.find((c) => c.id === 'market_state');

    expect(marketState).toBeDefined();
    expect(marketState!.lastCollectedLabel).toBe('Collector status unavailable');
  });
});
