import type {
  PositionDetailDto,
  PositionListFinancialMetricsDto,
  PositionSummaryDto,
} from '@clmm/application/public';
import {
  isPositionSummaryDtoArray,
  isPositionDetailDto,
  isPositionListFinancialMetricsDto,
} from '@clmm/application/public';
import { fetchJson } from './http';

type PositionsResponse = {
  positions: PositionSummaryDto[];
  financialMetrics?: unknown;
  warning?: string;
  error?: string;
};

type PositionDetailResponse = {
  position: unknown;
  error?: string;
};

export type PositionsResult = {
  positions: PositionSummaryDto[];
  financialMetrics: PositionListFinancialMetricsDto;
  warning?: string;
};

function unavailableMetricsForPositions(
  positions: PositionSummaryDto[],
): PositionListFinancialMetricsDto {
  const poolsById: Record<string, { tvl: null; fees24h: null }> = {};
  for (const position of positions) {
    poolsById[position.poolId] = { tvl: null, fees24h: null };
  }
  return {
    positionValue: null,
    unclaimedFees: null,
    poolsById,
  };
}

export async function fetchSupportedPositions(walletAddress: string): Promise<PositionsResult> {
  try {
    const payload = (await fetchJson(`/positions/${walletAddress}`)) as Partial<PositionsResponse>;

    if (!isPositionSummaryDtoArray(payload.positions)) {
      throw new Error('Malformed positions response');
    }

    if (payload.error && payload.positions.length === 0) {
      throw new Error(payload.error);
    }

    const financialMetrics =
      payload.financialMetrics === undefined
        ? unavailableMetricsForPositions(payload.positions)
        : payload.financialMetrics;

    if (!isPositionListFinancialMetricsDto(financialMetrics)) {
      throw new Error('Malformed positions financial metrics');
    }

    const returnedPoolIds = new Set(payload.positions.map((position) => position.poolId));
    if ([...returnedPoolIds].some((poolId) => financialMetrics.poolsById[poolId] === undefined)) {
      throw new Error('Malformed positions financial metrics: missing returned pool');
    }

    return {
      positions: payload.positions,
      financialMetrics,
      ...(payload.warning ? { warning: payload.warning } : {}),
      ...(payload.error && payload.positions.length > 0 ? { warning: payload.error } : {}),
    };
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
