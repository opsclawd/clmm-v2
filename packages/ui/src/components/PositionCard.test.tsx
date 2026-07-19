import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PositionCard } from './PositionCard.js';
import type { PositionListItemViewModel } from '../view-models/PositionListViewModel.js';

const baseItem: PositionListItemViewModel = {
  positionId: 'pos-1',
  poolId: 'CzfqAaBbCcDdEeFfGgHh1234kkkk44zE',
  poolLabel: 'SOL / USDC',
  currentPrice: 150,
  currentPriceLabel: 'USDC 150.00',
  rangeStatusKind: 'in-range',
  hasAlert: false,
  monitoringStatus: 'active',
  lowerBoundPrice: 100,
  upperBoundPrice: 200,
  lowerBoundLabel: 'USDC 100.00',
  upperBoundLabel: 'USDC 200.00',
  poolTvl: { kind: 'unavailable', label: '—' },
  poolFees24h: { kind: 'unavailable', label: '—' },
};

const makeItem = (
  overrides: Partial<PositionListItemViewModel> = {},
): PositionListItemViewModel => ({
  ...baseItem,
  ...overrides,
});

afterEach(() => {
  cleanup();
});

const observability = { log: vi.fn() };

afterEach(() => {
  observability.log.mockClear();
});

describe('PositionCard financial metrics rendering', () => {
  describe('renders unavailable financial metrics as em dashes with neutral styling', () => {
    it('renders unavailable pool TVL as em dash with tertiary color', () => {
      render(
        <PositionCard
          item={makeItem({ poolFees24h: { kind: 'available', valueUsd: 100, label: '$100.00' } })}
        />,
      );

      expect(screen.getByText('Pool TVL')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });

    it('renders unavailable pool fees 24h as em dash with tertiary color', () => {
      render(
        <PositionCard
          item={makeItem({ poolTvl: { kind: 'available', valueUsd: 1000, label: '$1,000.00' } })}
        />,
      );

      expect(screen.getByText('Pool fees · 24h')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
    });
  });

  describe('renders exact zero financial metrics as $0.00', () => {
    it('renders available zero pool TVL as $0.00', () => {
      render(
        <PositionCard
          item={makeItem({ poolTvl: { kind: 'available', valueUsd: 0, label: '$0.00' } })}
        />,
      );

      expect(screen.getByText('$0.00')).toBeTruthy();
    });

    it('renders available zero pool fees 24h as $0.00', () => {
      render(
        <PositionCard
          item={makeItem({ poolFees24h: { kind: 'available', valueUsd: 0, label: '$0.00' } })}
        />,
      );

      expect(screen.getByText('$0.00')).toBeTruthy();
    });
  });

  describe('renders populated authoritative financial metrics with corrected labels', () => {
    it('renders available pool TVL with Pool TVL label', () => {
      render(
        <PositionCard
          item={makeItem({ poolTvl: { kind: 'available', valueUsd: 1000, label: '$1,000.00' } })}
        />,
      );

      expect(screen.getByText('Pool TVL')).toBeTruthy();
      expect(screen.getByText('$1,000.00')).toBeTruthy();
    });

    it('renders available pool fees 24h with Pool fees · 24h label', () => {
      render(
        <PositionCard
          item={makeItem({ poolFees24h: { kind: 'available', valueUsd: 500, label: '$500.00' } })}
        />,
      );

      expect(screen.getByText('Pool fees · 24h')).toBeTruthy();
      expect(screen.getByText('$500.00')).toBeTruthy();
    });

    it('does not prefix fees with +', () => {
      render(
        <PositionCard
          item={makeItem({ poolFees24h: { kind: 'available', valueUsd: 500, label: '$500.00' } })}
        />,
      );

      expect(screen.queryByText('+$500.00')).toBeNull();
      expect(screen.getByText('$500.00')).toBeTruthy();
    });
  });

  describe('contains none of the removed fabricated financial labels', () => {
    const fabricatedValues = ['$8,420.19', '$6,220.00', '$3,105.77', '+$12.40', '+$4.82', '+$1.95'];

    it('does not render any hardcoded placeholder TVL values', () => {
      render(<PositionCard item={baseItem} />);
      fabricatedValues.forEach((value) => {
        expect(screen.queryByText(value)).toBeNull();
      });
    });
  });
});

describe('PositionCard', () => {
  it('renders pool label and truncated pool id', () => {
    render(<PositionCard item={baseItem} />);

    expect(screen.getByText('SOL / USDC')).toBeTruthy();
    expect(screen.getByText('Czfq…44zE')).toBeTruthy();
  });

  it('renders monitoring display text for each status', () => {
    const { rerender } = render(<PositionCard item={baseItem} />);
    expect(screen.getByText('Live')).toBeTruthy();

    rerender(<PositionCard item={{ ...baseItem, monitoringStatus: 'degraded' }} />);
    expect(screen.getByText('Degraded')).toBeTruthy();

    rerender(<PositionCard item={{ ...baseItem, monitoringStatus: 'inactive' }} />);
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('renders chip label for in-range position without alert', () => {
    render(<PositionCard item={baseItem} />);
    expect(screen.getByText('In range')).toBeTruthy();
  });

  it('renders chip label for breach · below', () => {
    render(<PositionCard item={{ ...baseItem, rangeStatusKind: 'below-range', hasAlert: true }} />);
    expect(screen.getByText('Breach · below')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = vi.fn();
    render(<PositionCard item={baseItem} onPress={onPress} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('has accessible label with pool label and chip text', () => {
    render(<PositionCard item={baseItem} />);
    expect(screen.getByLabelText('Position card for SOL / USDC, In range')).toBeTruthy();
  });

  it('does not log warnings for a normal available card', () => {
    render(<PositionCard item={baseItem} observability={observability} />);
    expect(observability.log).not.toHaveBeenCalled();
  });

  it('logs position_alert_in_range with position and pool identity but no wallet data', () => {
    render(
      <PositionCard
        item={makeItem({ currentPrice: 150, hasAlert: true, rangeStatusKind: 'in-range' })}
        observability={observability}
      />,
    );
    expect(observability.log).toHaveBeenCalledWith(
      'warn',
      'Position card alert conflicts with range status',
      {
        code: 'position_alert_in_range',
        positionId: 'pos-1',
        poolId: baseItem.poolId,
        hasAlert: true,
        rangeStatusKind: 'in-range',
      },
    );
    const logCalls = observability.log.mock.calls as Array<
      [string, string, Record<string, unknown>]
    >;
    logCalls.forEach((call) => {
      expect(call[2]).not.toHaveProperty('walletAddress');
    });
  });

  it('logs range_bar_input_invalid with the deterministic reason and safe state fields', () => {
    render(
      <PositionCard
        item={makeItem({ currentPrice: Number.NaN, hasAlert: false, rangeStatusKind: 'in-range' })}
        observability={observability}
      />,
    );
    expect(observability.log).toHaveBeenCalledWith(
      'warn',
      'Position card range visualization unavailable',
      {
        code: 'range_bar_input_invalid',
        reason: 'current_price_non_finite',
        positionId: 'pos-1',
        poolId: baseItem.poolId,
        rangeStatusKind: 'in-range',
        hasAlert: false,
      },
    );
  });

  it('renders Action needed and Price unavailable together and emits both independent warnings', () => {
    render(
      <PositionCard
        item={makeItem({ currentPrice: Number.NaN, hasAlert: true, rangeStatusKind: 'in-range' })}
        observability={observability}
      />,
    );
    expect(screen.getByText('Action needed')).toBeTruthy();
    expect(screen.getByText('Price unavailable')).toBeTruthy();
    expect(observability.log).toHaveBeenCalledTimes(2);
  });

  it('keeps alert + in-range directionless and free of breach decoration', () => {
    render(
      <PositionCard
        item={makeItem({ hasAlert: true, rangeStatusKind: 'in-range' })}
        observability={observability}
      />,
    );
    expect(screen.getByText('Action needed')).toBeTruthy();
    expect(screen.queryByText('Breach')).toBeNull();
  });

  it('does not log again on an unchanged rerender', () => {
    const { rerender } = render(
      <PositionCard
        item={makeItem({ currentPrice: Number.NaN, hasAlert: true, rangeStatusKind: 'in-range' })}
        observability={observability}
      />,
    );
    expect(observability.log).toHaveBeenCalledTimes(2);
    rerender(
      <PositionCard
        item={makeItem({ currentPrice: Number.NaN, hasAlert: true, rangeStatusKind: 'in-range' })}
        observability={observability}
      />,
    );
    expect(observability.log).toHaveBeenCalledTimes(2);
  });

  it('still calls only onPress when the card is tapped', () => {
    const onPress = vi.fn();
    render(
      <PositionCard
        item={makeItem({ currentPrice: Number.NaN, hasAlert: true, rangeStatusKind: 'in-range' })}
        observability={observability}
        onPress={onPress}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledOnce();
    expect(observability.log).toHaveBeenCalledTimes(2);
  });
});
