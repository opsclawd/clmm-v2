import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RegimeBlock } from '@clmm/application/public';
import { RegimeSection } from './RegimeSection.js';

afterEach(() => {
  cleanup();
});

const testRegimeBlock: RegimeBlock = {
  regime: 'UP',
  trendStrength: 0.75,
  volRatio: 1.2,
  clmmSuitability: { status: 'ALLOWED', reasons: [] },
  marketReasons: [{ severity: 'INFO', text: 'Constructive trend' }],
  freshness: { capturedAtUnixMs: 1_700_000_000_000, softStale: false, hardStale: false },
};

describe('RegimeSection', () => {
  it('returns null when no data and not loading', () => {
    const { container } = render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_700_000_000_000}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows skeleton when loading with no data', () => {
    render(
      <RegimeSection
        regime={undefined}
        isLoading
        isError={false}
        isUnsupported={false}
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByTestId('regime-section-skeleton')).toBeTruthy();
  });

  it('shows unavailable message when unsupported with no regime data', () => {
    render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('Regime analysis unavailable')).toBeTruthy();
  });

  it('shows unavailable reason when provided', () => {
    render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        unavailableReason="Pool not supported"
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('Regime analysis unavailable')).toBeTruthy();
    expect(screen.getByText('Pool not supported')).toBeTruthy();
  });

  it('renders regime label, suitability, trend/vol, freshness with valid regime block', () => {
    render(
      <RegimeSection
        regime={testRegimeBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('▲ Uptrend')).toBeTruthy();
    expect(screen.getByText('✓ Suitable for CLMM')).toBeTruthy();
    expect(screen.getByText('Trend: 0.75 · Vol: 1.20')).toBeTruthy();
    expect(screen.getByText('Constructive trend')).toBeTruthy();
  });

  it('shows stale indicator when isStale is true', () => {
    const staleBlock: RegimeBlock = {
      ...testRegimeBlock,
      freshness: { capturedAtUnixMs: 1_700_000_000_000, softStale: true, hardStale: true },
    };
    render(
      <RegimeSection
        regime={staleBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_700_000_000_000 + 50 * 3600_000}
      />,
    );
    const freshnessText = screen.getByText(/MCO ·.*stale/);
    expect(freshnessText).toBeTruthy();
  });

  it('shows degraded banner when isError with cached regime data', () => {
    render(
      <RegimeSection
        regime={testRegimeBlock}
        isLoading={false}
        isError
        isUnsupported={false}
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('Refresh failed — showing last available analysis.')).toBeTruthy();
  });

  it('renders suitability reason when CAUTION with reasons', () => {
    const cautionBlock: RegimeBlock = {
      ...testRegimeBlock,
      clmmSuitability: {
        status: 'CAUTION',
        reasons: [{ severity: 'WARN', text: 'Elevated volatility' }],
      },
    };
    render(
      <RegimeSection
        regime={cautionBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('⚠ Caution')).toBeTruthy();
    expect(screen.getByText('Elevated volatility')).toBeTruthy();
  });

  it('does not render suitability reason when ALLOWED', () => {
    render(
      <RegimeSection
        regime={testRegimeBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('✓ Suitable for CLMM')).toBeTruthy();
    expect(screen.queryByText('Favorable conditions')).toBeNull();
  });

  it('shows unavailable reason when regime is null on supported pool', () => {
    render(
      <RegimeSection
        regime={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        unavailableReason="NO_CANDLES"
        now={1_700_000_000_000}
      />,
    );
    expect(screen.getByText('Regime analysis unavailable')).toBeTruthy();
    expect(screen.getByText('NO_CANDLES')).toBeTruthy();
  });
});
