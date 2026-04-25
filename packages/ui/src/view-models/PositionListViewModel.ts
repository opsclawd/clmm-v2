import type { PositionSummaryDto } from '@clmm/application/public';

export type PositionListItemViewModel = {
  positionId: string;
  poolLabel: string;
  currentPriceLabel: string;
  feeRateLabel: string;
  rangeStatusLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  rangeDistanceLabel: string;
  hasAlert: boolean;
  monitoringLabel: string;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

function rangeStateLabel(kind: string): string {
  switch (kind) {
    case 'in-range': return 'In Range';
    case 'below-range': return 'Below Range';
    case 'above-range': return 'Above Range';
    default: return 'Unknown';
  }
}

function monitoringLabel(status: string): string {
  switch (status) {
    case 'active': return 'Monitoring Active';
    case 'degraded': return 'Monitoring Degraded';
    case 'inactive': return 'Monitoring Inactive';
    default: return 'Unknown';
  }
}

function rangeDistanceLabel(distance: { belowLowerPercent: number; aboveUpperPercent: number } | undefined): string {
  if (!distance) return '';
  if (distance.belowLowerPercent > 0) {
    return `${distance.belowLowerPercent.toFixed(1)}% below lower`;
  }
  if (distance.aboveUpperPercent > 0) {
    return `${distance.aboveUpperPercent.toFixed(1)}% above upper`;
  }
  return '';
}

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolLabel: p.tokenPairLabel,
    currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
    feeRateLabel: p.feeRateLabel ?? '',
    rangeStatusLabel: rangeStateLabel(p.rangeState),
    rangeStatusKind: p.rangeState,
    rangeDistanceLabel: rangeDistanceLabel(p.rangeDistance),
    hasAlert: p.hasActionableTrigger,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
  }));

  return { items, isEmpty: items.length === 0 };
}