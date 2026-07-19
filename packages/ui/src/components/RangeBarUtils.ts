export type RangeBarUnavailableReason =
  | 'current_price_non_finite'
  | 'lower_price_non_finite'
  | 'upper_price_non_finite'
  | 'current_price_non_positive'
  | 'lower_price_non_positive'
  | 'upper_price_non_positive'
  | 'bounds_not_ascending'
  | 'derived_percentage_non_finite';

export type RangeBarDisplayState =
  | {
      kind: 'available';
      bandLeftPercent: number;
      bandRightPercent: number;
      markerPercent: number;
    }
  | { kind: 'unavailable'; reason: RangeBarUnavailableReason };

export type RangeBarPriceInput = {
  currentPrice: number;
  lowerBoundPrice: number;
  upperBoundPrice: number;
};

const VISUAL_PAD_FRACTION = 0.35;

function finitePercent(price: number, lo: number, hi: number): number | undefined {
  const value = ((price - lo) / (hi - lo)) * 100;
  if (!Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

export function buildRangeBarDisplayState(input: RangeBarPriceInput): RangeBarDisplayState {
  const { currentPrice, lowerBoundPrice, upperBoundPrice } = input;
  if (!Number.isFinite(currentPrice))
    return { kind: 'unavailable', reason: 'current_price_non_finite' };
  if (!Number.isFinite(lowerBoundPrice))
    return { kind: 'unavailable', reason: 'lower_price_non_finite' };
  if (!Number.isFinite(upperBoundPrice))
    return { kind: 'unavailable', reason: 'upper_price_non_finite' };
  if (currentPrice <= 0) return { kind: 'unavailable', reason: 'current_price_non_positive' };
  if (lowerBoundPrice <= 0) return { kind: 'unavailable', reason: 'lower_price_non_positive' };
  if (upperBoundPrice <= 0) return { kind: 'unavailable', reason: 'upper_price_non_positive' };
  if (upperBoundPrice <= lowerBoundPrice)
    return { kind: 'unavailable', reason: 'bounds_not_ascending' };

  const width = upperBoundPrice - lowerBoundPrice;
  const pad = width * VISUAL_PAD_FRACTION;
  const lo = lowerBoundPrice - pad;
  const hi = upperBoundPrice + pad;
  if (![width, pad, lo, hi].every(Number.isFinite) || hi <= lo) {
    return { kind: 'unavailable', reason: 'derived_percentage_non_finite' };
  }
  const bandLeftPercent = finitePercent(lowerBoundPrice, lo, hi);
  const bandRightPercent = finitePercent(upperBoundPrice, lo, hi);
  const markerPercent = finitePercent(currentPrice, lo, hi);
  if (bandLeftPercent == null || bandRightPercent == null || markerPercent == null) {
    return { kind: 'unavailable', reason: 'derived_percentage_non_finite' };
  }
  return { kind: 'available', bandLeftPercent, bandRightPercent, markerPercent };
}
