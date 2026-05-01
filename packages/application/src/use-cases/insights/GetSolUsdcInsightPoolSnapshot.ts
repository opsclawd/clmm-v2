import type { PoolId } from '@clmm/domain';
import { priceFromSqrtPrice, formatFeeRateLabel } from '@clmm/domain';
import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { SolUsdcPoolSnapshotDto } from '../../dto/index.js';

export type GetSolUsdcInsightPoolSnapshotResult =
  | { kind: 'ok'; pool: SolUsdcPoolSnapshotDto }
  | { kind: 'pool-unavailable' };

export async function getSolUsdcInsightPoolSnapshot(params: {
  poolId: PoolId;
  positionReadPort: SupportedPositionReadPort;
  now: () => number;
}): Promise<GetSolUsdcInsightPoolSnapshotResult> {
  let poolData;
  try {
    poolData = await params.positionReadPort.getPoolData(params.poolId);
  } catch {
    return { kind: 'pool-unavailable' };
  }
  if (!poolData) return { kind: 'pool-unavailable' };

  const { decimalsA, decimalsB, symbolA, symbolB } = poolData.tokenPair;
  if (decimalsA === null || decimalsB === null) {
    return { kind: 'pool-unavailable' };
  }

  const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, decimalsA, decimalsB);

  const pool: SolUsdcPoolSnapshotDto = {
    poolId: poolData.poolId,
    pair: 'SOL/USDC',
    source: 'orca',
    observedAtUnixMs: params.now(),
    tokenPairLabel: `${symbolA} / ${symbolB}`,
    currentPrice,
    currentPriceLabel: `${symbolB} ${currentPrice.toFixed(2)}`,
    sqrtPrice: poolData.sqrtPrice.toString(),
    tickCurrentIndex: poolData.tickCurrentIndex,
    tickSpacing: poolData.tickSpacing,
    feeRate: poolData.feeRate,
    feeRateLabel: formatFeeRateLabel(poolData.feeRate),
    poolLiquidity: poolData.liquidity.toString(),
    priceSource: 'orca_whirlpool_sqrt_price',
  };

  return { kind: 'ok', pool };
}