import { tickToPrice } from '@clmm/domain';

export type PositionDisplayBoundsInput = {
  lowerTick: number;
  upperTick: number;
  decimalsA: number;
  decimalsB: number;
  displayQuoteSymbol: string;
};

export type PositionDisplayBounds = {
  lowerBoundPrice: number;
  upperBoundPrice: number;
  lowerBoundLabel: string;
  upperBoundLabel: string;
};

export function buildPositionDisplayBounds(
  input: PositionDisplayBoundsInput,
): PositionDisplayBounds {
  const lowerBoundPrice = tickToPrice(input.lowerTick, input.decimalsA, input.decimalsB);
  const upperBoundPrice = tickToPrice(input.upperTick, input.decimalsA, input.decimalsB);
  return {
    lowerBoundPrice,
    upperBoundPrice,
    lowerBoundLabel: `${input.displayQuoteSymbol} ${lowerBoundPrice.toFixed(2)}`,
    upperBoundLabel: `${input.displayQuoteSymbol} ${upperBoundPrice.toFixed(2)}`,
  };
}
