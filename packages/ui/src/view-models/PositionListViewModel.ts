import type { PositionSummaryDto } from '@clmm/application/public';

export type PositionListItemViewModel = {
  positionId: string;
  poolLabel: string;
  rangeStatusLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
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

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolLabel: `Pool ${p.poolId}`,
    rangeStatusLabel: rangeStateLabel(p.rangeState),
    rangeStatusKind: p.rangeState,
    hasAlert: p.hasActionableTrigger,
    monitoringLabel: monitoringLabel(p.monitoringStatus),
  }));

  return { items, isEmpty: items.length === 0 };
}
