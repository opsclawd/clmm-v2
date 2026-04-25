import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { WalletId, LiquidityPosition, PoolId } from '@clmm/domain';
import type { PositionSummaryDto } from '../../dto/index.js';
import { priceFromSqrtPrice, rangeDistancePercent } from '@clmm/domain';

export type ListSupportedPositionsResult = {
  positions: LiquidityPosition[];
  summaryDtos: PositionSummaryDto[];
};

export async function listSupportedPositions(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
}): Promise<ListSupportedPositionsResult> {
  const positions = await params.positionReadPort.listSupportedPositions(params.walletId);

  const uniquePoolIds = [...new Set(positions.map((p) => p.poolId))];
  const poolDataMap = new Map<PoolId, Awaited<ReturnType<SupportedPositionReadPort['getPoolData']>>>();

  await Promise.all(uniquePoolIds.map(async (poolId) => {
    const poolData = await params.positionReadPort.getPoolData(poolId);
    if (poolData) poolDataMap.set(poolId, poolData);
  }));

  const summaryDtos: PositionSummaryDto[] = positions.map((p) => {
    const poolData = poolDataMap.get(p.poolId);
    const decimalsKnown = poolData && poolData.tokenPair.decimalsA !== null && poolData.tokenPair.decimalsB !== null;

    const currentPrice = (poolData && decimalsKnown)
      ? priceFromSqrtPrice(poolData.sqrtPrice, poolData.tokenPair.decimalsA, poolData.tokenPair.decimalsB)
      : p.rangeState.currentPrice;

    const distance = rangeDistancePercent(
      p.rangeState.currentPrice,
      p.bounds.lowerBound,
      p.bounds.upperBound,
    );

    return {
      positionId: p.positionId,
      poolId: p.poolId,
      tokenPairLabel: poolData ? `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}` : `Pool ${p.poolId}`,
      currentPrice,
      currentPriceLabel: (poolData && decimalsKnown)
        ? `$${currentPrice.toFixed(2)}`
        : `tick: ${p.rangeState.currentPrice}`,
      feeRateLabel: poolData ? `${poolData.feeRate} bps` : '',
      rangeState: p.rangeState.kind,
      rangeDistance: {
        belowLowerPercent: distance.belowLowerPercent,
        aboveUpperPercent: distance.aboveUpperPercent,
      },
      hasActionableTrigger: false,
      monitoringStatus: p.monitoringReadiness.kind,
    };
  });

  return { positions, summaryDtos };
}