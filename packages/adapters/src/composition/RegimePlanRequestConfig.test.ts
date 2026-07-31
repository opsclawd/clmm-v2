import { describe, it, expect } from 'vitest';
import { resolveRegimePlanRequestConfig } from './RegimePlanRequestConfig.js';
import inRangeFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json';

describe('resolveRegimePlanRequestConfig', () => {
  const validConfig = inRangeFixture.config;

  it('returns missing when config JSON is undefined, empty, or whitespace', () => {
    expect(resolveRegimePlanRequestConfig(undefined)).toEqual({ kind: 'missing' });
    expect(resolveRegimePlanRequestConfig(null)).toEqual({ kind: 'missing' });
    expect(resolveRegimePlanRequestConfig('')).toEqual({ kind: 'missing' });
    expect(resolveRegimePlanRequestConfig('   ')).toEqual({ kind: 'missing' });
  });

  it('returns invalid on malformed JSON', () => {
    const result = resolveRegimePlanRequestConfig('{ not json }');
    expect(result.kind).toBe('invalid');
  });

  it('returns invalid on JSON that fails schema validation', () => {
    const invalidConfig = { ...validConfig, regime: { confirmBars: 0 } };
    const result = resolveRegimePlanRequestConfig(JSON.stringify(invalidConfig));
    expect(result.kind).toBe('invalid');
  });

  it('returns configured with parsed config on valid JSON', () => {
    const result = resolveRegimePlanRequestConfig(JSON.stringify(validConfig));
    expect(result).toEqual({
      kind: 'configured',
      config: validConfig,
    });
  });
});
