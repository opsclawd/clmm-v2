import type { PositionSummaryDto } from '@clmm/application/public';

export type MonitoringStatus = 'active' | 'degraded' | 'inactive';

const VALID_MONITORING_STATUSES: ReadonlySet<string> = new Set<string>([
  'active',
  'degraded',
  'inactive',
]);

export function asMonitoringStatus(value: string): MonitoringStatus {
  if (!VALID_MONITORING_STATUSES.has(value)) {
    throw new Error(`Invalid monitoringStatus: ${value}`);
  }
  return value as MonitoringStatus;
}

export type PositionListItemViewModel = {
  positionId: string;
  poolId: string;
  poolLabel: string;
  currentPrice: number;
  currentPriceLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringStatus: MonitoringStatus;
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
};

export function buildPositionListViewModel(positions: PositionSummaryDto[]): PositionListViewModel {
  const items: PositionListItemViewModel[] = positions.map((p) => ({
    positionId: p.positionId,
    poolId: p.poolId,
    poolLabel: p.tokenPairLabel,
    currentPrice: p.currentPrice,
    currentPriceLabel: p.currentPriceLabel ?? `Current: ${p.currentPrice}`,
    rangeStatusKind: p.rangeState,
    hasAlert: p.hasActionableTrigger,
    monitoringStatus: asMonitoringStatus(p.monitoringStatus),
    lowerBoundPrice: p.lowerBoundPrice,
    upperBoundPrice: p.upperBoundPrice,
    lowerBoundLabel: p.lowerBoundLabel,
    upperBoundLabel: p.upperBoundLabel,
  }));

  return { items, isEmpty: items.length === 0 };
}
