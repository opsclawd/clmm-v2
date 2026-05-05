import type { PositionDetailDto, PositionSummaryDto } from '@clmm/application/public';
import { isPositionSummaryDtoArray, isPositionDetailDto } from '@clmm/application/public';
import { fetchJson } from './http';

type PositionsResponse = {
  positions: PositionSummaryDto[];
};

type PositionDetailResponse = {
  position: unknown;
  error?: string;
};

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