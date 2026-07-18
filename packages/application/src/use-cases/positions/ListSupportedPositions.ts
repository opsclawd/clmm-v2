import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { WalletId, LiquidityPosition, PoolId } from '@clmm/domain';
import type { PositionSummaryDto, PositionListFinancialMetricsDto } from '../../dto/index.js';
import { priceFromSqrtPrice, rangeDistancePercent, formatFeeRateLabel } from '@clmm/domain';
import { buildPositionDisplayBounds } from './buildPositionDisplayBounds.js';

export type ListSupportedPositionsResult = {
  positions: LiquidityPosition[];
  summaryDtos: PositionSummaryDto[];
  poolMetadataFailures: number;
  financialMetrics: PositionListFinancialMetricsDto;
};

export async function listSupportedPositions(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
}): Promise<ListSupportedPositionsResult> {
  const positions = await params.positionReadPort.listSupportedPositions(params.walletId);

  const uniquePoolIds = [...new Set(positions.map((p) => p.poolId))];
  const poolDataMap = new Map<
    PoolId,
    Awaited<ReturnType<SupportedPositionReadPort['getPoolData']>>
  >();

  let poolMetadataFailures = 0;
  await Promise.allSettled(
    uniquePoolIds.map(async (poolId) => {
      try {
        const poolData = await params.positionReadPort.getPoolData(poolId);
        if (poolData) {
          poolDataMap.set(poolId, poolData);
        } else {
          poolMetadataFailures++;
        }
      } catch {
        poolMetadataFailures++;
      }
    }),
  );

  const summaryDtos: PositionSummaryDto[] = [];
  for (const p of positions) {
    const poolData = poolDataMap.get(p.poolId);
    if (!poolData) continue;
    const { decimalsA, decimalsB } = poolData.tokenPair;
    if (decimalsA === null || decimalsB === null) {
      poolMetadataFailures++;
      continue;
    }

    const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB);
    const distance = rangeDistancePercent(
      p.rangeState.currentPrice,
      p.bounds.lowerBound,
      p.bounds.upperBound,
    );

    const displayQuoteSymbol = poolData.tokenPair.symbolB;
    const bounds = buildPositionDisplayBounds({
      lowerTick: p.bounds.lowerBound,
      upperTick: p.bounds.upperBound,
      decimalsA,
      decimalsB,
      displayQuoteSymbol,
    });

    summaryDtos.push({
      positionId: p.positionId,
      poolId: p.poolId,
      tokenPairLabel: `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}`,
      currentPrice,
      currentPriceLabel: `${displayQuoteSymbol} ${currentPrice.toFixed(2)}`,
      feeRateLabel: formatFeeRateLabel(poolData.feeRate),
      lowerBoundPrice: bounds.lowerBoundPrice,
      upperBoundPrice: bounds.upperBoundPrice,
      lowerBoundLabel: bounds.lowerBoundLabel,
      upperBoundLabel: bounds.upperBoundLabel,
      rangeState: p.rangeState.kind,
      rangeDistance: {
        belowLowerPercent: distance.belowLowerPercent,
        aboveUpperPercent: distance.aboveUpperPercent,
      },
      hasActionableTrigger: false,
      monitoringStatus: p.monitoringReadiness.kind,
    });
  }

  const poolsById = Object.fromEntries(
    [...new Set(summaryDtos.map((dto) => dto.poolId))].map((poolId) => [
      poolId,
      { tvl: null, fees24h: null },
    ]),
  );

  const financialMetrics: PositionListFinancialMetricsDto = {
    positionValue: null,
    unclaimedFees: null,
    poolsById,
  };

  return { positions, summaryDtos, poolMetadataFailures, financialMetrics };
}
