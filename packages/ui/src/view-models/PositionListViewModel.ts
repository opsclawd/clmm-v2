import type { PositionSummaryDto, PositionListFinancialMetricsDto } from '@clmm/application/public';

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

export type FinancialMetricViewModel =
  | { kind: 'unavailable'; label: '—' }
  | { kind: 'available'; valueUsd: number; label: string };

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toFinancialMetricViewModel(
  metric: { valueUsd: number } | null | undefined,
): FinancialMetricViewModel {
  if (metric == null || !Number.isFinite(metric.valueUsd) || metric.valueUsd < 0) {
    return { kind: 'unavailable', label: '—' };
  }
  return {
    kind: 'available',
    valueUsd: metric.valueUsd,
    label: USD_FORMATTER.format(metric.valueUsd),
  };
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
  poolTvl: FinancialMetricViewModel;
  poolFees24h: FinancialMetricViewModel;
};

export type PositionListViewModel = {
  items: PositionListItemViewModel[];
  isEmpty: boolean;
  positionValue: FinancialMetricViewModel;
  unclaimedFees: FinancialMetricViewModel;
};

export function buildPositionListViewModel(
  positions: PositionSummaryDto[],
  financialMetrics: PositionListFinancialMetricsDto,
): PositionListViewModel {
  const poolsById = financialMetrics?.poolsById ?? {};

  const items: PositionListItemViewModel[] = positions.map((p) => {
    const poolMetrics = poolsById[p.poolId];
    return {
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
      poolTvl: toFinancialMetricViewModel(poolMetrics?.tvl ?? null),
      poolFees24h: toFinancialMetricViewModel(poolMetrics?.fees24h ?? null),
    };
  });

  return {
    items,
    isEmpty: items.length === 0,
    positionValue: toFinancialMetricViewModel(financialMetrics?.positionValue ?? null),
    unclaimedFees: toFinancialMetricViewModel(financialMetrics?.unclaimedFees ?? null),
  };
}
