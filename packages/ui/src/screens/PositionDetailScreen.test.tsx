import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PositionDetailDto } from '@clmm/application/public';
import { PositionDetailScreen } from './PositionDetailScreen.js';
import type { CurrentPlanDto } from '../view-models/PositionPlanViewModel.js';

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
    lowerBoundPrice: 100,
    upperBoundPrice: 200,
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
    positionAmounts: {
      amountA: { raw: '10500000000', decimals: 9, symbol: 'SOL', usdValue: 1575 },
      amountB: { raw: '250000000', decimals: 6, symbol: 'USDC', usdValue: 0 },
      totalUsd: 1575,
    },
    poolLiquidity: '2400000000',
    poolDepthLabel: 'depth unavailable',
    triggerId: 'trigger-1' as NonNullable<PositionDetailDto['triggerId']>,
    breachDirection: { kind: 'lower-bound-breach' },
    ...overrides,
  };
}

function makeHoldPlan(): CurrentPlanDto {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    state: {
      kind: 'advisory-ready',
      advisoryAction: { kind: 'HOLD' },
      regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
    },
  };
}

function makeStandDownPlan(): CurrentPlanDto {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    state: {
      kind: 'advisory-ready',
      advisoryAction: { kind: 'STAND_DOWN' },
      regimeResponse: { regime: 'CHOP', suitability: 'CAUTION' },
    },
  };
}

function makeRequestExitPlan(): CurrentPlanDto {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    state: {
      kind: 'advisory-ready',
      advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
      regimeResponse: { regime: 'DOWN', suitability: 'ALLOWED' },
    },
  };
}

function makePreviewReadyPlan(): CurrentPlanDto {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    state: {
      kind: 'exit-previewed',
      previewId: 'preview-123',
      advisoryAction: { kind: 'REQUEST_EXIT_CLMM' },
      preview: { freshness: { kind: 'fresh' } },
    },
  };
}

function makeConflictPlan(): CurrentPlanDto {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    state: {
      kind: 'conflict',
      priorPlanId: 'prior-plan-1',
    },
  };
}

function makeSupersededPlan(): CurrentPlanDto {
  return {
    planId: 'plan-1',
    canonicalHash: 'hash-1',
    positionId: 'position-1',
    state: {
      kind: 'superseded',
    },
  };
}

describe('PositionDetailScreen', () => {
  it('shows position evidence only when enabled with a navigation handler', () => {
    const onViewEvidence = vi.fn();
    const { rerender } = render(
      <PositionDetailScreen
        position={makePosition()}
        evidenceEnabled
        onViewEvidence={onViewEvidence}
      />,
    );
    fireEvent.click(screen.getByText('View Evidence'));
    expect(onViewEvidence).toHaveBeenCalledTimes(1);

    rerender(
      <PositionDetailScreen
        position={makePosition()}
        evidenceEnabled={false}
        onViewEvidence={onViewEvidence}
      />,
    );
    expect(screen.queryByText('View Evidence')).toBeNull();

    rerender(<PositionDetailScreen position={makePosition()} evidenceEnabled />);
    expect(screen.queryByText('View Evidence')).toBeNull();
  });

  it('shows the preview action from the position detail payload without a separate alert prop', () => {
    const onViewPreview = vi.fn();

    render(<PositionDetailScreen position={makePosition()} onViewPreview={onViewPreview} />);

    expect(screen.getByText('View Exit Preview')).toBeTruthy();
    expect(screen.getByText('Your position is fully in SOL. Exit to USDC.')).toBeTruthy();

    fireEvent.click(screen.getByText('View Exit Preview'));

    expect(onViewPreview).toHaveBeenCalledWith('trigger-1');
  });

  it('renders enriched position detail fields', () => {
    render(<PositionDetailScreen position={makePosition()} />);

    expect(screen.getByText('10 bps')).toBeTruthy();
    expect(screen.getByText('$45.00 in unclaimed fees')).toBeTruthy();
    expect(screen.getByText('No rewards')).toBeTruthy();
    expect(screen.getByText('$1575.00 position size')).toBeTruthy();
    expect(screen.queryByText('5000000000 liquidity units')).toBeNull();
    expect(screen.getByText('depth unavailable')).toBeTruthy();
    expect(screen.getByText('20.0% below lower bound')).toBeTruthy();
  });

  it('does not render any S/R-related content (regression)', () => {
    render(<PositionDetailScreen position={makePosition()} />);

    expect(screen.queryByText('Support & Resistance')).toBeNull();
    expect(screen.queryByText('Market Thesis')).toBeNull();
    expect(screen.queryByText('No current MCO levels available')).toBeNull();
  });

  describe('renders hold as acknowledgement only', () => {
    it('shows HOLD advisory with acknowledge button', () => {
      const onPlanAcknowledge = vi.fn();
      render(
        <PositionDetailScreen
          position={makePosition()}
          plan={makeHoldPlan()}
          onPlanAcknowledge={onPlanAcknowledge}
        />,
      );

      expect(screen.getByText('Hold Advisory')).toBeTruthy();
      expect(screen.getByText('Acknowledge')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();

      fireEvent.click(screen.getByText('Acknowledge'));
      expect(onPlanAcknowledge).toHaveBeenCalledWith('plan-1');
    });

    it('does not show execution controls for HOLD plan', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makeHoldPlan()} />);

      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
    });
  });

  describe('renders stand-down without hiding qualified breach exit', () => {
    it('shows STAND_DOWN advisory with acknowledge button', () => {
      const onPlanAcknowledge = vi.fn();
      render(
        <PositionDetailScreen
          position={makePosition()}
          plan={makeStandDownPlan()}
          onPlanAcknowledge={onPlanAcknowledge}
        />,
      );

      expect(screen.getByText('Stand Down Advisory')).toBeTruthy();
      expect(screen.getByText('Acknowledge')).toBeTruthy();
    });

    it('keeps breach controls visible during stand-down', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makeStandDownPlan()} />);

      expect(screen.getByText('Your position is fully in SOL. Exit to USDC.')).toBeTruthy();
      expect(screen.getByText('View Exit Preview')).toBeTruthy();
    });
  });

  describe('renders request-exit as preview then explicit approval', () => {
    it('shows requesting-exit with preview button', () => {
      const onPlanPreview = vi.fn();
      render(
        <PositionDetailScreen
          position={makePosition()}
          plan={makeRequestExitPlan()}
          onPlanPreview={onPlanPreview}
        />,
      );

      expect(screen.queryByText('Plan information unavailable')).toBeNull();
      expect(screen.getByText('Plan Recommends Exit')).toBeTruthy();
      expect(screen.getByText('Preview Exit')).toBeTruthy();
      expect(screen.queryByText('Approve & Sign')).toBeNull();

      fireEvent.click(screen.getByText('Preview Exit'));
      expect(onPlanPreview).toHaveBeenCalledWith('plan-1');
    });

    it('shows preview-ready with approve button after preview is created', () => {
      const onPlanApprove = vi.fn();
      render(
        <PositionDetailScreen
          position={makePosition()}
          plan={makePreviewReadyPlan()}
          onPlanApprove={onPlanApprove}
        />,
      );

      expect(screen.getByText('Exit Preview Ready')).toBeTruthy();
      expect(screen.getByText('Approve & Sign')).toBeTruthy();

      fireEvent.click(screen.getByText('Approve & Sign'));
      expect(onPlanApprove).toHaveBeenCalledWith('plan-1', 'preview-123');
    });

    it('requires explicit approval - no automatic submit', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makePreviewReadyPlan()} />);

      expect(screen.getByText('Approve & Sign')).toBeTruthy();
      expect(screen.queryByText(/submit/i)).toBeNull();
    });
  });

  describe('disables stale expired superseded and conflicting plans', () => {
    it('shows conflict state without execution buttons', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makeConflictPlan()} />);

      expect(screen.getByText('Plan Conflict Detected')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
      expect(screen.queryByText('Acknowledge')).toBeNull();
    });

    it('shows superseded state without execution buttons', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makeSupersededPlan()} />);

      expect(screen.getByText('Plan Superseded')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
      expect(screen.queryByText('Acknowledge')).toBeNull();
    });

    it('shows unavailable when plan is null', () => {
      render(<PositionDetailScreen position={makePosition()} plan={null} />);

      expect(screen.getByText('Plan information unavailable')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
    });
  });

  describe('keeps position and breach controls during plan outage', () => {
    it('shows breach controls when plan is unavailable but position has breach', () => {
      render(<PositionDetailScreen position={makePosition()} plan={null} />);

      expect(screen.getByText('Your position is fully in SOL. Exit to USDC.')).toBeTruthy();
      expect(screen.getByText('View Exit Preview')).toBeTruthy();
    });

    it('shows breach controls during hold advisory', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makeHoldPlan()} />);

      expect(screen.getByText('Your position is fully in SOL. Exit to USDC.')).toBeTruthy();
      expect(screen.getByText('View Exit Preview')).toBeTruthy();
    });

    it('shows breach controls during stand-down advisory', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makeStandDownPlan()} />);

      expect(screen.getByText('Your position is fully in SOL. Exit to USDC.')).toBeTruthy();
      expect(screen.getByText('View Exit Preview')).toBeTruthy();
    });
  });

  describe('deduplicates repeated decision and preview taps', () => {
    it('preview-ready state shows approve, not preview', () => {
      render(<PositionDetailScreen position={makePosition()} plan={makePreviewReadyPlan()} />);

      expect(screen.getByText('Exit Preview Ready')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.getByText('Approve & Sign')).toBeTruthy();
    });
  });
});
