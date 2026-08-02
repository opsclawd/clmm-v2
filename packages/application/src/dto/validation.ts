import type {
  PositionSummaryDto,
  PositionDetailDto,
  PositionListFinancialMetricsDto,
  PositionValueMetricDto,
  UnclaimedFeesMetricDto,
  PoolTvlMetricDto,
  PoolFees24hMetricDto,
  TokenAmountValue,
} from './index.js';

const DAY_MS = 86_400_000;

const VALID_RANGE_STATES = ['in-range', 'below-range', 'above-range'] as const;
const VALID_MONITORING_STATUSES = ['active', 'degraded', 'inactive'] as const;
const VALID_BREACH_DIRECTIONS: NonNullable<PositionDetailDto['breachDirection']>['kind'][] = [
  'lower-bound-breach',
  'upper-bound-breach',
];

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isUnixMs(value: unknown): value is number {
  return isNonNegativeFinite(value) && Number.isInteger(value);
}

function hasSource(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTokenAmountValue(value: unknown): value is TokenAmountValue {
  if (!isRecord(value)) {
    return false;
  }

  const decimals = value['decimals'];

  return (
    typeof value['raw'] === 'string' &&
    typeof value['symbol'] === 'string' &&
    (decimals === null ||
      (typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0)) &&
    isNonNegativeFinite(value['usdValue'])
  );
}

function isPositionAmounts(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isTokenAmountValue(value['amountA']) &&
    isTokenAmountValue(value['amountB']) &&
    isNonNegativeFinite(value['totalUsd'])
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

export function isPositionSummaryRecord(value: Record<string, unknown>): boolean {
  return (
    typeof value['positionId'] === 'string' &&
    typeof value['poolId'] === 'string' &&
    typeof value['hasActionableTrigger'] === 'boolean' &&
    VALID_RANGE_STATES.includes(value['rangeState'] as (typeof VALID_RANGE_STATES)[number]) &&
    VALID_MONITORING_STATUSES.includes(
      value['monitoringStatus'] as (typeof VALID_MONITORING_STATUSES)[number],
    ) &&
    typeof value['lowerBoundPrice'] === 'number' &&
    Number.isFinite(value['lowerBoundPrice']) &&
    typeof value['upperBoundPrice'] === 'number' &&
    Number.isFinite(value['upperBoundPrice']) &&
    typeof value['lowerBoundLabel'] === 'string' &&
    typeof value['upperBoundLabel'] === 'string'
  );
}

export function isPositionSummaryDto(value: unknown): value is PositionSummaryDto {
  if (!isRecord(value)) {
    return false;
  }

  return isPositionSummaryRecord(value);
}

export function isPositionDetailDto(value: unknown): value is PositionDetailDto {
  if (!isRecord(value)) {
    return false;
  }

  const breachDirection = value['breachDirection'];
  const currentPrice = value['currentPrice'];
  const positionAmounts = value['positionAmounts'];

  const baseValid =
    isPositionSummaryRecord(value) &&
    typeof currentPrice === 'number' &&
    Number.isFinite(currentPrice) &&
    (value['triggerId'] == null || typeof value['triggerId'] === 'string') &&
    (breachDirection == null ||
      (isRecord(breachDirection) &&
        VALID_BREACH_DIRECTIONS.includes(
          breachDirection['kind'] as NonNullable<PositionDetailDto['breachDirection']>['kind'],
        ))) &&
    (positionAmounts === undefined || isPositionAmounts(positionAmounts));

  if (!baseValid) {
    return false;
  }

  return true;
}

export function isPositionSummaryDtoArray(value: unknown): value is PositionSummaryDto[] {
  return Array.isArray(value) && value.every(isPositionSummaryDto);
}

function isPositionValueMetricDto(value: unknown): value is PositionValueMetricDto {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonNegativeFinite(value['valueUsd']) &&
    isUnixMs(value['valuedAtUnixMs']) &&
    hasSource(value['source']) &&
    value['basis'] === 'principal-token-amounts' &&
    value['scope'] === 'returned-supported-positions' &&
    Array.isArray(value['excludes']) &&
    value['excludes'].length === 5 &&
    value['excludes'].includes('wallet-balances') &&
    value['excludes'].includes('fees') &&
    value['excludes'].includes('rewards') &&
    value['excludes'].includes('collected-history') &&
    value['excludes'].includes('pnl')
  );
}

function isUnclaimedFeesMetricDto(value: unknown): value is UnclaimedFeesMetricDto {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonNegativeFinite(value['valueUsd']) &&
    isUnixMs(value['valuedAtUnixMs']) &&
    hasSource(value['source']) &&
    value['basis'] === 'currently-claimable-trading-fees' &&
    value['scope'] === 'returned-supported-positions' &&
    Array.isArray(value['excludes']) &&
    value['excludes'].length === 3 &&
    value['excludes'].includes('rewards') &&
    value['excludes'].includes('collected-fees') &&
    value['excludes'].includes('lifetime-fees')
  );
}

function isPoolTvlMetricDto(value: unknown): value is PoolTvlMetricDto {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['poolId'] === 'string' &&
    isNonNegativeFinite(value['valueUsd']) &&
    isUnixMs(value['observedAtUnixMs']) &&
    hasSource(value['source']) &&
    value['scope'] === 'whole-orca-pool'
  );
}

function isPoolFees24hMetricDto(value: unknown): value is PoolFees24hMetricDto {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['poolId'] === 'string' &&
    isNonNegativeFinite(value['valueUsd']) &&
    hasSource(value['source']) &&
    isUnixMs(value['windowStartUnixMs']) &&
    isUnixMs(value['windowEndUnixMs']) &&
    value['windowEndUnixMs'] - value['windowStartUnixMs'] === DAY_MS &&
    value['scope'] === 'whole-orca-pool'
  );
}

export function isPositionListFinancialMetricsDto(
  value: unknown,
): value is PositionListFinancialMetricsDto {
  if (!isRecord(value)) {
    return false;
  }

  const positionValue = value['positionValue'];
  const unclaimedFees = value['unclaimedFees'];
  const poolsById = value['poolsById'];

  if (positionValue !== null && !isPositionValueMetricDto(positionValue)) {
    return false;
  }

  if (unclaimedFees !== null && !isUnclaimedFeesMetricDto(unclaimedFees)) {
    return false;
  }

  if (!isRecord(poolsById)) {
    return false;
  }

  for (const [poolId, poolMetrics] of Object.entries(poolsById)) {
    if (!isRecord(poolMetrics)) {
      return false;
    }

    const tvl = poolMetrics['tvl'];
    const fees24h = poolMetrics['fees24h'];

    if (tvl !== null && !isPoolTvlMetricDto(tvl)) {
      return false;
    }
    if (fees24h !== null && !isPoolFees24hMetricDto(fees24h)) {
      return false;
    }

    if (tvl !== null && tvl['poolId'] !== poolId) {
      return false;
    }
    if (fees24h !== null && fees24h['poolId'] !== poolId) {
      return false;
    }
  }

  return true;
}
