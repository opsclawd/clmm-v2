import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EvidenceFamilyCard } from './EvidenceFamilyCard.js';
import type { EvidenceFamilyCardViewModel } from '../view-models/EvidenceViewModel.js';

afterEach(() => {
  cleanup();
});

describe('EvidenceFamilyCard', () => {
  it('renders unavailable evidence family with coverage status', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'supportResistance',
      title: 'Support & resistance',
      availability: 'unavailable',
      freshnessLabel: '—',
      stale: false,
      rows: [{ label: 'Claims', value: '—' }],
      claims: [],
    };

    const { container } = render(<EvidenceFamilyCard card={card} />);

    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('Support & resistance')).toBeDefined();
    expect(screen.getByText('unavailable')).toBeDefined();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    const cardElement = screen.getByTestId('evidence-family-card-supportResistance');
    expect(cardElement).toBeDefined();
    expect(cardElement.getAttribute('aria-label')).toBe('Support & resistance, unavailable, —');
  });

  it('renders available badge, fresh status, and deterministic rows', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'market_state',
      title: 'Market state',
      availability: 'available',
      freshnessLabel: 'Fresh',
      stale: false,
      rows: [
        { label: 'feat-price-001', value: '150.25 usd' },
        { label: 'feat-vol-001', value: '1000000 usd' },
      ],
      claims: [],
    };

    render(<EvidenceFamilyCard card={card} />);

    expect(screen.getByText('Market state')).toBeDefined();
    expect(screen.getByText('available')).toBeDefined();
    expect(screen.getByText('Fresh')).toBeDefined();
    expect(screen.getByText('feat-price-001')).toBeDefined();
    expect(screen.getByText('150.25 usd')).toBeDefined();
    expect(screen.getByText('feat-vol-001')).toBeDefined();
    expect(screen.getByText('1000000 usd')).toBeDefined();
  });

  it('renders contextual claims with direction, confidence, and timestamps', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'supportResistance',
      title: 'Support & resistance',
      availability: 'available',
      freshnessLabel: 'Stale',
      stale: true,
      rows: [{ label: 'Claims count', value: '1' }],
      claims: [
        {
          claim: 'Strong support at 140 USDC',
          direction: 'bullish',
          confidenceLabel: '85%',
          observedAtLabel: '2024-01-15T10:00:00Z',
          expiresAtLabel: '2024-01-15T12:00:00Z',
        },
      ],
    };

    render(<EvidenceFamilyCard card={card} />);

    expect(screen.getByText('Support & resistance')).toBeDefined();
    expect(screen.getByText('Stale')).toBeDefined();
    expect(screen.getByText('Strong support at 140 USDC')).toBeDefined();
    expect(screen.getByText('bullish')).toBeDefined();

    expect(screen.getByText(/85%/)).toBeDefined();
    expect(screen.getByText(/2024-01-15T10:00:00Z/)).toBeDefined();
    expect(screen.getByText(/2024-01-15T12:00:00Z/)).toBeDefined();
  });
});
