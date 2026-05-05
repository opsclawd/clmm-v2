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
};

afterEach(() => {
  cleanup();
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
});
