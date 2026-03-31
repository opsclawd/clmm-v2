import type { PositionSummaryDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type PositionsResponse = {
  positions: PositionSummaryDto[];
};

const VALID_RANGE_STATES = ['in-range', 'below-range', 'above-range'] as const;
const VALID_MONITORING_STATUSES = ['active', 'degraded', 'inactive'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null;
}

function isPositionSummaryDto(value: unknown): value is PositionSummaryDto {
  if (!isRecord(value)) {
    return false;
  }

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
