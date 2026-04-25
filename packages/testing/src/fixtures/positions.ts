import type { LiquidityPosition, PoolData, PositionDetail, PriceQuote } from '@clmm/domain';
import {
  makePositionId,
  makeWalletId,
  makePoolId,
  makeClockTimestamp,
} from '@clmm/domain';

export const FIXTURE_POSITION_ID = makePositionId('fixture-pos-1');
export const FIXTURE_WALLET_ID = makeWalletId('fixture-wallet-1');
export const FIXTURE_POOL_ID = makePoolId('fixture-pool-1');

export const FIXTURE_POSITION_IN_RANGE: LiquidityPosition = {
  positionId: FIXTURE_POSITION_ID,
  walletId: FIXTURE_WALLET_ID,
  poolId: FIXTURE_POOL_ID,
  bounds: { lowerBound: 100, upperBound: 200 },
  lastObservedAt: makeClockTimestamp(1_000_000),
  rangeState: { kind: 'in-range', currentPrice: 150 },
  monitoringReadiness: { kind: 'active' },
};

export const FIXTURE_POSITION_BELOW_RANGE: LiquidityPosition = {
  ...FIXTURE_POSITION_IN_RANGE,
  rangeState: { kind: 'below-range', currentPrice: 80 },
};

export const FIXTURE_POSITION_ABOVE_RANGE: LiquidityPosition = {
  ...FIXTURE_POSITION_IN_RANGE,
  rangeState: { kind: 'above-range', currentPrice: 250 },
};

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const FIXTURE_POOL_DATA: PoolData = {
  poolId: FIXTURE_POOL_ID,
  tokenPair: {
    mintA: SOL_MINT,
    mintB: USDC_MINT,
    symbolA: 'SOL',
    symbolB: 'USDC',
    decimalsA: 9,
    decimalsB: 6,
  },
  sqrtPrice: 184467440737095516n,
  feeRate: 1000,
  tickSpacing: 64,
  liquidity: 2400000000n,
  tickCurrentIndex: 150,
};

export const FIXTURE_POSITION_DETAIL: PositionDetail = {
  position: FIXTURE_POSITION_IN_RANGE,
  poolData: FIXTURE_POOL_DATA,
  fees: {
    feeOwedA: 120000000n,
    feeOwedB: 47230000n,
    rewardInfos: [],
  },
  positionLiquidity: 5000000000n,
};

export const FIXTURE_SOL_PRICE_QUOTE: PriceQuote = {
  tokenMint: SOL_MINT,
  usdValue: 150,
  symbol: 'SOL',
  quotedAt: makeClockTimestamp(Date.now()),
};

export const FIXTURE_USDC_PRICE_QUOTE: PriceQuote = {
  tokenMint: USDC_MINT,
  usdValue: 1,
  symbol: 'USDC',
  quotedAt: makeClockTimestamp(Date.now()),
};
