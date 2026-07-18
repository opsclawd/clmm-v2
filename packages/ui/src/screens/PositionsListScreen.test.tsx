import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  PositionSummaryDto,
  SrThesesBlock,
  PositionListFinancialMetricsDto,
} from '@clmm/application/public';
import { PositionsListScreen } from './PositionsListScreen.js';

afterEach(() => {
  cleanup();
});

function brand<T>(value: string): T {
  return value as T;
}

function makePosition(overrides: Partial<PositionSummaryDto> = {}): PositionSummaryDto {
  return {
    positionId: brand<PositionSummaryDto['positionId']>('position-1'),
    poolId: brand<PositionSummaryDto['poolId']>('pool-1'),
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 142.35,
    currentPriceLabel: 'USDC 142.35',
    feeRateLabel: '10 bps',
    lowerBoundPrice: 100,
    upperBoundPrice: 200,
    lowerBoundLabel: 'USDC 100.00',
    upperBoundLabel: 'USDC 200.00',
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
    ...overrides,
  };
}

function makeFinancialMetrics(
  overrides: Partial<PositionListFinancialMetricsDto> = {},
): PositionListFinancialMetricsDto {
  return {
    positionValue: {
      valueUsd: 24812,
      valuedAtUnixMs: Date.now(),
      source: 'orca-whirlpool',
      basis: 'principal-token-amounts',
      scope: 'returned-supported-positions',
      excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
    },
    unclaimedFees: {
      valueUsd: 142.3,
      valuedAtUnixMs: Date.now(),
      source: 'orca-whirlpool',
      basis: 'currently-claimable-trading-fees',
      scope: 'returned-supported-positions',
      excludes: ['rewards', 'collected-fees', 'lifetime-fees'] as const,
    },
    poolsById: {},
    ...overrides,
  };
}

describe('PositionsListScreen', () => {
  it('renders connect-wallet entry when disconnected', () => {
    render(<PositionsListScreen walletAddress={null} />);

    expect(screen.getByText('Connect your wallet to get started')).toBeTruthy();
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
  });

  it('renders loading state for connected wallets while positions are fetching', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);

    expect(screen.getByText('Loading supported Orca positions')).toBeTruthy();
  });

  it('renders error state when loading fails before any positions are available', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positionsError="Could not load supported positions for this wallet."
      />,
    );

    expect(screen.getByText('Could not load supported positions')).toBeTruthy();
    expect(screen.getByText('Could not load supported positions for this wallet.')).toBeTruthy();
  });

  it('keeps rendering the positions list when a background refetch fails after positions load', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        positionsError="Could not load supported positions for this wallet."
      />,
    );

    expect(screen.getByText('SOL / USDC')).toBeTruthy();
    expect(screen.queryByText('Could not load supported positions')).toBeNull();
  });

  it('renders warning banner when positionsWarning is provided alongside positions', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        positionsWarning="Some pool data unavailable. Position list may be incomplete."
      />,
    );

    expect(screen.getByText('SOL / USDC')).toBeTruthy();
    expect(
      screen.getByText('Some pool data unavailable. Position list may be incomplete.'),
    ).toBeTruthy();
  });

  it('does not render warning banner when positionsWarning is null', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        positionsWarning={null}
      />,
    );

    expect(screen.getByText('SOL / USDC')).toBeTruthy();
    expect(screen.queryByText('unavailable')).toBeNull();
  });

  it('renders the empty state when connected without positions and without an error', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);

    expect(screen.getByText('No supported positions')).toBeTruthy();
    expect(
      screen.getByText('Connect a wallet with Orca CLMM positions to see them here.'),
    ).toBeTruthy();
  });

  it('renders all six status-chip labels per the spec mapping', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({
            positionId: brand('position-in'),
            rangeState: 'in-range',
            currentPrice: 150,
            lowerBoundPrice: 100,
            upperBoundPrice: 200,
          }),
          makePosition({
            positionId: brand('position-near'),
            poolId: brand('pool-near'),
            rangeState: 'in-range',
            currentPrice: 195,
            lowerBoundPrice: 100,
            upperBoundPrice: 200,
          }),
          makePosition({
            positionId: brand('position-below'),
            poolId: brand('pool-below'),
            rangeState: 'below-range',
            hasActionableTrigger: false,
          }),
          makePosition({
            positionId: brand('position-above'),
            poolId: brand('pool-above'),
            rangeState: 'above-range',
            hasActionableTrigger: false,
          }),
          makePosition({
            positionId: brand('position-breach-below'),
            poolId: brand('pool-breach-below'),
            rangeState: 'below-range',
            hasActionableTrigger: true,
          }),
          makePosition({
            positionId: brand('position-breach-above'),
            poolId: brand('pool-breach-above'),
            rangeState: 'above-range',
            hasActionableTrigger: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText('In range')).toBeTruthy();
    expect(screen.getByText('Near edge')).toBeTruthy();
    expect(screen.getByText('Below range')).toBeTruthy();
    expect(screen.getByText('Above range')).toBeTruthy();
    expect(screen.getByText('Breach · below')).toBeTruthy();
    expect(screen.getByText('Breach · above')).toBeTruthy();
  });

  it('renders section header with position count', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition(), makePosition({ positionId: brand('position-2') })]}
      />,
    );

    expect(screen.getByText('Active positions')).toBeTruthy();
    expect(screen.getByText('2 monitored')).toBeTruthy();
  });

  it('calls onSelectPosition with the position id when a card is tapped', () => {
    const onSelectPosition = vi.fn();

    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({
            positionId: brand<PositionSummaryDto['positionId']>('pos-tap-test'),
            poolId: brand<PositionSummaryDto['poolId']>('pool-tap-test'),
          }),
        ]}
        onSelectPosition={onSelectPosition}
      />,
    );

    fireEvent.click(screen.getByText('SOL / USDC'));
    expect(onSelectPosition).toHaveBeenCalledWith('pos-tap-test');
  });

  it('calls onConnectWallet when Connect Wallet is tapped', () => {
    const onConnectWallet = vi.fn();

    render(<PositionsListScreen walletAddress={null} onConnectWallet={onConnectWallet} />);

    fireEvent.click(screen.getByText('Connect Wallet'));
    expect(onConnectWallet).toHaveBeenCalled();
  });

  it('renders monitoring indicator with correct text for each status', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({ monitoringStatus: 'active' }),
          makePosition({ positionId: brand('position-2'), monitoringStatus: 'degraded' }),
          makePosition({ positionId: brand('position-3'), monitoringStatus: 'inactive' }),
        ]}
      />,
    );

    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('Degraded')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('renders directional breach chip for positions with actionable trigger', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition({ hasActionableTrigger: true, rangeState: 'below-range' })]}
      />,
    );

    expect(screen.getByText('Breach · below')).toBeTruthy();
  });

  it('renders the market context panel with pool label when positions and S/R data are available', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevels={{
          briefId: 'brief-1',
          sourceRecordedAtIso: null,
          summary: 'Bullish continuation.',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 132 }],
          resistances: [{ price: 148 }],
        }}
        poolLabel="SOL / USDC"
        now={1_745_712_000_000 + 5 * 60_000}
      />,
    );

    expect(screen.getByText('Market Thesis')).toBeTruthy();
    expect(screen.getByText('Bullish continuation.')).toBeTruthy();
    expect(screen.getByText('Active positions')).toBeTruthy();
  });

  it('hides the market context panel when wallet is disconnected', () => {
    render(<PositionsListScreen walletAddress={null} />);

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('S/R analysis unavailable')).toBeNull();
  });

  it('hides the market context panel while positions are loading', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('S/R analysis unavailable')).toBeNull();
  });

  it('hides the market context panel when there are no positions', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('S/R analysis unavailable')).toBeNull();
  });

  it('renders the unavailable caption when S/R is unsupported but positions render', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevelsUnsupported
      />,
    );

    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
    expect(screen.getByText('Active positions')).toBeTruthy();
  });

  it('renders cached S/R data with degraded message when S/R errored but data exists', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevels={{
          briefId: 'brief-1',
          sourceRecordedAtIso: null,
          summary: 'Bullish continuation.',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 132 }],
          resistances: [{ price: 148 }],
        }}
        srLevelsError
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getByText('Refresh failed — showing last available analysis.')).toBeTruthy();
  });

  it('renders unavailable when S/R errored with no cached data', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevels={null}
        srLevelsError
      />,
    );

    expect(screen.getByText('S/R analysis unavailable')).toBeTruthy();
  });

  it('renders the positions list when S/R is loading (non-blocking)', () => {
    render(
      <PositionsListScreen walletAddress="wallet-1" positions={[makePosition()]} srLevelsLoading />,
    );

    expect(screen.getByText('Active positions')).toBeTruthy();
  });

  it('renders mixed-pools unavailable message when positions span multiple pools', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({ poolId: brand<PositionSummaryDto['poolId']>('pool-a') }),
          makePosition({
            positionId: brand('position-2'),
            poolId: brand<PositionSummaryDto['poolId']>('pool-b'),
            tokenPairLabel: 'BTC / USDC',
          }),
        ]}
        isMixedPools
      />,
    );

    expect(screen.getByText('Market context unavailable for mixed pools')).toBeTruthy();
    expect(screen.getByText('SOL / USDC')).toBeTruthy();
    expect(screen.getByText('BTC / USDC')).toBeTruthy();
  });

  it('does not label out-of-range positions as Near edge even when current price is close to a bound', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({
            rangeState: 'below-range',
            currentPrice: 99,
            lowerBoundPrice: 100,
            upperBoundPrice: 200,
            hasActionableTrigger: false,
          }),
        ]}
      />,
    );

    expect(screen.queryByText('Near edge')).toBeNull();
    expect(screen.getByText('Below range')).toBeTruthy();
  });

  it('renders the portfolio summary strip above the active positions for connected wallets with positions', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={makeFinancialMetrics()}
      />,
    );

    expect(screen.getByText('Position value')).toBeTruthy();
    expect(screen.getByText('$24,812.00')).toBeTruthy();
    expect(screen.getByText('Unclaimed fees')).toBeTruthy();
    expect(screen.getByText('$142.30')).toBeTruthy();
  });

  it('renders unavailable financial metrics as em dashes with neutral styling', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={makeFinancialMetrics({
          positionValue: null,
          unclaimedFees: null,
        })}
      />,
    );

    expect(screen.getByText('Position value')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('Unclaimed fees')).toBeTruthy();
  });

  it('renders exact zero financial metrics as $0.00', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={makeFinancialMetrics({
          positionValue: {
            valueUsd: 0,
            valuedAtUnixMs: Date.now(),
            source: 'orca-whirlpool',
            basis: 'principal-token-amounts',
            scope: 'returned-supported-positions',
            excludes: ['wallet-balances', 'fees', 'rewards', 'collected-history', 'pnl'] as const,
          },
          unclaimedFees: {
            valueUsd: 0,
            valuedAtUnixMs: Date.now(),
            source: 'orca-whirlpool',
            basis: 'currently-claimable-trading-fees',
            scope: 'returned-supported-positions',
            excludes: ['rewards', 'collected-fees', 'lifetime-fees'] as const,
          },
        })}
      />,
    );

    expect(screen.getAllByText('$0.00')).toHaveLength(2);
  });

  it('does not render metric components while positions are loading', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);

    expect(screen.queryByText('Position value')).toBeNull();
    expect(screen.queryByText('Unclaimed fees')).toBeNull();
    expect(screen.queryByText('$24,812.00')).toBeNull();
  });

  it('does not render the portfolio summary strip when disconnected or empty', () => {
    const disconnected = render(<PositionsListScreen walletAddress={null} />);
    expect(disconnected.container.textContent).not.toContain('Position value');
    cleanup();

    const empty = render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);
    expect(empty.container.textContent).not.toContain('Position value');
  });

  it('does not calculate unavailable summary values from populated pool cards', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={{
          ...makeFinancialMetrics(),
          positionValue: null,
          unclaimedFees: null,
        }}
      />,
    );

    expect(screen.getByText('Position value')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('contains none of the removed fabricated financial labels', () => {
    const fabricatedValues = [
      '$24,812',
      '+$142.30',
      '$8,420.19',
      '$6,220.00',
      '$3,105.77',
      '+$12.40',
      '+$4.82',
      '+$1.95',
    ];

    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={makeFinancialMetrics()}
      />,
    );

    fabricatedValues.forEach((value) => {
      expect(screen.queryByText(value)).toBeNull();
    });
  });

  it('preserves summary cards positions and market sections ordering', () => {
    const { container } = render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={makeFinancialMetrics()}
        srLevels={{
          briefId: 'brief-1',
          sourceRecordedAtIso: null,
          summary: 'Bullish continuation.',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 132 }],
          resistances: [{ price: 148 }],
        }}
        poolLabel="SOL / USDC"
        now={1_745_712_000_000 + 5 * 60_000}
      />,
    );

    const text = container.textContent ?? '';
    const positionValueIdx = text.indexOf('Position value');
    const cardIdx = text.indexOf('SOL / USDC');
    const srIdx = text.indexOf('Support & Resistance');
    const thesisIdx = text.indexOf('Market Thesis');

    expect(positionValueIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(-1);
    expect(srIdx).toBeGreaterThan(-1);
    expect(thesisIdx).toBeGreaterThan(-1);

    expect(positionValueIdx).toBeLessThan(cardIdx);
    expect(cardIdx).toBeLessThan(srIdx);
    expect(srIdx).toBeLessThan(thesisIdx);
  });

  it('renders summary strip → cards → Support & Resistance → Market Thesis in that order', () => {
    const { container } = render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        financialMetrics={makeFinancialMetrics()}
        srLevels={{
          briefId: 'brief-1',
          sourceRecordedAtIso: null,
          summary: 'Bullish continuation.',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 132 }],
          resistances: [{ price: 148 }],
        }}
        poolLabel="SOL / USDC"
        now={1_745_712_000_000 + 5 * 60_000}
      />,
    );

    const text = container.textContent ?? '';
    const portfolioIdx = text.indexOf('Position value');
    const cardIdx = text.indexOf('SOL / USDC');
    const srIdx = text.indexOf('Support & Resistance');
    const thesisIdx = text.indexOf('Market Thesis');

    expect(portfolioIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(-1);
    expect(srIdx).toBeGreaterThan(-1);
    expect(thesisIdx).toBeGreaterThan(-1);

    expect(portfolioIdx).toBeLessThan(cardIdx);
    expect(cardIdx).toBeLessThan(srIdx);
    expect(srIdx).toBeLessThan(thesisIdx);
  });

  it('renders the RangeBar with lower, current, and upper bound labels from the view model', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({
            lowerBoundLabel: 'USDC 100.00',
            upperBoundLabel: 'USDC 200.00',
            currentPriceLabel: 'USDC 142.35',
          }),
        ]}
      />,
    );

    expect(screen.getByText('USDC 100.00')).toBeTruthy();
    expect(screen.getByText('USDC 200.00')).toBeTruthy();
    expect(screen.getByText('USDC 142.35')).toBeTruthy();
  });

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

  it('renders v2 thesis panel when srTheses is provided', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srTheses={SAMPLE_THESES_BLOCK}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason={null}
      />,
    );

    expect(screen.getByText('V2 brief.')).toBeTruthy();
    expect(screen.queryByText('Support & Resistance')).toBeNull();
  });

  it('falls back to v1 SrLevelsCard when srTheses is null with not-found reason', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevels={{
          briefId: 'brief-1',
          sourceRecordedAtIso: null,
          summary: 'Bullish continuation.',
          capturedAtUnixMs: 1_745_712_000_000,
          supports: [{ price: 132 }],
          resistances: [{ price: 148 }],
        }}
        srTheses={null}
        srThesesLoading={false}
        srThesesError={false}
        srThesesUnsupported={false}
        srThesesUnavailableReason="not-found"
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.queryByText('V2 brief.')).toBeNull();
  });

  it('renders PolicyInsights unavailable copy when enabled with not-found reason', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        policyInsight={null}
        policyInsightsLoading={false}
        policyInsightsError={false}
        policyInsightsEnabled
        policyInsightsUnavailableReason="not-found"
      />,
    );
    expect(screen.getByText('No policy insight available yet.')).toBeTruthy();
  });

  it('does not render PolicyInsightsSection when not enabled', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        policyInsight={null}
        policyInsightsLoading={false}
        policyInsightsError={false}
        policyInsightsEnabled={false}
        policyInsightsUnavailableReason="not-found"
      />,
    );
    expect(screen.queryByText('No policy insight available yet.')).toBeNull();
  });

  it('renders PolicyInsights unavailable when in error with upstream-error', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        policyInsight={null}
        policyInsightsLoading={false}
        policyInsightsError
        policyInsightsEnabled
        policyInsightsUnavailableReason="upstream-error"
      />,
    );
    expect(screen.getByText('Policy insights unavailable.')).toBeTruthy();
  });
});
