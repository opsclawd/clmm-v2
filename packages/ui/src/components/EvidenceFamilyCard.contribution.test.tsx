import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EvidenceFamilyCardViewModel } from '../view-models/EvidenceViewModel.js';
import { EvidenceFamilyCard } from './EvidenceFamilyCard.js';

afterEach(() => cleanup());

const availableCard: EvidenceFamilyCardViewModel = {
  id: 'market_state',
  title: 'Market state',
  contributed: false,
  availability: 'available',
  lastCollectedLabel: null,
  freshnessLabel: 'Fresh',
  stale: false,
  rows: [],
  claims: [],
  warnings: [],
};

describe('EvidenceFamilyCard contribution', () => {
  it('renders a distinct Contributed badge while retaining availability and freshness status', () => {
    const contributedCard: EvidenceFamilyCardViewModel = {
      ...availableCard,
      contributed: true,
    };

    render(<EvidenceFamilyCard card={contributedCard} />);

    expect(screen.getByText('Contributed')).toBeDefined();
    expect(screen.getByText('available')).toBeDefined();
    expect(screen.getByText('Fresh')).toBeDefined();
    expect(
      screen.getByTestId('evidence-family-card-market_state').getAttribute('aria-label'),
    ).toContain('Contributed');
  });

  it('renders an unselected available family as informative and not as an error', () => {
    render(<EvidenceFamilyCard card={availableCard} />);

    const card = screen.getByTestId('evidence-family-card-market_state');
    expect(card.textContent).toContain('available');
    expect(card.textContent).toContain('Fresh');
    expect(card.textContent).not.toContain('Contributed');
    expect(card.textContent?.toLowerCase()).not.toContain('error');
  });
});
