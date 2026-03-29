import type { PositionDetailDto } from '@clmm/application/public';
import { getRangeStatusBadgeProps } from '../components/RangeStatusBadgeUtils.js';

export type PositionDetailViewModel = {
  positionId: string;
  poolLabel: string;
  rangeBoundsLabel: string;
  currentPriceLabel: string;
  rangeStatusLabel: string;
  rangeStatusColorKey: string;
  hasAlert: boolean;
  alertLabel: string;
  breachDirectionLabel?: string;
};

export function buildPositionDetailViewModel(dto: PositionDetailDto): PositionDetailViewModel {
  const badge = getRangeStatusBadgeProps(dto.rangeState);

  const base = {
    positionId: dto.positionId,
    poolLabel: `Pool ${dto.poolId}`,
    rangeBoundsLabel: `${dto.lowerBound} — ${dto.upperBound}`,
    currentPriceLabel: `Current: ${dto.currentPrice}`,
    rangeStatusLabel: badge.label,
    rangeStatusColorKey: badge.colorKey,
    hasAlert: dto.hasActionableTrigger,
    alertLabel: dto.hasActionableTrigger ? 'Action Required' : 'No Alerts',
  };

  if (dto.breachDirection) {
    return {
      ...base,
      breachDirectionLabel: dto.breachDirection.kind === 'lower-bound-breach'
        ? 'Price dropped below lower bound'
        : 'Price rose above upper bound',
    };
  }

  return base;
}
