import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SrLevelsBlock, SrThesesBlock } from '@clmm/application/public';
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

const SAMPLE_SR_LEVELS = fixtureBlock();

const SAMPLE_THESES_BLOCK: SrThesesBlock = {
  schemaVersion: '2.0',
  source: 'regime-engine',
  symbol: 'SOL/USDC',
  brief: {
    briefId: 'brief-v2-1',
    sourceRecordedAtIso: null,
    summary: 'V2 brief.',
  },
  capturedAtIso: '2026-05-07T12:00:00Z',
  capturedAtUnixMs: Date.parse('2026-05-07T12:00:00Z'),
  theses: [
    {
      asset: 'SOL',
      timeframe: '4h',
      bias: 'bullish',
      setupType: 'continuation',
      supportLevels: ['130'],
      resistanceLevels: ['150'],
      entryZone: null,
      targets: ['160'],
      invalidation: '125',
      trigger: null,
      chartReference: null,
      sourceHandle: 'analyst42',
      sourceChannel: null,
      sourceKind: 'human',
      sourceReliability: null,
      rawThesisText: null,
      collectedAt: null,
      publishedAt: null,
      sourceUrl: null,
      notes: null,
    },
  ],
};

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

    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
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

    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
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

    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
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

  it('renders v2 thesis panel when v2 data is available and hides the v1 SrLevelsCard', () => {
    render(
      <SrInsightsSection
        srLevels={SAMPLE_SR_LEVELS}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel="SOL/USDC"
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={SAMPLE_THESES_BLOCK}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason={null}
      />,
    );
    expect(screen.getByText('V2 brief.')).toBeTruthy();
    expect(screen.getByText('analyst42')).toBeTruthy();
    expect(screen.queryByText('Support & Resistance')).toBeNull();
  });

  it('falls back to v1 SrLevelsCard when v2 is unavailable but v1 data is present', () => {
    render(
      <SrInsightsSection
        srLevels={SAMPLE_SR_LEVELS}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel="SOL/USDC"
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={null}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason="not-found"
      />,
    );
    expect(screen.getByText('Support & Resistance')).toBeTruthy();
  });

  it('renders "No S/R analysis available yet" when v2 not-found and there is no v1 fallback', () => {
    render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={null}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason="not-found"
      />,
    );
    expect(screen.getByText('No S/R analysis available yet')).toBeTruthy();
  });

  it('renders "S/R analysis unavailable" for v2 config-error / upstream-error without v1 fallback', () => {
    for (const reason of ['config-error', 'upstream-error'] as const) {
      const { unmount } = render(
        <SrInsightsSection
          srLevels={null}
          isLoading={false}
          isError={false}
          isUnsupported={false}
          isMixedPools={false}
          poolLabel={null}
          now={Date.parse('2026-05-07T12:00:00Z')}
          srTheses={null}
          srThesesLoading={false}
          srThesesError={false}
          srThesesUnsupported={false}
          srThesesUnavailableReason={reason}
        />,
      );
      expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
      unmount();
    }
  });

  it('renders degraded-refresh copy with ASCII hyphen when v2 is shown but a refresh failed', () => {
    render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={SAMPLE_THESES_BLOCK}
        srThesesLoading={false}
        srThesesError
        srThesesUnsupported={false}
        srThesesUnavailableReason={null}
      />,
    );
    expect(screen.getByText('Refresh failed - showing last available analysis.')).toBeTruthy();
  });

  it('renders v2 loading skeleton when srThesesLoading and no v1/v2 data', () => {
    render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={null}
        srThesesLoading
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason={null}
      />,
    );
    expect(screen.getByTestId('sr-insights-section-skeleton')).toBeTruthy();
  });

  it('renders unavailable message when srThesesUnsupported is true', () => {
    render(
      <SrInsightsSection
        srLevels={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        isMixedPools={false}
        poolLabel={null}
        now={Date.parse('2026-05-07T12:00:00Z')}
        srTheses={null}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported
        srThesesUnavailableReason={null}
      />,
    );
    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
  });
});
