import type { PositionDetailDto, PositionSummaryDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type PositionsResponse = {
  positions: PositionSummaryDto[];
};

type PositionDetailResponse = {
  position: unknown;
  error?: string;
};

type BreachDirection = NonNullable<PositionDetailDto['breachDirection']>;

const VALID_RANGE_STATES = ['in-range', 'below-range', 'above-range'] as const;
const VALID_MONITORING_STATUSES = ['active', 'degraded', 'inactive'] as const;
const VALID_BREACH_DIRECTIONS: BreachDirection['kind'][] = [
  'lower-bound-breach',
  'upper-bound-breach',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function isPositionSummaryDto(value: unknown): value is PositionSummaryDto {
  if (!isRecord(value)) {
    return false;
  }

  return isPositionSummaryRecord(value);
}

function isPositionSummaryRecord(value: Record<string, unknown>): boolean {

  return (
    typeof value['positionId'] === 'string' &&
    typeof value['poolId'] === 'string' &&
    typeof value['hasActionableTrigger'] === 'boolean' &&
    VALID_RANGE_STATES.includes(value['rangeState'] as (typeof VALID_RANGE_STATES)[number]) &&
    VALID_MONITORING_STATUSES.includes(
      value['monitoringStatus'] as (typeof VALID_MONITORING_STATUSES)[number],
    )
  );
}

function isPositionDetailDto(value: unknown): value is PositionDetailDto {
  if (!isRecord(value)) {
    return false;
  }

  const breachDirection = value['breachDirection'];
  const lowerBound = value['lowerBound'];
  const upperBound = value['upperBound'];
  const currentPrice = value['currentPrice'];

  return (
    isPositionSummaryRecord(value) &&
    typeof lowerBound === 'number' &&
    Number.isFinite(lowerBound) &&
    typeof upperBound === 'number' &&
    Number.isFinite(upperBound) &&
    typeof currentPrice === 'number' &&
    Number.isFinite(currentPrice) &&
    (value['triggerId'] == null || typeof value['triggerId'] === 'string') &&
    (breachDirection == null ||
      (isRecord(breachDirection) &&
        VALID_BREACH_DIRECTIONS.includes(
          breachDirection['kind'] as BreachDirection['kind'],
        )))
  );
}

function isPositionSummaryDtoArray(value: unknown): value is PositionSummaryDto[] {
  return Array.isArray(value) && value.every(isPositionSummaryDto);
}

export async function fetchSupportedPositions(
  walletAddress: string,
): Promise<PositionSummaryDto[]> {
  try {
    const payload = (await fetchJson(`/positions/${walletAddress}`)) as Partial<PositionsResponse>;

    if (!isPositionSummaryDtoArray(payload.positions)) {
      throw new Error('Malformed positions response');
    }

    return payload.positions;
  } catch (cause: unknown) {
    throw new Error('Could not load supported positions for this wallet', { cause });
  }
}

export async function fetchPositionDetail(
  walletId: string,
  positionId: string,
): Promise<PositionDetailDto> {
  try {
    const payload = (await fetchJson(
      `/positions/${walletId}/${positionId}`,
    )) as Partial<PositionDetailResponse>;

    if (!isPositionDetailDto(payload.position)) {
      throw new Error('Malformed position detail response');
    }

    return payload.position;
  } catch (cause: unknown) {
    throw new Error('Could not load position detail for this wallet', { cause });
  }
}
