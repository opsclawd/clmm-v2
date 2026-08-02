export function whirlpoolFeeRateToBps(feeRateHundredths: number): number {
  return feeRateHundredths / 100;
}

export function formatFeeRateLabel(feeRateHundredths: number): string {
  const bps = whirlpoolFeeRateToBps(feeRateHundredths);
  const formatted = Number.isInteger(bps) ? String(bps) : bps.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted} bps`;
}

export function priceFromSqrtPrice(
  sqrtPriceX64: bigint,
  decimalsA: number,
  decimalsB: number,
): number {
  if (sqrtPriceX64 === 0n) return 0;
  const Q64 = 2n ** 64n;
  const ratio = Number(sqrtPriceX64) / Number(Q64);
  const price = ratio * ratio;
  const decimalShift = 10 ** (decimalsA - decimalsB);
  return price * decimalShift;
}

export function tickToPrice(tickIndex: number, decimalsA: number, decimalsB: number): number {
  const price = Math.pow(1.0001, tickIndex);
  const decimalShift = 10 ** (decimalsA - decimalsB);
  return price * decimalShift;
}

export function rangeDistancePercent(
  currentTick: number,
  lowerTick: number,
  upperTick: number,
): { belowLowerPercent: number; aboveUpperPercent: number } {
  if (currentTick >= lowerTick && currentTick <= upperTick) {
    return { belowLowerPercent: 0, aboveUpperPercent: 0 };
  }
  const rangeWidth = upperTick - lowerTick;
  if (rangeWidth === 0) {
    return { belowLowerPercent: 0, aboveUpperPercent: 0 };
  }
  if (currentTick < lowerTick) {
    const belowLowerPercent = (Math.abs(currentTick - lowerTick) / rangeWidth) * 100;
    return { belowLowerPercent, aboveUpperPercent: 0 };
  }
  const aboveUpperPercent = (Math.abs(currentTick - upperTick) / rangeWidth) * 100;
  return { belowLowerPercent: 0, aboveUpperPercent };
}

export function tokenAmountToUsd(amount: bigint, decimals: number, usdPrice: number): number {
  if (amount === 0n || usdPrice === 0) return 0;

  const priceScale = 100_000_000; // 8 decimal places for usdPrice
  const scaledPrice = Math.round(usdPrice * priceScale);

  const product = amount * BigInt(scaledPrice);
  const divisor = 10n ** BigInt(decimals) * BigInt(priceScale);

  const resultWhole = product / divisor;
  const resultRem = product % divisor;

  const remStr = resultRem.toString().padStart(decimals + 8, '0');

  // Never convert a BigInt to Number — build a string and parseFloat only
  // at the final boundary. parseFloat may round for >15-digit integers,
  // but that is JS Number's limit and is acceptable for USD display.
  return parseFloat(`${resultWhole}.${remStr}`);
}

function calculateLiquidityAmountsForInterval(
  liquidity: bigint,
  sqrtPriceX64: bigint,
  tickLower: number,
  tickUpper: number,
): { amountA: bigint; amountB: bigint } {
  if (sqrtPriceX64 === 0n || liquidity === 0n) return { amountA: 0n, amountB: 0n };

  const sqrtPrice = Number(sqrtPriceX64) / 2 ** 64;
  const sqrtPriceLower = Math.pow(1.0001, tickLower / 2);
  const sqrtPriceUpper = Math.pow(1.0001, tickUpper / 2);
  const liquidityNumber = Number(liquidity);

  const rawAmountA =
    sqrtPrice <= sqrtPriceLower
      ? liquidityNumber * (1 / sqrtPriceLower - 1 / sqrtPriceUpper)
      : sqrtPrice < sqrtPriceUpper
        ? liquidityNumber * (1 / sqrtPrice - 1 / sqrtPriceUpper)
        : 0;
  const rawAmountB =
    sqrtPrice >= sqrtPriceUpper
      ? liquidityNumber * (sqrtPriceUpper - sqrtPriceLower)
      : sqrtPrice > sqrtPriceLower
        ? liquidityNumber * (sqrtPrice - sqrtPriceLower)
        : 0;

  return {
    amountA: BigInt(Math.max(0, Math.floor(rawAmountA))),
    amountB: BigInt(Math.max(0, Math.floor(rawAmountB))),
  };
}

export function calculatePositionAmounts(
  liquidity: bigint,
  sqrtPriceX64: bigint,
  tickLower: number,
  tickUpper: number,
): { amountA: bigint; amountB: bigint } {
  return calculateLiquidityAmountsForInterval(liquidity, sqrtPriceX64, tickLower, tickUpper);
}

export function calculateInRangeReserves(
  liquidity: bigint,
  sqrtPriceX64: bigint,
  tickCurrentIndex: number,
  tickSpacing: number,
): { amountA: bigint; amountB: bigint } {
  const tickLower = Math.floor(tickCurrentIndex / tickSpacing) * tickSpacing;
  const tickUpper = tickLower + tickSpacing;
  return calculateLiquidityAmountsForInterval(liquidity, sqrtPriceX64, tickLower, tickUpper);
}
