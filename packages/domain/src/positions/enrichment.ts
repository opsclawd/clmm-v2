export function whirlpoolFeeRateToBps(feeRateHundredths: number): number {
  return feeRateHundredths / 100;
}

export function formatFeeRateLabel(feeRateHundredths: number): string {
  const bps = whirlpoolFeeRateToBps(feeRateHundredths);
  const formatted = Number.isInteger(bps)
    ? String(bps)
    : bps.toFixed(2).replace(/\.?0+$/, '');
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

export function tickToPrice(
  tickIndex: number,
  decimalsA: number,
  decimalsB: number,
): number {
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
  if (currentTick < lowerTick) {
    const belowLowerPercent = (Math.abs(currentTick - lowerTick) / rangeWidth) * 100;
    return { belowLowerPercent, aboveUpperPercent: 0 };
  }
  const aboveUpperPercent = (Math.abs(currentTick - upperTick) / rangeWidth) * 100;
  return { belowLowerPercent: 0, aboveUpperPercent };
}

export function tokenAmountToUsd(
  amount: bigint,
  decimals: number,
  usdPrice: number,
): number {
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