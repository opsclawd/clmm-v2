import { describe, expect, it } from 'vitest';
import {
  formatPoolId,
  getBreachSide,
  getMonitoringDisplay,
  getStatusChipProps,
  getStatusDiagnosticCode,
  isNearEdge,
  parsePairGlyphLabel,
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

describe('parsePairGlyphLabel', () => {
  it('returns a pair for exactly one slash and two non-empty compact symbols', () => {
    expect(parsePairGlyphLabel('SOL/USDC')).toEqual({ kind: 'pair', a: 'SOL', b: 'USDC' });
  });

  it('trims the full label and both symbols before returning a pair', () => {
    expect(parsePairGlyphLabel('  SOL  /  USDC  ')).toEqual({
      kind: 'pair',
      a: 'SOL',
      b: 'USDC',
    });
  });

  it('returns the trimmed original as a single glyph when no slash exists', () => {
    expect(parsePairGlyphLabel('  BONK  ')).toEqual({ kind: 'single', symbol: 'BONK' });
  });

  it('does not guess that a hyphen is a pair separator', () => {
    expect(parsePairGlyphLabel('SOL-USDC')).toEqual({ kind: 'single', symbol: 'SOL-USDC' });
  });

  it.each(['', '   '])(
    'returns the unknown single glyph for empty and whitespace-only labels: %j',
    (label) => {
      expect(parsePairGlyphLabel(label)).toEqual({ kind: 'single', symbol: '?' });
    },
  );

  it.each(['SOL/', '/USDC', '  /  '])(
    'returns the unknown single glyph when either slash-delimited segment is empty: %s',
    (label) => {
      expect(parsePairGlyphLabel(label)).toEqual({ kind: 'single', symbol: '?' });
    },
  );

  it.each(['SOL//USDC', 'SOL/USDC/ETH'])(
    'returns the unknown single glyph for repeated or extra slash separators: %s',
    (label) => {
      expect(parsePairGlyphLabel(label)).toEqual({ kind: 'single', symbol: '?' });
    },
  );

  it.each(['SOL/', '/USDC', 'SOL//USDC', 'SOL/USDC/ETH'])(
    'never returns a pair containing an empty symbol: %s',
    (label) => {
      expect(parsePairGlyphLabel(label).kind).toBe('single');
    },
  );
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

  it.each([
    ['below-range', true, false, 'Breach · below', 'breach'],
    ['above-range', true, false, 'Breach · above', 'breach'],
    ['in-range', true, false, 'Action needed', 'warn'],
    ['in-range', true, true, 'Action needed', 'warn'],
    ['below-range', false, true, 'Below range', 'warn'],
    ['above-range', false, true, 'Above range', 'warn'],
    ['in-range', false, true, 'Near edge', 'warn'],
    ['in-range', false, false, 'In range', 'safe'],
  ] as const)(
    'maps %s alert=%s nearEdge=%s to %s',
    (rangeStatusKind, hasAlert, nearEdge, label, tone) => {
      expect(getStatusChipProps({ rangeStatusKind, hasAlert, nearEdge })).toEqual({ label, tone });
    },
  );
});

describe('getStatusDiagnosticCode', () => {
  it('classifies only hasAlert + in-range as position_alert_in_range', () => {
    expect(
      getStatusDiagnosticCode({ rangeStatusKind: 'in-range', hasAlert: true, nearEdge: true }),
    ).toBe('position_alert_in_range');
    expect(
      getStatusDiagnosticCode({ rangeStatusKind: 'below-range', hasAlert: true, nearEdge: false }),
    ).toBeUndefined();
    expect(
      getStatusDiagnosticCode({ rangeStatusKind: 'in-range', hasAlert: false, nearEdge: true }),
    ).toBeUndefined();
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
