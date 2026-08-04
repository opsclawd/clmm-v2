import { describe, it, expect } from 'vitest';
import {
  SOL_USDC_SUPPORTED_POOL_ID,
  SUPPORTED_POOL_IDS,
  isSupportedPool,
} from './supportedPools.js';

describe('supportedPools domain logic', () => {
  it('identifies the canonical SOL-USDC pool as supported', () => {
    expect(isSupportedPool(SOL_USDC_SUPPORTED_POOL_ID)).toBe(true);
    expect(SUPPORTED_POOL_IDS).toContain(SOL_USDC_SUPPORTED_POOL_ID);
  });

  it('rejects unsupported pool IDs', () => {
    expect(isSupportedPool('unknown-pool-id')).toBe(false);
    expect(isSupportedPool('')).toBe(false);
  });
});
