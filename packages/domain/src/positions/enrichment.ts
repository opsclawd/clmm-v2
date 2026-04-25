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
  if (amount === 0n) return 0;
  return (Number(amount) / 10 ** decimals) * usdPrice;
}