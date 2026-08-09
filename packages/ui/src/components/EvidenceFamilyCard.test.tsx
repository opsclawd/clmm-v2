import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EvidenceFamilyCard } from './EvidenceFamilyCard.js';
import type { EvidenceFamilyCardViewModel } from '../view-models/EvidenceViewModel.js';

afterEach(() => {
  cleanup();
});

const derivationCapableCard: EvidenceFamilyCardViewModel = {
  id: 'market_state',
  title: 'Market state',
  contributed: false,
  availability: 'available',
  lastCollectedLabel: 'Last run 30m ago',
  freshnessLabel: 'Fresh',
  stale: false,
  warnings: ['Family warning: stale source'],
  rows: [
    {
      label: 'feat-price-001',
      value: '150.25 usd',
      warnings: ['Row warning: single source'],
      derivation: {
        inputCount: 2,
        timeSpanLabel: '5 minutes',
        calculatorLabel: 'OrcaPriceCalc v1.0',
        observedAtLabel: '2024-01-15T10:00:00Z',
        freshUntilLabel: '2024-01-15T10:05:00Z',
        isStale: false,
        inputs: [
          {
            referenceId: 'ref-orca-001',
            sourceTypeLabel: 'API',
            observedAtLabel: '2024-01-15T10:00:00Z',
            isResolved: true,
          },
          {
            referenceId: 'ref-pyth-001',
            sourceTypeLabel: 'API',
            observedAtLabel: '2024-01-15T09:59:00Z',
            isResolved: true,
          },
        ],
      },
    },
    {
      label: 'feat-vol-001',
      value: '1000000 usd',
      derivation: {
        inputCount: 1,
        timeSpanLabel: '0 minutes',
        calculatorLabel: 'VolumeCalc v1.0',
        observedAtLabel: '2024-01-15T10:00:00Z',
        freshUntilLabel: '2024-01-15T10:05:00Z',
        isStale: true,
        inputs: [
          {
            referenceId: 'ref-rpc-001',
            sourceTypeLabel: 'On-Chain',
            observedAtLabel: '2024-01-15T10:00:00Z',
            isResolved: true,
          },
        ],
      },
    },
    {
      label: 'non-derivation-row',
      value: 'static value',
    },
  ],
  claims: [],
};

describe('EvidenceFamilyCard', () => {
  it('renders unavailable evidence family with coverage status', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'supportResistance',
      title: 'Support & resistance',
      contributed: false,
      availability: 'unavailable',
      lastCollectedLabel: 'No collector configured',
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
    expect(cardElement.getAttribute('aria-label')).toBe(
      'Support & resistance, unavailable, No collector configured, —',
    );
  });

  it('renders available badge, fresh status, and deterministic rows', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'market_state',
      title: 'Market state',
      contributed: false,
      availability: 'available',
      lastCollectedLabel: 'Last run 30m ago',
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
      contributed: false,
      availability: 'available',
      lastCollectedLabel: 'Last run 30m ago',
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
          sources: [
            {
              referenceId: 'ref-claim-001',
              sourceTypeLabel: 'API',
              observedAtLabel: '2024-01-15T10:00:00Z',
              isResolved: true,
            },
          ],
        },
      ],
    };

    render(<EvidenceFamilyCard card={card} />);

    expect(screen.getByText('Support & resistance')).toBeDefined();
    expect(screen.getByText('Stale')).toBeDefined();
    expect(screen.getByText('Strong support at 140 USDC')).toBeDefined();
    expect(screen.getByText('bullish')).toBeDefined();

    expect(screen.getByText(/85%/)).toBeDefined();
    expect(screen.getAllByText(/2024-01-15T10:00:00Z/).length).toBeGreaterThan(0);
    expect(screen.getByText(/2024-01-15T12:00:00Z/)).toBeDefined();
  });

  it('keeps feature derivation collapsed until its row is pressed', () => {
    render(<EvidenceFamilyCard card={derivationCapableCard} />);

    const toggle = screen.getByRole('button', {
      name: 'Expand derivation for feat-price-001',
    });
    expect(toggle).toBeDefined();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('evidence-freshness-status-feat-price-001')).toBeNull();
  });

  it('expands and collapses derivation rows independently', () => {
    render(<EvidenceFamilyCard card={derivationCapableCard} />);

    const togglePrice = screen.getByRole('button', {
      name: 'Expand derivation for feat-price-001',
    });
    const toggleVol = screen.getByRole('button', {
      name: 'Expand derivation for feat-vol-001',
    });

    // Expand price row
    fireEvent.click(togglePrice);

    expect(
      screen.getByRole('button', { name: 'Collapse derivation for feat-price-001' }),
    ).toBeDefined();
    expect(togglePrice.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getByText(
        'feat-price-001 = 150.25 usd, from 2 observations spanning 5 minutes, computed by OrcaPriceCalc v1.0, observed 2024-01-15T10:00:00Z, fresh until 2024-01-15T10:05:00Z.',
      ),
    ).toBeDefined();
    expect(screen.getByTestId('evidence-freshness-status-feat-price-001').textContent).toBe(
      'Status: Fresh',
    );

    // Vol row remains collapsed
    expect(toggleVol.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('evidence-freshness-status-feat-vol-001')).toBeNull();

    // Collapse price row again
    fireEvent.click(togglePrice);
    expect(togglePrice.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('evidence-freshness-status-feat-price-001')).toBeNull();
  });

  it('renders input references as wrapping text rather than links', () => {
    render(<EvidenceFamilyCard card={derivationCapableCard} />);

    const togglePrice = screen.getByRole('button', {
      name: 'Expand derivation for feat-price-001',
    });
    fireEvent.click(togglePrice);

    expect(screen.getByText('ref-orca-001')).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders family and feature warnings beside affected evidence', () => {
    render(<EvidenceFamilyCard card={derivationCapableCard} />);

    expect(screen.getByText('Family warning: stale source')).toBeDefined();
    expect(screen.getByText('Row warning: single source')).toBeDefined();
  });

  it('preserves expanded rows state when card prop changes', () => {
    const { rerender } = render(<EvidenceFamilyCard card={derivationCapableCard} />);

    const togglePrice = screen.getByRole('button', {
      name: 'Expand derivation for feat-price-001',
    });
    fireEvent.click(togglePrice);
    expect(togglePrice.getAttribute('aria-expanded')).toBe('true');

    // Simulate bundle update by passing a new card object
    const updatedCard: EvidenceFamilyCardViewModel = {
      ...derivationCapableCard,
      freshnessLabel: 'Refreshed',
    };
    rerender(<EvidenceFamilyCard card={updatedCard} />);

    const togglePriceRefreshed = screen.getByRole('button', {
      name: 'Collapse derivation for feat-price-001',
    });
    expect(togglePriceRefreshed.getAttribute('aria-expanded')).toBe('true');
  });
});
