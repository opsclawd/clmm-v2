import { describe, it, expect } from 'vitest';
import { isTransientPositionReadFailure } from './transient-errors.js';

describe('isTransientPositionReadFailure', () => {
  it.each([
    ['Solana RPC timeout', true],
    ['network error', true],
    ['fetch failed', true],
    ['socket hang up', true],
    ['ECONNREFUSED', true],
    ['SolanaError: HTTP error (429): Too Many Requests', true],
    ['rate limit exceeded', true],
    ['429 too many requests from upstream', true],
    ['Database constraint violation', false],
    ['Invariant: unknown pool type', false],
    ['null reference in mapper', false],
  ])('classifies "%s" as transient=%s', (message, expected) => {
    expect(isTransientPositionReadFailure(new Error(message))).toBe(expected);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientPositionReadFailure('just a string')).toBe(false);
    expect(isTransientPositionReadFailure(null)).toBe(false);
    expect(isTransientPositionReadFailure(undefined)).toBe(false);
    expect(isTransientPositionReadFailure(42)).toBe(false);
  });
});
