import { describe, expect, it } from 'vitest';
import { resolveRegimeFeedConfig } from './RegimeFeedConfig.js';
import type { RegimePoolEntry } from './RegimeFeedConfig.js';

describe('resolveRegimeFeedConfig', () => {
  const entry: RegimePoolEntry = {
    symbol: 'SOL/USDC',
    source: 'mco',
    network: 'mainnet',
    poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    timeframe: '1h',
  };

  it('returns all 5 feed fields from a valid entry', () => {
    const result = resolveRegimeFeedConfig(entry);
    expect(result).toEqual({
      symbol: 'SOL/USDC',
      source: 'mco',
      network: 'mainnet',
      poolAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      timeframe: '1h',
    });
  });

  it('returns a new object (identity is not promised)', () => {
    const result = resolveRegimeFeedConfig(entry);
    expect(result).not.toBe(entry);
  });
});
