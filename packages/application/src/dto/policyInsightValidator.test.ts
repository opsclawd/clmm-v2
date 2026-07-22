import { describe, expect, it } from 'vitest';
import { parsePolicyInsightBlock } from './policyInsightValidator.js';
import canonicalCurrentPair from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import canonicalCurrentPosition from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('parsePolicyInsightBlock', () => {
  it('returns the canonical fixture unchanged', () => {
    const result = parsePolicyInsightBlock(canonicalCurrentPair);
    expect(result).toBe(canonicalCurrentPair);
  });

  it('returns null when a canonical required field is missing', () => {
    const clone = deepClone(canonicalCurrentPair);
    delete (clone as Record<string, unknown>)['schemaVersion'];
    const result = parsePolicyInsightBlock(clone);
    expect(result).toBeNull();
  });

  it('returns null for a coercible but incorrectly typed canonical field', () => {
    const clone = deepClone(canonicalCurrentPair);
    (clone as Record<string, unknown>)['confidenceBps'] = '7500';
    const result = parsePolicyInsightBlock(clone);
    expect(result).toBeNull();
  });

  it('returns null for a schema-forbidden additional property', () => {
    const clone = deepClone(canonicalCurrentPair);
    (clone as Record<string, unknown>)['legacyAlias'] = true;
    const result = parsePolicyInsightBlock(clone);
    expect(result).toBeNull();
  });

  it('returns null for the legacy freshness fallback shape', () => {
    const clone = deepClone(canonicalCurrentPair);
    (clone as Record<string, unknown>)['freshness'] = {
      capturedAtUnixMs: Date.now(),
      stale: false,
    };
    const result = parsePolicyInsightBlock(clone);
    expect(result).toBeNull();
  });

  it('accepts the canonical current-position fixture', () => {
    const result = parsePolicyInsightBlock(canonicalCurrentPosition);
    expect(result).toBe(canonicalCurrentPosition);
  });
});
