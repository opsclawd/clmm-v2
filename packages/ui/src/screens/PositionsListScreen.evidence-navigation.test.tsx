import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PositionSummaryDto } from '@clmm/application/public';
import { PositionsListScreen } from './PositionsListScreen.js';

afterEach(() => {
  cleanup();
});

const mockObservability = { log: vi.fn() };

function makePosition(overrides: Partial<PositionSummaryDto> = {}): PositionSummaryDto {
  return {
    positionId: 'pos-1' as PositionSummaryDto['positionId'],
    poolId: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE' as PositionSummaryDto['poolId'],
    tokenPairLabel: 'SOL / USDC',
    currentPrice: 200,
    currentPriceLabel: 'USDC 200.00',
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

describe('PositionsListScreen evidence navigation', () => {
  it('shows evidence navigation only for the supported pair', () => {
    const onViewEvidence = vi.fn();
    const positions = [makePosition()];

    // 1. Connected, loaded, supported pair, evidenceEnabled=true, onViewEvidence present
    const { unmount: unmount1 } = render(
      <PositionsListScreen
        observability={mockObservability}
        walletAddress="wallet-1"
        positions={positions}
        evidenceEnabled={true}
        onViewEvidence={onViewEvidence}
      />,
    );

    const evidenceButton = screen.getByRole('button', { name: 'View evidence' });
    expect(evidenceButton).toBeTruthy();
    expect(screen.getByText('View evidence')).toBeTruthy();

    fireEvent.click(evidenceButton);
    expect(onViewEvidence).toHaveBeenCalledTimes(1);

    unmount1();

    // 2. Disconnected state
    const { unmount: unmount2 } = render(
      <PositionsListScreen
        observability={mockObservability}
        walletAddress={null}
        positions={positions}
        evidenceEnabled={true}
        onViewEvidence={onViewEvidence}
      />,
    );
    expect(screen.queryByText('View evidence')).toBeNull();
    unmount2();

    // 3. Loading state
    const { unmount: unmount3 } = render(
      <PositionsListScreen
        observability={mockObservability}
        walletAddress="wallet-1"
        positionsLoading={true}
        evidenceEnabled={true}
        onViewEvidence={onViewEvidence}
      />,
    );
    expect(screen.queryByText('View evidence')).toBeNull();
    unmount3();

    // 4. Empty positions state
    const { unmount: unmount4 } = render(
      <PositionsListScreen
        observability={mockObservability}
        walletAddress="wallet-1"
        positions={[]}
        evidenceEnabled={true}
        onViewEvidence={onViewEvidence}
      />,
    );
    expect(screen.queryByText('View evidence')).toBeNull();
    unmount4();

    // 5. Mixed-pool / disabled state (evidenceEnabled=false)
    const { unmount: unmount5 } = render(
      <PositionsListScreen
        observability={mockObservability}
        walletAddress="wallet-1"
        positions={positions}
        isMixedPools={true}
        evidenceEnabled={false}
        onViewEvidence={onViewEvidence}
      />,
    );
    expect(screen.queryByText('View evidence')).toBeNull();
    unmount5();

    // 6. onViewEvidence undefined
    const { unmount: unmount6 } = render(
      <PositionsListScreen
        observability={mockObservability}
        walletAddress="wallet-1"
        positions={positions}
        evidenceEnabled={true}
      />,
    );
    expect(screen.queryByText('View evidence')).toBeNull();
    unmount6();
  });
});
