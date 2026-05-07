import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { SrThesesViewModel, SrThesisCardViewModel } from '../view-models/SrThesesViewModel.js';
import { SrThesesPanel } from './SrThesesPanel.js';

afterEach(() => {
  cleanup();
});

function makeCard(handle: string): SrThesisCardViewModel {
  return {
    asset: 'SOL/USDC',
    timeframe: '4h',
    bias: 'bullish',
    biasTone: 'safe',
    setupType: 'breakout',
    supportLevels: [],
    resistanceLevels: [],
    entryZone: null,
    targets: [],
    invalidation: null,
    trigger: null,
    sourceHandle: handle,
    sourceKind: 'twitter',
    sourceReliability: null,
    sourceUrl: null,
    chartReference: null,
    rawThesisText: null,
    rawThesisCollapsedByDefault: true,
    timestampLabel: null,
    notes: null,
  };
}

function makeVm(count: number): SrThesesViewModel {
  const cards = Array.from({ length: count }, (_unused, i) => makeCard(`a${i}`));
  return {
    briefSummary: 'Constructive setup forming.',
    sourceLabel: 'openclaw',
    freshnessLabel: '5m ago',
    isStale: false,
    cards,
    visibleCards: cards.slice(0, 3),
    remainingCount: Math.max(0, count - 3),
    selectedThesisIndex: 0,
    selectedCard: cards[0]!,
    overlay: { supports: [], resistances: [], targets: [], invalidation: null, entryZone: null },
  };
}

describe('SrThesesPanel', () => {
  it('renders brief summary, source label, and freshness', () => {
    render(<SrThesesPanel vm={makeVm(1)} />);
    expect(screen.getByText('Constructive setup forming.')).toBeTruthy();
    expect(screen.getByText(/openclaw/)).toBeTruthy();
    expect(screen.getByText('5m ago')).toBeTruthy();
  });

  it('renders only the first 3 cards by default', () => {
    render(<SrThesesPanel vm={makeVm(5)} />);
    expect(screen.getByText('a0')).toBeTruthy();
    expect(screen.getByText('a1')).toBeTruthy();
    expect(screen.getByText('a2')).toBeTruthy();
    expect(screen.queryByText('a3')).toBeNull();
    expect(screen.queryByText('a4')).toBeNull();
  });

  it('shows a "Show more" control when there are extra cards and reveals them on press', () => {
    render(<SrThesesPanel vm={makeVm(5)} />);
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getByText('a3')).toBeTruthy();
    expect(screen.getByText('a4')).toBeTruthy();
  });

  it('does not show "Show more" when there are 3 or fewer cards', () => {
    render(<SrThesesPanel vm={makeVm(2)} />);
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
  });
});
