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

  it('renders support and resistance section as a card when srLevels is present', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now),
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getByText('AI · MCO · 1m ago')).toBeTruthy();
    expect(screen.getByTestId('sr-level-0')).toBeTruthy();
    expect(screen.getByTestId('sr-level-1')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('renders level chips with correct labels', () => {
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
            supports: [{ price: 90 }],
            resistances: [{ price: 180 }],
          },
        })}
      />,
    );

    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Resist')).toBeTruthy();
    expect(screen.getByText('$90.00')).toBeTruthy();
    expect(screen.getByText('$180.00')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('renders stale freshness label in the card header when isStale is true', () => {
    const now = 200_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <PositionDetailScreen
        position={makePosition({
          srLevels: makeSrBlock(now - 200_000_000),
        })}
      />,
    );

    expect(screen.getByText(/stale/)).toBeTruthy();

    vi.restoreAllMocks();
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

  it('renders no MCO levels message when srLevels is absent', () => {
    render(
      <PositionDetailScreen
        position={makePosition()}
      />,
    );

    expect(screen.getByText('No current MCO levels available')).toBeTruthy();
  });

  it('renders resistance-only levels correctly', () => {
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

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getAllByText('Resist')).toHaveLength(2);
    expect(screen.getByText('$180.00')).toBeTruthy();
    expect(screen.getByText('$210.00')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('renders support-only levels correctly', () => {
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
            supports: [{ price: 90 }, { price: 110 }],
            resistances: [],
          },
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.getAllByText('Support')).toHaveLength(2);
    expect(screen.getByText('$90.00')).toBeTruthy();
    expect(screen.getByText('$110.00')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('renders empty levels message when both supports and resistances are empty', () => {
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
            resistances: [],
          },
        })}
      />,
    );

    expect(screen.getByText('Support & Resistance')).toBeTruthy();
    expect(screen.queryByTestId('sr-level-0')).toBeNull();

    vi.restoreAllMocks();
  });
});
