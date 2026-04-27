import type { PositionDetailDto } from '@clmm/application/public';
import { buildPositionDetailViewModel, type PositionDetailViewModel } from '../view-models/PositionDetailViewModel.js';

export type PositionDetailPresentation = {
  position: PositionDetailViewModel;
};

const EMPTY_TOKEN_AMOUNT = { raw: '0', decimals: null, symbol: '', usdValue: 0 };

function normalizePositionDetailDto(dto: Partial<PositionDetailDto> & Pick<PositionDetailDto, 'positionId' | 'poolId'>): PositionDetailDto {
  const poolId = dto.poolId ?? 'unknown';
  return {
    positionId: dto.positionId,
    poolId,
    tokenPairLabel: dto.tokenPairLabel ?? `Pool ${poolId}`,
    currentPrice: dto.currentPrice ?? 0,
    currentPriceLabel: dto.currentPriceLabel ?? `tick: ${dto.currentPrice ?? 0}`,
    feeRateLabel: dto.feeRateLabel ?? '',
    rangeState: dto.rangeState ?? 'in-range',
    rangeDistance: dto.rangeDistance ?? { belowLowerPercent: 0, aboveUpperPercent: 0 },
    hasActionableTrigger: dto.hasActionableTrigger ?? false,
    monitoringStatus: dto.monitoringStatus ?? 'active',
    lowerBound: dto.lowerBound ?? 0,
    upperBound: dto.upperBound ?? 0,
    lowerBoundLabel: dto.lowerBoundLabel ?? `tick ${dto.lowerBound ?? 0}`,
    upperBoundLabel: dto.upperBoundLabel ?? `tick ${dto.upperBound ?? 0}`,
    sqrtPrice: dto.sqrtPrice ?? '0',
    unclaimedFees: dto.unclaimedFees ?? {
      feeOwedA: { ...EMPTY_TOKEN_AMOUNT },
      feeOwedB: { ...EMPTY_TOKEN_AMOUNT },
      totalUsd: 0,
    },
    unclaimedRewards: dto.unclaimedRewards ?? {
      rewards: [],
      totalUsd: 0,
    },
    positionLiquidity: dto.positionLiquidity ?? '0',
    poolLiquidity: dto.poolLiquidity ?? '0',
    poolDepthLabel: dto.poolDepthLabel ?? 'depth unavailable',
    ...(dto.triggerId ? { triggerId: dto.triggerId } : {}),
    ...(dto.breachDirection ? { breachDirection: dto.breachDirection } : {}),
  };
}

export function presentPositionDetail(params: {
  position: PositionDetailDto;
  now: number;
}): PositionDetailPresentation {
  const normalized = normalizePositionDetailDto(params.position as Partial<PositionDetailDto> & Pick<PositionDetailDto, 'positionId' | 'poolId'>);
  return { position: buildPositionDetailViewModel(normalized, params.now) };
}
