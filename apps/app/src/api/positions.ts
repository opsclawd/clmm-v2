import type { PositionDetailDto, PositionSummaryDto } from '@clmm/application/public';
import { isPositionSummaryDtoArray, isPositionDetailDto } from '@clmm/application/public';
import { fetchJson } from './http';

type PositionsResponse = {
  positions: PositionSummaryDto[];
  warning?: string;
  error?: string;
};

type PositionDetailResponse = {
  position: unknown;
  error?: string;
};

export type PositionsResult = {
  positions: PositionSummaryDto[];
  warning?: string;
};

export async function fetchSupportedPositions(
  walletAddress: string,
): Promise<PositionsResult> {
  try {
    const payload = (await fetchJson(`/positions/${walletAddress}`)) as Partial<PositionsResponse>;

    if (!isPositionSummaryDtoArray(payload.positions)) {
      throw new Error('Malformed positions response');
    }

    if (payload.error) {
      throw new Error(payload.error);
    }

    return {
      positions: payload.positions,
      ...(payload.warning ? { warning: payload.warning } : {}),
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