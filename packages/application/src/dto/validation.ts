import type { PositionSummaryDto, PositionDetailDto } from './index.js';

const VALID_RANGE_STATES = ['in-range', 'below-range', 'above-range'] as const;
const VALID_MONITORING_STATUSES = ['active', 'degraded', 'inactive'] as const;
const VALID_BREACH_DIRECTIONS: NonNullable<PositionDetailDto['breachDirection']>['kind'][] = [
  'lower-bound-breach',
  'upper-bound-breach',
];

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

  const baseValid =
    isPositionSummaryRecord(value) &&
    typeof currentPrice === 'number' &&
    Number.isFinite(currentPrice) &&
    (value['triggerId'] == null || typeof value['triggerId'] === 'string') &&
    (breachDirection == null ||
      (isRecord(breachDirection) &&
        VALID_BREACH_DIRECTIONS.includes(
          breachDirection['kind'] as NonNullable<PositionDetailDto['breachDirection']>['kind'],
        )));

  if (!baseValid) {
    return false;
  }

  return true;
}

export function isPositionSummaryDtoArray(value: unknown): value is PositionSummaryDto[] {
  return Array.isArray(value) && value.every(isPositionSummaryDto);
}