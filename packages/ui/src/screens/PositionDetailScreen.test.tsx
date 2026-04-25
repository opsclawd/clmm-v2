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
    currentPriceLabel: '$80.00',
    feeRateLabel: '10 bps',
    rangeState: 'below-range',
    rangeDistance: { belowLowerPercent: 20, aboveUpperPercent: 0 },
    hasActionableTrigger: true,
    monitoringStatus: 'active',
    lowerBound: 100,
    upperBound: 200,
    lowerBoundLabel: '$1.01',
    upperBoundLabel: '$1.22',
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

function makeSrBlock(capturedAtUnixMs: number): NonNullable<PositionDetailDto['srLevels']> {
  return {
    briefId: 'brief-1',
    sourceRecordedAtIso: null,
    summary: null,
    capturedAtUnixMs,
    supports: [{ price: 90 }, { price: 110, rank: 'S1' }],
    resistances: [{ price: 180 }, { price: 210 }],
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

  it('renders support and resistance section when srLevels is present', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now),
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance (MCO)')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Resistance')).toBeTruthy();
    expect(screen.getByText('$90.00')).toBeTruthy();
    expect(screen.getByText('$110.00 (S1)')).toBeTruthy();
    expect(screen.getByText('$180.00')).toBeTruthy();
    expect(screen.getByText('$210.00')).toBeTruthy();
    expect(screen.getByTestId('sr-freshness')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('renders stale freshness label when isStale is true', () => {
    const now = 200_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now - 200_000_000),
        })}
      />,
    );

    const freshness = screen.getByTestId('sr-freshness');
    expect(freshness.textContent).toContain('stale');

    vi.restoreAllMocks();
  });

  it('renders no MCO levels message when srLevels is absent', () => {
    render(
      <PositionDetailScreen
        position={makePosition()}
      />,
    );

    expect(screen.getByText('No current MCO levels available')).toBeTruthy();
  });

  it('renders resistance section when supports is empty but resistances are present', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: {
            briefId: 'brief-1',
            sourceRecordedAtIso: null,
            summary: null,
            capturedAtUnixMs: now,
            supports: [],
            resistances: [{ price: 180 }, { price: 210 }],
          },
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance (MCO)')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Resistance')).toBeTruthy();
    expect(screen.getByText('$180.00')).toBeTruthy();
    expect(screen.getByText('$210.00')).toBeTruthy();

    vi.restoreAllMocks();
  });
});
