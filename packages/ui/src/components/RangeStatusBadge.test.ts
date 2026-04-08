import { describe, it, expect } from 'vitest';
import { getRangeStatusBadgeProps } from './RangeStatusBadgeUtils.js';

describe('RangeStatusBadge', () => {
  it('in-range returns green label', () => {
    const result = getRangeStatusBadgeProps('in-range');
    expect(result.label).toBe('In Range');
    expect(result.colorKey).toBe('primary');
  });

  it('below-range returns breach label', () => {
    const result = getRangeStatusBadgeProps('below-range');
    expect(result.label).toBe('Below Range');
    expect(result.colorKey).toBe('breach');
  });

  it('above-range returns breach label', () => {
    const result = getRangeStatusBadgeProps('above-range');
    expect(result.label).toBe('Above Range');
    expect(result.colorKey).toBe('breach');
  });
});
