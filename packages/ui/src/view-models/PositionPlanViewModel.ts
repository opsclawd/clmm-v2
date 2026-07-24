export type PlanAction =
  | { kind: 'HOLD' }
  | { kind: 'STAND_DOWN' }
  | { kind: 'REQUEST_EXIT_CLMM'; exitIntent: { posture: 'ExitToUSDC' | 'ExitToSOL' } };

export type PlanLifecycleState =
  | { kind: 'requested' }
  | {
      kind: 'advisory-ready';
      advisoryAction: PlanAction;
      regimeResponse: {
        regime: 'UP' | 'DOWN' | 'CHOP';
        suitability: 'ALLOWED' | 'CAUTION' | 'BLOCKED' | 'UNKNOWN';
      };
    }
  | {
      kind: 'exit-previewed';
      previewId: string;
      advisoryAction: PlanAction;
    }
  | { kind: 'awaiting-signature'; attemptId?: string; advisoryAction: PlanAction }
  | { kind: 'submitted'; attemptId?: string; advisoryAction: PlanAction }
  | { kind: 'result-pending' }
  | { kind: 'reported' }
  | { kind: 'report-failed' }
  | { kind: 'conflict'; priorPlanId: string }
  | { kind: 'superseded' };

export type CurrentPlanDto = {
  planId: string;
  canonicalHash: string;
  positionId: string;
  state: PlanLifecycleState;
} | null;

export type PositionPlanViewModel =
  | {
      status: 'unavailable';
      unavailableReason?: string;
    }
  | {
      status: 'advisory';
      advisoryKind: 'HOLD' | 'STAND_DOWN';
      regimeLabel: string;
      suitabilityLabel: string;
      canAcknowledge: boolean;
      showBreachControls: boolean;
    }
  | {
      status: 'requesting-exit';
      exitPosture: 'ExitToUSDC' | 'ExitToSOL';
      regimeLabel: string;
      canPreview: boolean;
      previewId?: string;
      showBreachControls: boolean;
    }
  | {
      status: 'preview-ready';
      previewId: string;
      exitPosture: 'ExitToUSDC' | 'ExitToSOL';
      regimeLabel: string;
      canApprove: boolean;
      showBreachControls: boolean;
    }
  | {
      status: 'awaiting-signature';
      exitPosture: 'ExitToUSDC' | 'ExitToSOL';
      regimeLabel: string;
      showBreachControls: boolean;
    }
  | {
      status: 'in-flight';
      attemptId: string;
      exitPosture: 'ExitToUSDC' | 'ExitToSOL';
      regimeLabel: string;
      showBreachControls: boolean;
    }
  | {
      status: 'result-pending';
      regimeLabel: string;
      showBreachControls: boolean;
    }
  | {
      status: 'completed';
      regimeLabel: string;
      showBreachControls: boolean;
    }
  | {
      status: 'failed';
      regimeLabel: string;
      showBreachControls: boolean;
    }
  | {
      status: 'stale';
      staleReason: string;
      showBreachControls: boolean;
    }
  | {
      status: 'conflict';
      conflictReason: string;
      showBreachControls: boolean;
    }
  | {
      status: 'superseded';
      supersededReason: string;
      showBreachControls: boolean;
    };

function getAdvisoryPosture(
  action:
    | { kind: 'HOLD' }
    | { kind: 'STAND_DOWN' }
    | { kind: 'REQUEST_EXIT_CLMM'; exitIntent: { posture: 'ExitToUSDC' | 'ExitToSOL' } },
): 'ExitToUSDC' | 'ExitToSOL' {
  if (action.kind === 'REQUEST_EXIT_CLMM') {
    return action.exitIntent.posture;
  }
  return 'ExitToUSDC';
}

export function buildPositionPlanViewModel(
  plan: CurrentPlanDto,
  breachDirection?: { kind: 'lower-bound-breach' } | { kind: 'upper-bound-breach' },
): PositionPlanViewModel {
  if (plan === null) {
    return { status: 'unavailable' };
  }

  const showBreachControls = breachDirection != null;

  switch (plan.state.kind) {
    case 'requested':
      return { status: 'unavailable', unavailableReason: 'Plan is being requested...' };

    case 'advisory-ready': {
      const action = plan.state.advisoryAction;
      const regimeLabel = plan.state.regimeResponse.regime;
      const suitabilityLabel = plan.state.regimeResponse.suitability;

      if (action.kind === 'HOLD' || action.kind === 'STAND_DOWN') {
        return {
          status: 'advisory',
          advisoryKind: action.kind,
          regimeLabel,
          suitabilityLabel,
          canAcknowledge: true,
          showBreachControls,
        };
      }

      if (action.kind === 'REQUEST_EXIT_CLMM') {
        const exitPosture = getAdvisoryPosture(action);
        return {
          status: 'requesting-exit',
          exitPosture,
          regimeLabel,
          canPreview: true,
          showBreachControls,
        };
      }

      return { status: 'unavailable' };
    }

    case 'exit-previewed': {
      const action = plan.state.advisoryAction;
      const exitPosture = getAdvisoryPosture(action);
      return {
        status: 'preview-ready',
        previewId: plan.state.previewId,
        exitPosture,
        regimeLabel: 'DOWN',
        canApprove: true,
        showBreachControls,
      };
    }

    case 'awaiting-signature': {
      const action = plan.state.advisoryAction;
      const exitPosture = getAdvisoryPosture(action);
      return {
        status: 'awaiting-signature',
        exitPosture,
        regimeLabel: 'DOWN',
        showBreachControls,
      };
    }

    case 'submitted': {
      const action = plan.state.advisoryAction;
      const exitPosture = getAdvisoryPosture(action);
      return {
        status: 'in-flight',
        attemptId: plan.state.attemptId ?? 'unknown',
        exitPosture,
        regimeLabel: 'DOWN',
        showBreachControls,
      };
    }

    case 'result-pending':
      return { status: 'result-pending', regimeLabel: 'DOWN', showBreachControls };

    case 'reported':
      return { status: 'completed', regimeLabel: 'DOWN', showBreachControls };

    case 'report-failed':
      return { status: 'failed', regimeLabel: 'DOWN', showBreachControls };

    case 'conflict':
      return {
        status: 'conflict',
        conflictReason: 'A conflicting plan decision was detected',
        showBreachControls,
      };

    case 'superseded':
      return {
        status: 'superseded',
        supersededReason: 'A newer plan has superseded this one',
        showBreachControls,
      };

    default:
      return { status: 'unavailable', unavailableReason: 'Unknown plan state' };
  }
}
