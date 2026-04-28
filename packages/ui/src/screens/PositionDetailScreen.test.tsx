import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PositionDetailDto } from '@clmm/application/public';
import { PositionDetailScreen } from './PositionDetailScreen.js';

afterEach(() => {
  cleanup();
});

function makePosition(overrides: Partial<PositionDetailDto> = {}): PositionDetailDto {
  return {
    positionId: 'position-1' as PositionDetailDto['positionId'],
    poolId: 'pool-1' as PositionDetailDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 80,
    currentPriceLabel: 'USDC 80.00',
    feeRateLabel: '10 bps',
    rangeState: 'below-range',
    rangeDistance: { belowLowerPercent: 20, aboveUpperPercent: 0 },
    hasActionableTrigger: true,
    monitoringStatus: 'active',
    lowerBound: 100,
    upperBound: 200,
    lowerBoundLabel: 'USDC 1.01',
    upperBoundLabel: 'USDC 1.22',
    sqrtPrice: '123456',
    unclaimedFees: {
      feeOwedA: { raw: '100000000', decimals: 9, symbol: 'SOL', usdValue: 15 },
      feeOwedB: { raw: '30000000', decimals: 6, symbol: 'USDC', usdValue: 30 },
      totalUsd: 45,
    },
    unclaimedRewards: {
      rewards: [],
      totalUsd: 0,
    },
    positionLiquidity: '5000000000',
    poolLiquidity: '2400000000',
    poolDepthLabel: 'depth unavailable',
    triggerId: 'trigger-1' as NonNullable<PositionDetailDto['triggerId']>,
    breachDirection: { kind: 'lower-bound-breach' },
    ...overrides,
  };
}

describe('PositionDetailScreen', () => {
  it('shows the preview action from the position detail payload without a separate alert prop', () => {
    const onViewPreview = vi.fn();

    render(
      <PositionDetailScreen
        position={makePosition()}
        onViewPreview={onViewPreview}
      />,
    );

    expect(screen.getByText('View Exit Preview')).toBeTruthy();
    expect(screen.getByText('Your position is fully in SOL. Exit to USDC.')).toBeTruthy();

    fireEvent.click(screen.getByText('View Exit Preview'));

    expect(onViewPreview).toHaveBeenCalledWith('trigger-1');
  });

  it('renders enriched position detail fields', () => {
    render(
      <PositionDetailScreen
        position={makePosition()}
      />,
    );

    expect(screen.getByText('10 bps')).toBeTruthy();
    expect(screen.getByText('$45.00 in unclaimed fees')).toBeTruthy();
    expect(screen.getByText('No rewards')).toBeTruthy();
    expect(screen.getByText('5000000000 liquidity units')).toBeTruthy();
    expect(screen.getByText('depth unavailable')).toBeTruthy();
    expect(screen.getByText('20.0% below lower bound')).toBeTruthy();
  });

  it('does not render any S/R-related content (regression)', () => {
    render(
      <PositionDetailScreen
        position={makePosition()}
      />,
    );

    expect(screen.queryByText('Support & Resistance')).toBeNull();
    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('No current MCO levels available')).toBeNull();
  });
});