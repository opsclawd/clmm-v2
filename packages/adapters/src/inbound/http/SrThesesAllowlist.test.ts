import { describe, expect, it } from 'vitest';
import { makePoolId } from '@clmm/domain';
import { SR_THESES_POOL_ALLOWLIST_MAP } from './AppModule.js';

const ORCA_SOL_USDC_004_WHIRLPOOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

describe('SR_THESES_POOL_ALLOWLIST_MAP production wiring', () => {
  it('has at least one pool entry so the v2 thesis path is active in production', () => {
    expect(SR_THESES_POOL_ALLOWLIST_MAP.size).toBeGreaterThan(0);
  });

  it('maps the Orca SOL/USDC 0.04% whirlpool to source "openclaw"', () => {
    const poolId = makePoolId(ORCA_SOL_USDC_004_WHIRLPOOL);
    const entry = SR_THESES_POOL_ALLOWLIST_MAP.get(poolId);
    expect(entry).toEqual({ symbol: 'SOL/USDC', source: 'openclaw' });
  });

  it('uses a valid Solana base58 public key as the allowlist key (32-44 chars, base58 alphabet)', () => {
    const base58 = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    for (const poolId of SR_THESES_POOL_ALLOWLIST_MAP.keys()) {
      expect(poolId.length).toBeGreaterThanOrEqual(32);
      expect(poolId.length).toBeLessThanOrEqual(44);
      expect(base58.test(poolId)).toBe(true);
    }
  });
});
