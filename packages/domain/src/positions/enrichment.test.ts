import { describe, it, expect } from 'vitest';
import {
  priceFromSqrtPrice,
  tickToPrice,
  rangeDistancePercent,
  tokenAmountToUsd,
} from './enrichment.js';

describe('priceFromSqrtPrice', () => {
  it('converts X64 sqrtPrice to human-readable price', () => {
    const sqrtPriceX64 = 18446744073709551616n;
    const result = priceFromSqrtPrice(sqrtPriceX64, 9, 6);
    expect(result).toBeCloseTo(1000, 0);
  });

  it('handles zero sqrtPrice', () => {
    expect(priceFromSqrtPrice(0n, 9, 6)).toBe(0);
  });

  it('respects decimal difference', () => {
    const sqrtPriceX64 = 18446744073709551616n;
    const result = priceFromSqrtPrice(sqrtPriceX64, 6, 9);
    expect(result).toBeCloseTo(0.001, 4);
  });

  it('handles equal decimals', () => {
    const sqrtPriceX64 = 18446744073709551616n;
    const result = priceFromSqrtPrice(sqrtPriceX64, 9, 9);
    expect(result).toBeCloseTo(1.0, 4);
  });

  it('computes price for a known SOL/USDC pool value', () => {
    const sqrtPriceX64 = 177213915804308478278367n;
    const result = priceFromSqrtPrice(sqrtPriceX64, 9, 6);
    expect(result).toBeGreaterThan(0);
  });
});

describe('tickToPrice', () => {
  it('converts tick 0 to price 1 adjusted by decimals', () => {
    expect(tickToPrice(0, 9, 6)).toBeCloseTo(1000, 0);
  });

  it('handles negative ticks', () => {
    const result = tickToPrice(-100, 9, 6);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1000);
  });

  it('handles equal decimals', () => {
    expect(tickToPrice(0, 9, 9)).toBeCloseTo(1.0, 4);
  });

  it('positive tick gives price above 1 (adjusted)', () => {
    const result = tickToPrice(100, 9, 6);
    expect(result).toBeGreaterThan(1000);
  });

  it('round-trips with priceFromSqrtPrice for same decimals', () => {
    const tickIndex = 1000;
    const sqrtPrice = Math.pow(1.0001, tickIndex / 2);
    const sqrtPriceX64 = BigInt(Math.floor(sqrtPrice * 2 ** 64));
    const fromTick = tickToPrice(tickIndex, 9, 9);
    const fromSqrt = priceFromSqrtPrice(sqrtPriceX64, 9, 9);
    expect(Math.abs(fromTick - fromSqrt) / fromTick).toBeLessThan(0.02);
  });
});

describe('rangeDistancePercent', () => {
  it('returns both zeros for in-range position', () => {
    const result = rangeDistancePercent(0, -1000, 1000);
    expect(result.belowLowerPercent).toBe(0);
    expect(result.aboveUpperPercent).toBe(0);
  });

  it('returns belowLowerPercent > 0 when current is below lower', () => {
    const result = rangeDistancePercent(-2000, -1000, 1000);
    expect(result.belowLowerPercent).toBeGreaterThan(0);
    expect(result.aboveUpperPercent).toBe(0);
  });

  it('returns aboveUpperPercent > 0 when current is above upper', () => {
    const result = rangeDistancePercent(2000, -1000, 1000);
    expect(result.belowLowerPercent).toBe(0);
    expect(result.aboveUpperPercent).toBeGreaterThan(0);
  });

  it('computes correct percentage distance below lower', () => {
    const result = rangeDistancePercent(-2000, -1000, 1000);
    expect(result.belowLowerPercent).toBeCloseTo(100, 4);
  });

  it('computes correct percentage distance above upper', () => {
    const result = rangeDistancePercent(2000, -1000, 1000);
    expect(result.aboveUpperPercent).toBeCloseTo(100, 4);
  });

  it('handles current equal to lower bound', () => {
    const result = rangeDistancePercent(-1000, -1000, 1000);
    expect(result.belowLowerPercent).toBe(0);
    expect(result.aboveUpperPercent).toBe(0);
  });

  it('handles current equal to upper bound', () => {
    const result = rangeDistancePercent(1000, -1000, 1000);
    expect(result.belowLowerPercent).toBe(0);
    expect(result.aboveUpperPercent).toBe(0);
  });
});

describe('tokenAmountToUsd', () => {
  it('converts raw token amount to USD', () => {
    const amount = 1000000000n;
    const result = tokenAmountToUsd(amount, 9, 150);
    expect(result).toBeCloseTo(150, 4);
  });

  it('handles zero amount', () => {
    expect(tokenAmountToUsd(0n, 9, 150)).toBe(0);
  });

  it('handles USDC with 6 decimals', () => {
    const amount = 5000000n;
    const result = tokenAmountToUsd(amount, 6, 1);
    expect(result).toBeCloseTo(5, 4);
  });

  it('handles zero price', () => {
    expect(tokenAmountToUsd(1000000000n, 9, 0)).toBe(0);
  });
});