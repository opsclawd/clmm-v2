import { describe, it, expect } from 'vitest';
import { buildPositionDisplayBounds } from './buildPositionDisplayBounds.js';
import { tickToPrice } from '@clmm/domain';

describe('buildPositionDisplayBounds', () => {
  it('returns price-space bounds and labels using token-B as the displayed quote symbol for SOL/USDC', () => {
    const result = buildPositionDisplayBounds({
      lowerTick: -10000,
      upperTick: 10000,
      decimalsA: 9,
      decimalsB: 6,
      displayQuoteSymbol: 'USDC',
    });

    const expectedLower = tickToPrice(-10000, 9, 6);
    const expectedUpper = tickToPrice(10000, 9, 6);
    expect(result.lowerBoundPrice).toBe(expectedLower);
    expect(result.upperBoundPrice).toBe(expectedUpper);
    expect(result.lowerBoundPrice).toBeGreaterThan(0);
    expect(result.upperBoundPrice).toBeGreaterThan(result.lowerBoundPrice);
    expect(result.lowerBoundLabel).toBe(`USDC ${expectedLower.toFixed(2)}`);
    expect(result.upperBoundLabel).toBe(`USDC ${expectedUpper.toFixed(2)}`);
  });

  it('preserves lowerTick < upperTick into lowerBoundPrice < upperBoundPrice for SOL/USDC orientation', () => {
    const result = buildPositionDisplayBounds({
      lowerTick: 100,
      upperTick: 200,
      decimalsA: 9,
      decimalsB: 6,
      displayQuoteSymbol: 'USDC',
    });

    expect(result.lowerBoundPrice).toBeLessThan(result.upperBoundPrice);
  });

  it('formats labels with the supplied display quote symbol', () => {
    const result = buildPositionDisplayBounds({
      lowerTick: 0,
      upperTick: 100,
      decimalsA: 9,
      decimalsB: 6,
      displayQuoteSymbol: 'USDC',
    });

    expect(result.lowerBoundLabel.startsWith('USDC ')).toBe(true);
    expect(result.upperBoundLabel.startsWith('USDC ')).toBe(true);
  });
});