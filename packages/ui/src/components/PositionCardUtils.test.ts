import { describe, expect, it } from 'vitest';
import {
  formatPoolId,
  getBreachSide,
  getCardPlaceholderMetrics,
  getMonitoringDisplay,
  getStatusChipProps,
  isNearEdge,
  splitTokenPair,
} from './PositionCardUtils.js';

describe('splitTokenPair', () => {
  it('returns both symbols for a well-formed "A / B" label', () => {
    expect(splitTokenPair('SOL / USDC')).toEqual({ a: 'SOL', b: 'USDC' });
  });

  it('trims whitespace around symbols', () => {
    expect(splitTokenPair('  SOL  /  USDC ')).toEqual({ a: 'SOL', b: 'USDC' });
  });

  it('returns the whole label as `a` and empty `b` when no separator present', () => {
    expect(splitTokenPair('SOL-USDC')).toEqual({ a: 'SOL-USDC', b: '' });
  });

  it('returns empty pair for empty string', () => {
    expect(splitTokenPair('')).toEqual({ a: '', b: '' });
  });
});

describe('formatPoolId', () => {
  it('returns first-4 + ellipsis + last-4 for long IDs', () => {
    expect(formatPoolId('CzfqAaBbCcDdEeFfGgHh1234kkkk44zE')).toBe('Czfq…44zE');
  });

  it('returns the original string unchanged when it is already short enough', () => {
    expect(formatPoolId('Czfq44zE')).toBe('Czfq44zE');
  });

  it('returns an empty string for empty input', () => {
    expect(formatPoolId('')).toBe('');
  });

  it('returns the original string for non-string-like falsy input gracefully', () => {
    expect(formatPoolId(undefined)).toBe('');
  });
});

describe('isNearEdge', () => {
  it('returns true when current price is within 10% of the lower bound', () => {
    expect(isNearEdge({ currentPrice: 105, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns true when current price is within 10% of the upper bound', () => {
    expect(isNearEdge({ currentPrice: 195, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns true exactly at the 10% boundary on the lower side', () => {
    expect(isNearEdge({ currentPrice: 110, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns true exactly at the 10% boundary on the upper side', () => {
    expect(isNearEdge({ currentPrice: 190, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      true,
    );
  });

  it('returns false when comfortably in the middle of the range', () => {
    expect(isNearEdge({ currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      false,
    );
  });

  it('returns false when the range width is zero', () => {
    expect(isNearEdge({ currentPrice: 100, lowerBoundPrice: 100, upperBoundPrice: 100 })).toBe(
      false,
    );
  });

  it('returns false when the range width is negative (inverted bounds)', () => {
    expect(isNearEdge({ currentPrice: 150, lowerBoundPrice: 200, upperBoundPrice: 100 })).toBe(
      false,
    );
  });

  it('returns false when any input is non-finite', () => {
    expect(
      isNearEdge({ currentPrice: Number.NaN, lowerBoundPrice: 100, upperBoundPrice: 200 }),
    ).toBe(false);
    expect(
      isNearEdge({
        currentPrice: 150,
        lowerBoundPrice: Number.POSITIVE_INFINITY,
        upperBoundPrice: 200,
      }),
    ).toBe(false);
    expect(
      isNearEdge({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: Number.NEGATIVE_INFINITY,
      }),
    ).toBe(false);
  });

  it('returns false when current price is below the lower bound', () => {
    expect(isNearEdge({ currentPrice: 50, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      false,
    );
  });

  it('returns false when current price is above the upper bound', () => {
    expect(isNearEdge({ currentPrice: 250, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      false,
    );
  });

  it('returns false just outside the 10% threshold on the lower side', () => {
    expect(isNearEdge({ currentPrice: 111, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      false,
    );
  });

  it('returns false just outside the 10% threshold on the upper side', () => {
    expect(isNearEdge({ currentPrice: 189, lowerBoundPrice: 100, upperBoundPrice: 200 })).toBe(
      false,
    );
  });
});

describe('getStatusChipProps', () => {
  it('returns breach · below for hasAlert + below-range', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: false }),
    ).toEqual({ tone: 'breach', label: 'Breach · below' });
  });

  it('returns breach · above for hasAlert + above-range', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'above-range', hasAlert: true, nearEdge: false }),
    ).toEqual({ tone: 'breach', label: 'Breach · above' });
  });

  it('returns Near edge for in-range positions near a bound', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: true }),
    ).toEqual({ tone: 'warn', label: 'Near edge' });
  });

  it('returns In range for in-range positions not near any bound', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: false }),
    ).toEqual({ tone: 'safe', label: 'In range' });
  });

  it('returns Below range when below-range without alert (no Near edge)', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'below-range', hasAlert: false, nearEdge: true }),
    ).toEqual({ tone: 'warn', label: 'Below range' });
  });

  it('returns Above range when above-range without alert (no Near edge)', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'above-range', hasAlert: false, nearEdge: true }),
    ).toEqual({ tone: 'warn', label: 'Above range' });
  });

  it('prefers breach over near-edge when an alert is present on an out-of-range position', () => {
    expect(
      getStatusChipProps({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: true }),
    ).toEqual({ tone: 'breach', label: 'Breach · below' });
  });
});

describe('getMonitoringDisplay', () => {
  it('maps active to Live with the safe tone', () => {
    const r = getMonitoringDisplay('active');
    expect(r.text).toBe('Live');
    expect(r.tone).toBe('safe');
  });

  it('maps degraded to Degraded with the warn tone', () => {
    const r = getMonitoringDisplay('degraded');
    expect(r.text).toBe('Degraded');
    expect(r.tone).toBe('warn');
  });

  it('maps inactive to Inactive with the faint tone', () => {
    const r = getMonitoringDisplay('inactive');
    expect(r.text).toBe('Inactive');
    expect(r.tone).toBe('faint');
  });

  it('throws for an invalid monitoring status at runtime', () => {
    expect(() => getMonitoringDisplay('unknown' as never)).toThrow('Unexpected monitoringStatus');
  });
});

describe('getCardPlaceholderMetrics', () => {
  it('returns the same metrics for the same poolId on repeated calls (deterministic)', () => {
    const a = getCardPlaceholderMetrics('pool-1');
    const b = getCardPlaceholderMetrics('pool-1');
    expect(a).toEqual(b);
  });

  it('returns shapes that look like USD-formatted strings', () => {
    const r = getCardPlaceholderMetrics('any-pool-id');
    expect(r.tvlLabel).toMatch(/^\$/);
    expect(r.fees24hLabel).toMatch(/^\+\$/);
  });

  it('returns deterministic fallback labels for unknown pool ids', () => {
    const r = getCardPlaceholderMetrics('definitely-not-known-7e7e');
    expect(typeof r.tvlLabel).toBe('string');
    expect(typeof r.fees24hLabel).toBe('string');
    expect(r.tvlLabel.length).toBeGreaterThan(0);
    expect(r.fees24hLabel.length).toBeGreaterThan(0);
  });
});

describe('getBreachSide', () => {
  it('returns below when hasAlert and below-range', () => {
    expect(getBreachSide(true, 'below-range')).toBe('below');
  });

  it('returns above when hasAlert and above-range', () => {
    expect(getBreachSide(true, 'above-range')).toBe('above');
  });

  it('returns undefined when hasAlert but in-range', () => {
    expect(getBreachSide(true, 'in-range')).toBe(undefined);
  });

  it('returns undefined when no alert and below-range', () => {
    expect(getBreachSide(false, 'below-range')).toBe(undefined);
  });

  it('returns undefined when no alert and above-range', () => {
    expect(getBreachSide(false, 'above-range')).toBe(undefined);
  });
});
