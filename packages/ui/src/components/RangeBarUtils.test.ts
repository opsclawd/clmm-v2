import { describe, expect, it } from 'vitest';
import { buildRangeBarDisplayState } from './RangeBarUtils.js';
import type { RangeBarUnavailableReason } from './RangeBarUtils.js';

describe('RangeBarUtils', () => {
  describe('returns field-specific non-finite reasons in validation order', () => {
    const testCases: Array<{
      name: string;
      input: { currentPrice: number; lowerBoundPrice: number; upperBoundPrice: number };
      expectedReason: RangeBarUnavailableReason;
    }> = [
      // NaN cases
      {
        name: 'NaN currentPrice',
        input: { currentPrice: NaN, lowerBoundPrice: 100, upperBoundPrice: 200 },
        expectedReason: 'current_price_non_finite',
      },
      {
        name: 'NaN lowerBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: NaN, upperBoundPrice: 200 },
        expectedReason: 'lower_price_non_finite',
      },
      {
        name: 'NaN upperBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: NaN },
        expectedReason: 'upper_price_non_finite',
      },
      // Positive infinity cases
      {
        name: '+Infinity currentPrice',
        input: { currentPrice: Infinity, lowerBoundPrice: 100, upperBoundPrice: 200 },
        expectedReason: 'current_price_non_finite',
      },
      {
        name: '+Infinity lowerBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: Infinity, upperBoundPrice: 200 },
        expectedReason: 'lower_price_non_finite',
      },
      {
        name: '+Infinity upperBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: Infinity },
        expectedReason: 'upper_price_non_finite',
      },
      // Negative infinity cases
      {
        name: '-Infinity currentPrice',
        input: { currentPrice: -Infinity, lowerBoundPrice: 100, upperBoundPrice: 200 },
        expectedReason: 'current_price_non_finite',
      },
      {
        name: '-Infinity lowerBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: -Infinity, upperBoundPrice: 200 },
        expectedReason: 'lower_price_non_finite',
      },
      {
        name: '-Infinity upperBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: -Infinity },
        expectedReason: 'upper_price_non_finite',
      },
    ];

    testCases.forEach(({ name, input, expectedReason }) => {
      it(name, () => {
        expect(buildRangeBarDisplayState(input)).toEqual({
          kind: 'unavailable',
          reason: expectedReason,
        });
      });
    });
  });

  describe('rejects zero and negative required prices', () => {
    const testCases: Array<{
      name: string;
      input: { currentPrice: number; lowerBoundPrice: number; upperBoundPrice: number };
      expectedReason: RangeBarUnavailableReason;
    }> = [
      {
        name: 'zero currentPrice',
        input: { currentPrice: 0, lowerBoundPrice: 100, upperBoundPrice: 200 },
        expectedReason: 'current_price_non_positive',
      },
      {
        name: 'negative currentPrice',
        input: { currentPrice: -50, lowerBoundPrice: 100, upperBoundPrice: 200 },
        expectedReason: 'current_price_non_positive',
      },
      {
        name: 'zero lowerBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: 0, upperBoundPrice: 200 },
        expectedReason: 'lower_price_non_positive',
      },
      {
        name: 'negative lowerBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: -50, upperBoundPrice: 200 },
        expectedReason: 'lower_price_non_positive',
      },
      {
        name: 'zero upperBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: 0 },
        expectedReason: 'upper_price_non_positive',
      },
      {
        name: 'negative upperBoundPrice',
        input: { currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: -50 },
        expectedReason: 'upper_price_non_positive',
      },
    ];

    testCases.forEach(({ name, input, expectedReason }) => {
      it(name, () => {
        expect(buildRangeBarDisplayState(input)).toEqual({
          kind: 'unavailable',
          reason: expectedReason,
        });
      });
    });
  });

  describe('rejects equal and inverted bounds', () => {
    const testCases: Array<{
      name: string;
      input: { currentPrice: number; lowerBoundPrice: number; upperBoundPrice: number };
    }> = [
      {
        name: 'equal bounds',
        input: { currentPrice: 150, lowerBoundPrice: 100, upperBoundPrice: 100 },
      },
      {
        name: 'inverted bounds (lower > upper)',
        input: { currentPrice: 150, lowerBoundPrice: 200, upperBoundPrice: 100 },
      },
    ];

    testCases.forEach(({ name, input }) => {
      it(name, () => {
        expect(buildRangeBarDisplayState(input)).toEqual({
          kind: 'unavailable',
          reason: 'bounds_not_ascending',
        });
      });
    });
  });

  describe('fails closed when finite inputs overflow the visual domain', () => {
    it('derives percentage non-finite when width overflows', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: Number.MAX_VALUE,
        lowerBoundPrice: 1,
        upperBoundPrice: Number.MAX_VALUE,
      });
      expect(result).toEqual({ kind: 'unavailable', reason: 'derived_percentage_non_finite' });
    });

    it('derives percentage non-finite when padding produces non-finite lo/hi', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 1e308,
        lowerBoundPrice: 1e308 - 1,
        upperBoundPrice: Number.MAX_VALUE,
      });
      expect(result).toEqual({ kind: 'unavailable', reason: 'derived_percentage_non_finite' });
    });

    it('derives percentage non-finite when hi <= lo after padding', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 1,
        lowerBoundPrice: 1,
        upperBoundPrice: 1,
      });
      expect(result).toEqual({ kind: 'unavailable', reason: 'bounds_not_ascending' });
    });

    it('returns unavailable with derived_percentage_non_finite when hi overflows', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: Number.MAX_VALUE,
        lowerBoundPrice: 1,
        upperBoundPrice: Number.MAX_VALUE,
      });
      expect(result).toEqual({ kind: 'unavailable', reason: 'derived_percentage_non_finite' });
    });
  });

  describe('keeps valid lower midpoint upper and out-of-domain prices available', () => {
    it('returns available for price below the band (far-below)', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 50,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBeLessThan(result.bandLeftPercent);
      }
    });

    it('returns available for price at lower bound (lower)', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 100,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBeCloseTo(result.bandLeftPercent, 5);
      }
    });

    it('returns available for price at midpoint (midpoint)', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBeGreaterThan(result.bandLeftPercent);
        expect(result.markerPercent).toBeLessThan(result.bandRightPercent);
      }
    });

    it('returns available for price at upper bound (upper)', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 200,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBeCloseTo(result.bandRightPercent, 5);
      }
    });

    it('returns available for price above the band (far-above)', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 250,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBeGreaterThan(result.bandRightPercent);
      }
    });
  });

  describe('clamps only finite derived marker percentages', () => {
    it('clamps marker to 0 when current price is far below visual domain', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 1,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBe(0);
      }
    });

    it('clamps marker to 100 when current price is far above visual domain', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 1000,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBe(100);
      }
    });

    it('does not clamp when current price is within visual domain', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBeGreaterThan(0);
        expect(result.markerPercent).toBeLessThan(100);
      }
    });
  });

  describe('returns an available marker at exactly 50 percent for a genuine midpoint', () => {
    it('marker is exactly 50% when currentPrice is at visual-domain midpoint', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBe(50);
      }
    });

    it('marker is exactly 50% for different price range', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 550,
        lowerBoundPrice: 100,
        upperBoundPrice: 1000,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.markerPercent).toBe(50);
      }
    });
  });

  describe('available state shape', () => {
    it('returns correct shape for available state', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result.kind).toBe('available');
      if (result.kind === 'available') {
        expect(typeof result.bandLeftPercent).toBe('number');
        expect(typeof result.bandRightPercent).toBe('number');
        expect(typeof result.markerPercent).toBe('number');
      }
    });

    it('bandLeftPercent is less than markerPercent which is less than bandRightPercent', () => {
      const result = buildRangeBarDisplayState({
        currentPrice: 150,
        lowerBoundPrice: 100,
        upperBoundPrice: 200,
      });
      expect(result).toMatchObject({ kind: 'available' });
      if (result.kind === 'available') {
        expect(result.bandLeftPercent).toBeLessThan(result.markerPercent);
        expect(result.markerPercent).toBeLessThan(result.bandRightPercent);
      }
    });
  });
});
