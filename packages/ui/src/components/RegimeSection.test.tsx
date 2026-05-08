import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RegimeBlock } from '@clmm/application/public';
import { RegimeSection } from './RegimeSection.js';

afterEach(() => {
  cleanup();
});

const GENERATED = 1_700_000_000_000;
const LAST_CANDLE = GENERATED - 87 * 60_000;

const baseBlock: RegimeBlock = {
  regime: 'CHOP',
  telemetry: {
    realizedVolShort: 0.007,
    realizedVolLong: 0.0107,
    volRatio: 1.06,
    trendStrength: 0.00018,
    compression: 0.0092,
  },
  clmmSuitability: {
    status: 'CAUTION',
    reasons: [{ severity: 'WARN', text: 'Latest candle is past soft-stale threshold' }],
  },
  marketReasons: [],
  freshness: {
    generatedAtUnixMs: GENERATED,
    lastCandleUnixMs: LAST_CANDLE,
    ageSeconds: 87 * 60,
    softStale: true,
    hardStale: false,
    softStaleSeconds: 75 * 60,
    hardStaleSeconds: 90 * 60,
  },
  metadata: {
    source: 'geckoterminal',
    network: 'solana',
    symbol: 'SOL/USDC',
    timeframe: '1h',
    sourceTimeframe: '15m',
    sourceCandleCount: 346,
    candleCount: 86,
    derivedTimeframe: '1h',
    aggregationVersion: 'ohlcv-agg-v1',
  },
};

describe('RegimeSection', () => {
  it('returns null when no data and not loading', () => {
    const { container } = render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
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
        now={GENERATED}
      />,
    );
    expect(screen.getByTestId('regime-section-skeleton')).toBeTruthy();
  });

  it('shows unavailable copy with not-found reason', () => {
    render(
      <RegimeSection
        regime={null}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        unavailableReason="not-found"
        now={GENERATED}
      />,
    );
    expect(screen.getByText('Market data not available yet')).toBeTruthy();
  });

  it('renders unavailable copy when isUnsupported with no regime data', () => {
    render(
      <RegimeSection
        regime={undefined}
        isLoading={false}
        isError={false}
        isUnsupported
        now={GENERATED}
      />,
    );
    expect(screen.getByText('Regime analysis unavailable')).toBeTruthy();
  });

  it('renders regime label, suitability, data quality, source, and primary reason in collapsed mode', () => {
    render(
      <RegimeSection
        regime={baseBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED + 12 * 60_000}
      />,
    );
    expect(screen.getByText('◆ Choppy regime')).toBeTruthy();
    expect(screen.getByText(/CLMM caution/)).toBeTruthy();
    expect(screen.getByText(/data soft-?stale/i)).toBeTruthy();
    expect(screen.getByText(/Latest candle is 87m old/)).toBeTruthy();
    expect(screen.getByText(/Trend flat · Vol ratio 1\.06x/)).toBeTruthy();
    expect(screen.getByText(/Generated 12m ago/)).toBeTruthy();
    expect(screen.getByText(/GeckoTerminal · SOL\/USDC · 1h/)).toBeTruthy();
    expect(screen.getByText('Show details')).toBeTruthy();
  });

  it('renders only one reason in collapsed mode', () => {
    const block: RegimeBlock = {
      ...baseBlock,
      clmmSuitability: {
        status: 'CAUTION',
        reasons: [
          { severity: 'WARN', text: 'Latest candle is past soft-stale threshold' },
          { severity: 'INFO', text: 'Momentum still constructive' },
        ],
      },
      marketReasons: [{ severity: 'INFO', text: 'Volume tapering' }],
    };
    render(
      <RegimeSection
        regime={block}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    expect(screen.queryByText('Momentum still constructive')).toBeNull();
    expect(screen.queryByText('Volume tapering')).toBeNull();
  });

  it('toggles to expanded mode with Show details and renders structured rows', () => {
    render(
      <RegimeSection
        regime={baseBlock}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Hide details')).toBeTruthy();
    expect(screen.getByText('Reasons')).toBeTruthy();
    expect(screen.getByText('Latest candle is past soft-stale threshold')).toBeTruthy();
    expect(screen.getByText('Trend strength')).toBeTruthy();
    expect(screen.getByText('Realized vol short')).toBeTruthy();
    expect(screen.getByText('Volatility ratio')).toBeTruthy();
    expect(screen.getByText('Compression')).toBeTruthy();
    expect(screen.getByText('Samples')).toBeTruthy();
    expect(screen.getByText('Source candles')).toBeTruthy();
    expect(screen.getByText('Soft stale threshold')).toBeTruthy();
    expect(screen.getByText('Hard stale threshold')).toBeTruthy();
  });

  it('renders all display reasons in expanded mode', () => {
    const block: RegimeBlock = {
      ...baseBlock,
      clmmSuitability: {
        status: 'CAUTION',
        reasons: [
          { severity: 'WARN', text: 'Latest candle is past soft-stale threshold' },
          { severity: 'INFO', text: 'Momentum still constructive' },
        ],
      },
      marketReasons: [{ severity: 'INFO', text: 'Volume tapering' }],
    };
    render(
      <RegimeSection
        regime={block}
        isLoading={false}
        isError={false}
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Reasons')).toBeTruthy();
    expect(screen.getByText('Latest candle is past soft-stale threshold')).toBeTruthy();
    expect(screen.getByText('Momentum still constructive')).toBeTruthy();
    expect(screen.getByText('Volume tapering')).toBeTruthy();
  });

  it('renders the degraded banner when isError with cached regime data', () => {
    render(
      <RegimeSection
        regime={baseBlock}
        isLoading={false}
        isError
        isUnsupported={false}
        now={GENERATED}
      />,
    );
    expect(screen.getByText('Refresh failed — showing last available analysis.')).toBeTruthy();
  });
});
