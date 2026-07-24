import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import type { PositionPlanViewModel } from '../view-models/PositionPlanViewModel.js';
import { PositionPlanCard } from './PositionPlanCard.js';

afterEach(() => {
  cleanup();
});

function makeAdvisoryPlan(kind: 'HOLD' | 'STAND_DOWN'): PositionPlanViewModel {
  return {
    status: 'advisory',
    advisoryKind: kind,
    regimeLabel: 'DOWN',
    suitabilityLabel: 'ALLOWED',
    canAcknowledge: true,
    showBreachControls: true,
  };
}

function makeRequestingExitPlan(): PositionPlanViewModel {
  return {
    status: 'requesting-exit',
    exitPosture: 'ExitToUSDC',
    regimeLabel: 'DOWN',
    canPreview: true,
    showBreachControls: true,
  };
}

function makePreviewReadyPlan(): PositionPlanViewModel {
  return {
    status: 'preview-ready',
    previewId: 'preview-123',
    exitPosture: 'ExitToUSDC',
    regimeLabel: 'DOWN',
    canApprove: true,
    showBreachControls: true,
  };
}

function makeUnavailablePlan(): PositionPlanViewModel {
  return { status: 'unavailable' };
}

function makeConflictPlan(): PositionPlanViewModel {
  return {
    status: 'conflict',
    conflictReason: 'A conflicting plan decision was detected',
    showBreachControls: true,
  };
}

function makeSupersededPlan(): PositionPlanViewModel {
  return {
    status: 'superseded',
    supersededReason: 'A newer plan has superseded this one',
    showBreachControls: true,
  };
}

describe('PositionPlanCard', () => {
  describe('renders hold as acknowledgement only', () => {
    it('shows HOLD advisory with acknowledge button and no execution', () => {
      const onAcknowledge = vi.fn();
      render(<PositionPlanCard plan={makeAdvisoryPlan('HOLD')} onAcknowledge={onAcknowledge} />);

      expect(screen.getByText('Hold Advisory')).toBeTruthy();
      expect(screen.getByText(/Regime: DOWN/)).toBeTruthy();
      expect(screen.getByText(/Suitability: ALLOWED/)).toBeTruthy();
      expect(screen.getByText('Acknowledge')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();

      fireEvent.click(screen.getByText('Acknowledge'));
      expect(onAcknowledge).toHaveBeenCalledTimes(1);
    });

    it('does not show preview or approve buttons for HOLD', () => {
      const onPreview = vi.fn();
      const onApprove = vi.fn();
      render(
        <PositionPlanCard
          plan={makeAdvisoryPlan('HOLD')}
          onPreview={onPreview}
          onApprove={onApprove}
        />,
      );

      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
    });
  });

  describe('renders stand-down without hiding qualified breach exit', () => {
    it('shows STAND_DOWN advisory with acknowledge button', () => {
      const onAcknowledge = vi.fn();
      render(
        <PositionPlanCard plan={makeAdvisoryPlan('STAND_DOWN')} onAcknowledge={onAcknowledge} />,
      );

      expect(screen.getByText('Stand Down Advisory')).toBeTruthy();
      expect(screen.getByText('Acknowledge')).toBeTruthy();
    });

    it('does not show execution controls for STAND_DOWN', () => {
      const onPreview = vi.fn();
      const onApprove = vi.fn();
      render(
        <PositionPlanCard
          plan={makeAdvisoryPlan('STAND_DOWN')}
          onPreview={onPreview}
          onApprove={onApprove}
        />,
      );

      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
    });
  });

  describe('renders request-exit as preview then explicit approval', () => {
    it('shows requesting-exit with preview button', () => {
      const onPreview = vi.fn();
      render(<PositionPlanCard plan={makeRequestingExitPlan()} onPreview={onPreview} />);

      expect(screen.getByText('Plan Recommends Exit')).toBeTruthy();
      expect(screen.getByText(/Exit Posture: SOL → USDC/)).toBeTruthy();
      expect(screen.getByText('Preview Exit')).toBeTruthy();
      expect(screen.queryByText('Approve & Sign')).toBeNull();

      fireEvent.click(screen.getByText('Preview Exit'));
      expect(onPreview).toHaveBeenCalledTimes(1);
    });

    it('shows preview-ready with approve button after preview is created', () => {
      const onApprove = vi.fn();
      render(<PositionPlanCard plan={makePreviewReadyPlan()} onApprove={onApprove} />);

      expect(screen.getByText('Exit Preview Ready')).toBeTruthy();
      expect(screen.getByText(/Preview ID: preview-123/)).toBeTruthy();
      expect(screen.getByText('Approve & Sign')).toBeTruthy();

      fireEvent.click(screen.getByText('Approve & Sign'));
      expect(onApprove).toHaveBeenCalledTimes(1);
    });

    it('does not show automatic submit - preview must be explicitly approved', () => {
      const onApprove = vi.fn();
      render(<PositionPlanCard plan={makePreviewReadyPlan()} onApprove={onApprove} />);

      expect(screen.getByText('Approve & Sign')).toBeTruthy();
      expect(screen.queryByText(/submit/i)).toBeNull();
    });
  });

  describe('disables stale expired superseded and conflicting plans', () => {
    it('shows conflict state without execution buttons', () => {
      render(<PositionPlanCard plan={makeConflictPlan()} />);

      expect(screen.getByText('Plan Conflict Detected')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
      expect(screen.queryByText('Acknowledge')).toBeNull();
    });

    it('shows superseded state without execution buttons', () => {
      render(<PositionPlanCard plan={makeSupersededPlan()} />);

      expect(screen.getByText('Plan Superseded')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
      expect(screen.queryByText('Acknowledge')).toBeNull();
    });

    it('shows unavailable state without execution buttons', () => {
      render(<PositionPlanCard plan={makeUnavailablePlan()} />);

      expect(screen.getByText('Plan information unavailable')).toBeTruthy();
      expect(screen.queryByText('Preview Exit')).toBeNull();
      expect(screen.queryByText('Approve & Sign')).toBeNull();
      expect(screen.queryByText('Acknowledge')).toBeNull();
    });
  });

  describe('keeps position and breach controls during plan outage', () => {
    it('shows unavailable message without hiding the card', () => {
      const { container } = render(<PositionPlanCard plan={makeUnavailablePlan()} />);

      expect(container.firstChild).toBeTruthy();
      expect(screen.getByText('Plan information unavailable')).toBeTruthy();
    });
  });

  describe('deduplicates repeated decision and preview taps', () => {
    it('shows awaiting-signature state with correct messaging', () => {
      const plan: PositionPlanViewModel = {
        status: 'awaiting-signature',
        exitPosture: 'ExitToUSDC',
        regimeLabel: 'DOWN',
        showBreachControls: true,
      };
      render(<PositionPlanCard plan={plan} />);

      expect(screen.getByText('Awaiting Signature')).toBeTruthy();
      expect(screen.getByText(/Please sign the transaction in your wallet/)).toBeTruthy();
    });

    it('shows in-flight state with attempt id', () => {
      const plan: PositionPlanViewModel = {
        status: 'in-flight',
        attemptId: 'attempt-456',
        exitPosture: 'ExitToSOL',
        regimeLabel: 'DOWN',
        showBreachControls: true,
      };
      render(<PositionPlanCard plan={plan} />);

      expect(screen.getByText('Transaction Submitted')).toBeTruthy();
      expect(screen.getByText(/Attempt ID: attempt-456/)).toBeTruthy();
    });

    it('disables the acknowledge button while an action is pending', () => {
      const onAcknowledge = vi.fn();
      render(
        <PositionPlanCard
          plan={makeAdvisoryPlan('HOLD')}
          onAcknowledge={onAcknowledge}
          isActionPending
        />,
      );

      const button = screen.getByText('Acknowledge').closest('[aria-disabled]');
      expect(button?.getAttribute('aria-disabled')).toBe('true');

      fireEvent.click(screen.getByText('Acknowledge'));
      expect(onAcknowledge).not.toHaveBeenCalled();
    });

    it('disables the preview button while an action is pending', () => {
      const onPreview = vi.fn();
      render(
        <PositionPlanCard plan={makeRequestingExitPlan()} onPreview={onPreview} isActionPending />,
      );

      const button = screen.getByText('Preview Exit').closest('[aria-disabled]');
      expect(button?.getAttribute('aria-disabled')).toBe('true');

      fireEvent.click(screen.getByText('Preview Exit'));
      expect(onPreview).not.toHaveBeenCalled();
    });

    it('disables the approve button while an action is pending', () => {
      const onApprove = vi.fn();
      render(
        <PositionPlanCard plan={makePreviewReadyPlan()} onApprove={onApprove} isActionPending />,
      );

      const button = screen.getByText('Approve & Sign').closest('[aria-disabled]');
      expect(button?.getAttribute('aria-disabled')).toBe('true');

      fireEvent.click(screen.getByText('Approve & Sign'));
      expect(onApprove).not.toHaveBeenCalled();
    });
  });
});
