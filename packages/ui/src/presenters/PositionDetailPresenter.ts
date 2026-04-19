import type { PositionDetailDto } from '@clmm/application/public';
import { buildPositionDetailViewModel, type PositionDetailViewModel } from '../view-models/PositionDetailViewModel.js';

export type PositionDetailPresentation = {
  position: PositionDetailViewModel;
};

export function presentPositionDetail(params: {
  position: PositionDetailDto;
  now: number;
}): PositionDetailPresentation {
  return { position: buildPositionDetailViewModel(params.position, params.now) };
}
