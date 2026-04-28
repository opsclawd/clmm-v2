import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PositionSummaryDto } from '@clmm/application/public';
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
    rangeState: 'in-range',
    rangeDistance: { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: false,
    monitoringStatus: 'active',
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

  it('renders the empty state when connected without positions and without an error', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);

    expect(screen.getByText('No supported positions')).toBeTruthy();
    expect(
      screen.getByText(
        'Connect a wallet with Orca CLMM positions to see them here.',
      ),
    ).toBeTruthy();
  });

  it('renders position cards with correct status chip', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({ rangeState: 'in-range' }),
          makePosition({ positionId: brand('position-2'), rangeState: 'below-range' }),
          makePosition({ positionId: brand('position-3'), rangeState: 'above-range' }),
          makePosition({ positionId: brand('position-4'), rangeState: 'above-range', hasActionableTrigger: true }),
        ]}
      />,
    );

    expect(screen.getByText('In range')).toBeTruthy();
    expect(screen.getByText('Below range')).toBeTruthy();
    expect(screen.getByText('Above range')).toBeTruthy();
    expect(screen.getByText('Breach')).toBeTruthy();
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
        positions={[makePosition({ positionId: brand<PositionSummaryDto['positionId']>('pos-tap-test'), poolId: brand<PositionSummaryDto['poolId']>('pool-tap-test') })]}
        onSelectPosition={onSelectPosition}
      />,
    );

    fireEvent.click(screen.getByText('SOL / USDC'));
    expect(onSelectPosition).toHaveBeenCalledWith('pos-tap-test');
  });

  it('calls onConnectWallet when Connect Wallet is tapped', () => {
    const onConnectWallet = vi.fn();

    render(
      <PositionsListScreen
        walletAddress={null}
        onConnectWallet={onConnectWallet}
      />,
    );

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

  it('renders breach chip for positions with actionable trigger', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition({ hasActionableTrigger: true, rangeState: 'below-range' })]}
      />,
    );

    expect(screen.getByText('Breach')).toBeTruthy();
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
    expect(screen.queryByText('Market context unavailable')).toBeNull();
  });

  it('hides the market context panel while positions are loading', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positionsLoading />);

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('Market context unavailable')).toBeNull();
  });

  it('hides the market context panel when there are no positions', () => {
    render(<PositionsListScreen walletAddress="wallet-1" positions={[]} />);

    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('Market context unavailable')).toBeNull();
  });

  it('renders the unavailable caption when S/R is unsupported but positions render', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevelsUnsupported
      />,
    );

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
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

    expect(screen.getByText('Market context unavailable')).toBeTruthy();
  });

  it('renders the positions list when S/R is loading (non-blocking)', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[makePosition()]}
        srLevelsLoading
      />,
    );

    expect(screen.getByText('Active positions')).toBeTruthy();
  });

  it('renders mixed-pools unavailable message when positions span multiple pools', () => {
    render(
      <PositionsListScreen
        walletAddress="wallet-1"
        positions={[
          makePosition({ poolId: brand<PositionSummaryDto['poolId']>('pool-a') }),
          makePosition({ positionId: brand('position-2'), poolId: brand<PositionSummaryDto['poolId']>('pool-b'), tokenPairLabel: 'BTC / USDC' }),
        ]}
        isMixedPools
      />,
    );

    expect(screen.getByText('Market context unavailable for mixed pools')).toBeTruthy();
  });
});