import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EvidenceFamilyCard } from './EvidenceFamilyCard.js';
import type { EvidenceFamilyCardViewModel } from '../view-models/EvidenceViewModel.js';

afterEach(() => {
  cleanup();
});

describe('EvidenceFamilyCard lineage drill-down and privacy', () => {
  it('renders deterministic feature inputs as reference ID, source type label, and observation time without locators or links', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'market_state',
      title: 'Market state',
      contributed: false,
      availability: 'available',
      lastCollectedLabel: 'Last run 30m ago',
      freshnessLabel: 'Fresh',
      stale: false,
      rows: [
        {
          label: 'feat-price-001',
          value: '150.25 usd',
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
                referenceId: 'missing-ref-99',
                sourceTypeLabel: 'Unknown source type',
                observedAtLabel: '—',
                isResolved: false,
              },
            ],
          },
        },
      ],
      claims: [],
    };

    render(<EvidenceFamilyCard card={card} />);

    // Derivation starts collapsed
    expect(screen.queryByText('ref-orca-001')).toBeNull();

    // Expand derivation row
    const toggle = screen.getByRole('button', {
      name: 'Expand derivation for feat-price-001',
    });
    fireEvent.click(toggle);

    // Resolved ref metadata
    expect(screen.getByText('ref-orca-001')).toBeDefined();
    expect(screen.getByText('API')).toBeDefined();

    // Unresolved ref labeled explicitly
    expect(screen.getByText('missing-ref-99')).toBeDefined();
    expect(screen.getByText('Unresolved source reference')).toBeDefined();

    // Privacy checks: no links
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders contextual claim source references and explicitly labels unresolved references', () => {
    const card: EvidenceFamilyCardViewModel = {
      id: 'supportResistance',
      title: 'Support & resistance',
      contributed: false,
      availability: 'available',
      lastCollectedLabel: 'Last run 30m ago',
      freshnessLabel: 'Fresh',
      stale: false,
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
              referenceId: 'ref-chain-001',
              sourceTypeLabel: 'On-Chain',
              observedAtLabel: '2024-01-15T09:45:00Z',
              isResolved: true,
            },
            {
              referenceId: 'unresolved-claim-ref-100',
              sourceTypeLabel: 'Unknown source type',
              observedAtLabel: '—',
              isResolved: false,
            },
          ],
        },
      ],
    };

    render(<EvidenceFamilyCard card={card} />);

    expect(screen.getByText('Strong support at 140 USDC')).toBeDefined();

    // Claim source refs
    expect(screen.getByText('ref-chain-001')).toBeDefined();
    expect(screen.getByText('On-Chain')).toBeDefined();
    expect(screen.getByText('2024-01-15T09:45:00Z')).toBeDefined();

    // Unresolved claim ref
    expect(screen.getByText('unresolved-claim-ref-100')).toBeDefined();
    expect(screen.getByText('Unresolved source reference')).toBeDefined();

    // Privacy checks: no links
    expect(screen.queryByRole('link')).toBeNull();
  });
});
