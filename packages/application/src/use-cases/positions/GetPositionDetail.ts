import type { SupportedPositionReadPort, PricePort } from '../../ports/index.js';
import type { PositionId, WalletId, LiquidityPosition } from '@clmm/domain';
import type { PositionDetailDto, TokenAmountValue, RewardAmountValue } from '../../dto/index.js';
import { priceFromSqrtPrice, rangeDistancePercent, tokenAmountToUsd, tickToPrice } from '@clmm/domain';

export type GetPositionDetailResult =
  | { kind: 'found'; position: LiquidityPosition; detailDto: PositionDetailDto }
  | { kind: 'not-found' };

export async function getPositionDetail(params: {
  walletId: WalletId;
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
  pricePort: PricePort;
}): Promise<GetPositionDetailResult> {
  const detail = await params.positionReadPort.getPositionDetail(params.walletId, params.positionId);
  if (!detail) return { kind: 'not-found' };

  const { position, poolData, fees, positionLiquidity } = detail;

  const priceMap = new Map<string, { usdValue: number; symbol: string }>();
  try {
    const mints = [poolData.tokenPair.mintA, poolData.tokenPair.mintB];
    const rewardMints = fees.rewardInfos.map((r) => r.mint).filter((m) => !mints.includes(m));
    const allMints = [...mints, ...rewardMints];
    const quotes = await params.pricePort.getPrices([...new Set(allMints)]);
    for (const q of quotes) {
      priceMap.set(q.tokenMint, { usdValue: q.usdValue, symbol: q.symbol });
    }
  } catch {
    // Price fetch failed — degrade gracefully
  }

  const currentPrice = priceFromSqrtPrice(poolData.sqrtPrice, poolData.tokenPair.decimalsA, poolData.tokenPair.decimalsB);
  const distance = rangeDistancePercent(
    position.rangeState.currentPrice,
    position.bounds.lowerBound,
    position.bounds.upperBound,
  );

  const priceA = priceMap.get(poolData.tokenPair.mintA);
  const priceB = priceMap.get(poolData.tokenPair.mintB);

  const feeOwedA: TokenAmountValue = {
    raw: fees.feeOwedA.toString(),
    decimals: poolData.tokenPair.decimalsA,
    symbol: poolData.tokenPair.symbolA,
    usdValue: priceA ? tokenAmountToUsd(fees.feeOwedA, poolData.tokenPair.decimalsA, priceA.usdValue) : 0,
  };

  const feeOwedB: TokenAmountValue = {
    raw: fees.feeOwedB.toString(),
    decimals: poolData.tokenPair.decimalsB,
    symbol: poolData.tokenPair.symbolB,
    usdValue: priceB ? tokenAmountToUsd(fees.feeOwedB, poolData.tokenPair.decimalsB, priceB.usdValue) : 0,
  };

  const totalFeesUsd = feeOwedA.usdValue + feeOwedB.usdValue;

  const rewardValues: RewardAmountValue[] = fees.rewardInfos.map((r) => {
    const rPrice = priceMap.get(r.mint);
    return {
      mint: r.mint,
      amount: r.amountOwed.toString(),
      decimals: r.decimals,
      symbol: rPrice?.symbol ?? r.mint,
      usdValue: rPrice ? tokenAmountToUsd(r.amountOwed, r.decimals, rPrice.usdValue) : 0,
    };
  });

  const totalRewardsUsd = rewardValues.reduce((sum, r) => sum + r.usdValue, 0);

  const poolDepthLabel = 'depth unavailable';

  const detailDto: PositionDetailDto = {
    positionId: position.positionId,
    poolId: position.poolId,
    tokenPairLabel: `${poolData.tokenPair.symbolA} / ${poolData.tokenPair.symbolB}`,
    currentPrice,
    currentPriceLabel: `$${currentPrice.toFixed(2)}`,
    feeRateLabel: `${poolData.feeRate} bps`,
    rangeState: position.rangeState.kind,
    rangeDistance: {
      belowLowerPercent: distance.belowLowerPercent,
      aboveUpperPercent: distance.aboveUpperPercent,
    },
    hasActionableTrigger: false,
    monitoringStatus: position.monitoringReadiness.kind,
    lowerBound: position.bounds.lowerBound,
    upperBound: position.bounds.upperBound,
    lowerBoundLabel: `$${tickToPrice(position.bounds.lowerBound, poolData.tokenPair.decimalsA, poolData.tokenPair.decimalsB).toFixed(2)}`,
    upperBoundLabel: `$${tickToPrice(position.bounds.upperBound, poolData.tokenPair.decimalsA, poolData.tokenPair.decimalsB).toFixed(2)}`,
    sqrtPrice: poolData.sqrtPrice.toString(),
    unclaimedFees: {
      feeOwedA,
      feeOwedB,
      totalUsd: totalFeesUsd,
    },
    unclaimedRewards: {
      rewards: rewardValues,
      totalUsd: totalRewardsUsd,
    },
    positionLiquidity: positionLiquidity.toString(),
    poolLiquidity: poolData.liquidity.toString(),
    poolDepthLabel,
  };

  return { kind: 'found', position, detailDto };
}