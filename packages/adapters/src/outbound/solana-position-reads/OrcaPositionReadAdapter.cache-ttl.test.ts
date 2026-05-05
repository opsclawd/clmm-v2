import { describe, it, expect } from 'vitest';
import { parsePoolDataCacheTtlMs } from './OrcaPositionReadAdapter.js';

describe('parsePoolDataCacheTtlMs', () => {
  it('defaults to 30_000 when undefined', () => {
    expect(parsePoolDataCacheTtlMs(undefined)).toBe(30_000);
  });

  it('defaults to 30_000 on empty string', () => {
    expect(parsePoolDataCacheTtlMs('')).toBe(30_000);
  });

  it('returns the parsed integer for a positive number', () => {
    expect(parsePoolDataCacheTtlMs('60000')).toBe(60_000);
  });

  it('floors fractional milliseconds', () => {
    expect(parsePoolDataCacheTtlMs('1500.9')).toBe(1500);
  });

  it('falls back to default for zero', () => {
    expect(parsePoolDataCacheTtlMs('0')).toBe(30_000);
  });

  it('falls back to default for negative numbers', () => {
    expect(parsePoolDataCacheTtlMs('-500')).toBe(30_000);
  });

  it('falls back to default for non-numeric strings', () => {
    expect(parsePoolDataCacheTtlMs('abc')).toBe(30_000);
  });

  it('falls back to default for NaN inputs', () => {
    expect(parsePoolDataCacheTtlMs('NaN')).toBe(30_000);
  });
});
