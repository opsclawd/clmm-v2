import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { SrThesisCardViewModel } from '../view-models/SrThesesViewModel.js';
import { SrThesisCard } from './SrThesisCard.js';

afterEach(() => {
  cleanup();
});

function makeCard(partial: Partial<SrThesisCardViewModel> = {}): SrThesisCardViewModel {
  return {
    asset: 'SOL/USDC',
    timeframe: '4h',
    bias: 'bullish',
    biasTone: 'safe',
    setupType: 'breakout',
    supportLevels: ['132'],
    resistanceLevels: ['148'],
    entryZone: '135-138',
    targets: ['148'],
    invalidation: '128',
    trigger: 'close above 145',
    sourceHandle: 'analyst42',
    sourceKind: 'twitter',
    sourceReliability: 'high',
    sourceUrl: null,
    chartReference: null,
    rawThesisText: 'thesis body',
    rawThesisCollapsedByDefault: true,
    timestampLabel: '2026-05-07T00:30:00Z',
    notes: null,
    ...partial,
  };
}

describe('SrThesisCard', () => {
  it('renders bias, setup type, and timeframe', () => {
    render(<SrThesisCard card={makeCard()} />);
    expect(screen.getByText('bullish')).toBeTruthy();
    expect(screen.getByText('breakout')).toBeTruthy();
    expect(screen.getByText(/4h/)).toBeTruthy();
  });

  it('renders support and resistance levels', () => {
    render(
      <SrThesisCard
        card={makeCard({
          supportLevels: ['132', '128'],
          resistanceLevels: ['148'],
          invalidation: null,
          targets: [],
        })}
      />,
    );
    expect(screen.getByText('132')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('148')).toBeTruthy();
  });

  it('renders entry zone, targets, invalidation, and trigger', () => {
    render(<SrThesisCard card={makeCard({ entryZone: '135-138', targets: ['148'] })} />);
    expect(screen.getByText('135-138')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('close above 145')).toBeTruthy();
  });

  it('renders source handle, kind, and reliability', () => {
    render(
      <SrThesisCard
        card={makeCard({
          sourceHandle: 'analyst42',
          sourceKind: 'twitter',
          sourceReliability: 'high',
        })}
      />,
    );
    expect(screen.getByText('analyst42')).toBeTruthy();
    expect(screen.getByText(/twitter/)).toBeTruthy();
    expect(screen.getByText(/high/)).toBeTruthy();
  });

  it('renders timestamp when provided', () => {
    render(<SrThesisCard card={makeCard({ timestampLabel: '2026-05-07T00:30:00Z' })} />);
    expect(screen.getByText(/2026-05-07/)).toBeTruthy();
  });

  it('renders unknown bias / setup / reliability strings without crashing', () => {
    render(
      <SrThesisCard
        card={makeCard({
          bias: 'mildly-constructive-but-cautious',
          biasTone: 'neutral',
          setupType: 'distribution-into-vwap',
          sourceReliability: 'tier-experimental-2026',
        })}
      />,
    );
    expect(screen.getByText('mildly-constructive-but-cautious')).toBeTruthy();
    expect(screen.getByText('distribution-into-vwap')).toBeTruthy();
    expect(screen.getByText(/tier-experimental-2026/)).toBeTruthy();
  });

  it('keeps raw thesis text collapsed by default and reveals on toggle', () => {
    render(<SrThesisCard card={makeCard({ rawThesisText: 'long body' })} />);
    expect(screen.queryByText('long body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /show raw thesis/i }));
    expect(screen.getByText('long body')).toBeTruthy();
  });
});
