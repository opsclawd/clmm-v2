import type { PositionSummaryDto } from '@clmm/application/public';

export type PositionListItemViewModel = {
  positionId: string;
  poolId: string;
  poolLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

function monitoringLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Monitoring Active';
    case 'degraded':
      return 'Monitoring Degraded';
    case 'inactive':
      return 'Monitoring Inactive';
    default:
      return 'Unknown';
  }
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolId: p.poolId,
    poolLabel: p.tokenPairLabel,
    currentPrice: p.currentPrice,
    currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
    rangeStatusKind: p.rangeState,
    hasAlert: p.hasActionableTrigger,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
    lowerBoundPrice: p.lowerBoundPrice,
    upperBoundPrice: p.upperBoundPrice,
    lowerBoundLabel: p.lowerBoundLabel,
    upperBoundLabel: p.upperBoundLabel,
  }));

  return { items, isEmpty: items.length === 0 };
}
