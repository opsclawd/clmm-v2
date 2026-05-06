import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SrLevelsBlock } from '@clmm/application/public';
import { SrInsightsSection } from './SrInsightsSection.js';

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

describe('SrInsightsSection', () => {
  it('renders nothing when fully idle (no data, not loading, not errored)', () => {
    const { container } = render(
      <SrInsightsSection
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={1_745_712_000_000}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders the loading skeleton when isLoading and there is no cached data', () => {
    render(
      <SrInsightsSection
        srLevels={undefined}
        isLoading
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByTestId('sr-insights-section-skeleton')).toBeTruthy();
  });

  it('renders cached data while background-fetching (isLoading with cached srLevels)', () => {
    render(
      <SrInsightsSection
        srLevels={fixtureBlock()}
        isLoading
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });

  it('renders the unavailable caption when isUnsupported', () => {
    render(
      <SrInsightsSection
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        isMixedPools={false}
        poolLabel={null}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the unavailable caption when isError without cached data', () => {
    render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders cached data with degraded message when isError but srLevels is present', () => {
    render(
      <SrInsightsSection
        srLevels={fixtureBlock()}
        isLoading={false}
        isError
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getByText('Refresh failed — showing last available analysis.')).toBeTruthy();
  });

  it('renders the unavailable caption when srLevels is null (transient regime-engine failure)', () => {
    render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders MarketThesisCard and SrLevelsCard when given a populated block', () => {
    render(
      <SrInsightsSection
        srLevels={fixtureBlock()}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel="SOL / USDC"
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Bullish continuation, support at $132.')).toBeTruthy();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getByText('SOL / USDC')).toBeTruthy();
  });

  it('omits MarketThesisCard when the block has no summary', () => {
    const block = { ...fixtureBlock(), summary: null };
    render(
      <SrInsightsSection
        srLevels={block}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={block.capturedAtUnixMs + 5 * 60_000}
      />,
    );

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });

  it('renders mixed-pools unavailable message when isMixedPools is true', () => {
    render(
      <SrInsightsSection
        srLevels={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools
        poolLabel={null}
        now={1_745_712_000_000}
      />,
    );

    expect(screen.getByText('Market context unavailable for mixed pools')).toBeTruthy();
  });

  it('renders Support & Resistance before Market Thesis when both are present', () => {
    const { container } = render(
      <SrInsightsSection
        srLevels={fixtureBlock()}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={fixtureBlock().capturedAtUnixMs + 5 * 60_000}
      />,
    );

    const text = container.textContent ?? '';
    const srIndex = text.indexOf('Support & Resistance');
    const thesisIndex = text.indexOf('Market Thesis');
    expect(srIndex).toBeGreaterThan(-1);
    expect(thesisIndex).toBeGreaterThan(-1);
    expect(srIndex).toBeLessThan(thesisIndex);
  });
});
