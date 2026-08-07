import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { parseEvidenceBundle } from '@clmm/application/public';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import { EvidenceFamilyCard } from '../components/EvidenceFamilyCard.js';
import { buildEvidenceViewModel } from '../view-models/EvidenceViewModel.js';

afterEach(cleanup);

function createLegacyUnavailableBundle() {
  const payload = JSON.parse(JSON.stringify(contextualFixture)) as typeof contextualFixture & {
    assessment: {
      liveness?: unknown;
      coverage: Record<string, unknown>;
    };
    contextualEvidence: Record<string, unknown>;
  };
  delete payload.assessment.liveness;
  payload.contextualEvidence.supportResistance = [];
  payload.assessment.coverage.supportResistance = 'unavailable';
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
    expect(screen.getByText('Collector status unavailable')).toBeDefined();
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
});
