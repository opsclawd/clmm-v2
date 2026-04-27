import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SrLevelsBlock } from '@clmm/application/public';
import { MarketContextPanel } from './MarketContextPanel.js';

afterEach(() => {
  cleanup();
});

function fixtureBlock(): SrLevelsBlock {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: null,
    summary: 'Bullish continuation, support at $132.',
    capturedAtUnixMs: 1_745_712_000_000,
    supports: [{ price: 132.4 }],
    resistances: [{ price: 148.2 }],
  };
}

describe('MarketContextPanel', () => {
  it('renders nothing when fully idle (no data, not loading, not errored)', () => {
    const { container } = render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders the loading skeleton when isLoading and there is no cached data', () => {
    render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading
        isError={false}
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByTestId('market-context-panel-skeleton')).toBeTruthy();
  });

  it('renders cached data while background-fetching (isLoading with cached srLevels)', () => {
    render(
      <MarketContextPanel
        srLevels={fixtureBlock()}
        isLoading
        isError={false}
        isUnsupported={false}
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });

  it('renders the unavailable caption when isUnsupported', () => {
    render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the unavailable caption when isError', () => {
    render(
      <MarketContextPanel
        srLevels={undefined}
        isLoading={false}
        isError
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the unavailable caption when srLevels is null (transient regime-engine failure)', () => {
    render(
      <MarketContextPanel
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders MarketThesisCard and SrLevelsCard when given a populated block', () => {
    render(
      <MarketContextPanel
        srLevels={fixtureBlock()}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Bullish continuation, support at $132.')).toBeTruthy();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });

  it('omits MarketThesisCard when the block has no summary', () => {
    const block = { ...fixtureBlock(), summary: null };
    render(
      <MarketContextPanel
        srLevels={block}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={block.capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });
});