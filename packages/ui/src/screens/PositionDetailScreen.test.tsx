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
    rangeState: 'below-range',
    hasActionableTrigger: true,
    monitoringStatus: 'active',
    lowerBound: 100,
    upperBound: 200,
    currentPrice: 80,
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
});
