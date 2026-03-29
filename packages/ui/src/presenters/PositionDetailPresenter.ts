import type { PositionDetailDto, ActionableAlertDto } from '@clmm/application/public';
import { buildPositionDetailViewModel, type PositionDetailViewModel } from '../view-models/PositionDetailViewModel.js';

export type PositionDetailPresentation = {
  position: PositionDetailViewModel;
  alert?: {
    triggerId: string;
    directionLabel: string;
  };
};

export function presentPositionDetail(params: {
  position: PositionDetailDto;
  alert?: ActionableAlertDto;
}): PositionDetailPresentation {
  const positionVm = buildPositionDetailViewModel(params.position);

  if (params.alert) {
    return {
      position: positionVm,
      alert: {
        triggerId: params.alert.triggerId,
        directionLabel: params.alert.breachDirection.kind === 'lower-bound-breach'
          ? 'Lower Bound Breach — Exit to USDC'
          : 'Upper Bound Breach — Exit to SOL',
      },
    };
  }

  return { position: positionVm };
}
