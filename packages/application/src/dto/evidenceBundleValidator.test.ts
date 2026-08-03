import { describe, expect, it } from 'vitest';
import contextualFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import deterministicOnlyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };
import { parseEvidenceBundle } from './evidenceBundleValidator.js';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('parseEvidenceBundle', () => {
  it('returns canonical valid current fixture by identity', () => {
    const parsedContextual = parseEvidenceBundle(contextualFixture);
    expect(parsedContextual).toBe(contextualFixture);

    const parsedDeterministic = parseEvidenceBundle(deterministicOnlyFixture);
    expect(parsedDeterministic).toBe(deterministicOnlyFixture);
  });

  it('returns null when a required field is removed', () => {
    const invalid = deepClone(contextualFixture) as Record<string, unknown>;
    delete invalid['schemaVersion'];
    expect(parseEvidenceBundle(invalid)).toBeNull();

    const invalidRunId = deepClone(contextualFixture) as Record<string, unknown>;
    delete invalidRunId['runId'];
    expect(parseEvidenceBundle(invalidRunId)).toBeNull();
  });

  it('returns null for coercible wrong types', () => {
    const invalid = deepClone(contextualFixture) as Record<string, unknown>;
    invalid['createdAt'] = 1700000000000; // number instead of ISO string
    expect(parseEvidenceBundle(invalid)).toBeNull();

    const invalidConfidence = deepClone(contextualFixture) as Record<string, unknown>;
    (invalidConfidence['assessment'] as Record<string, unknown>)['overallConfidenceBps'] = '9000'; // string instead of number
    expect(parseEvidenceBundle(invalidConfidence)).toBeNull();
  });

  it('returns null when a forbidden extra field is present', () => {
    const invalid = deepClone(contextualFixture) as Record<string, unknown>;
    invalid['extraForbiddenField'] = 'unexpected';
    expect(parseEvidenceBundle(invalid)).toBeNull();
  });

  it('returns null for malformed confidence bounds', () => {
    const invalidHigh = deepClone(contextualFixture) as Record<string, unknown>;
    (invalidHigh['assessment'] as Record<string, unknown>)['overallConfidenceBps'] = 10001; // > 10000
    expect(parseEvidenceBundle(invalidHigh)).toBeNull();

    const invalidLow = deepClone(contextualFixture) as Record<string, unknown>;
    (invalidLow['assessment'] as Record<string, unknown>)['overallConfidenceBps'] = -1; // < 0
    expect(parseEvidenceBundle(invalidLow)).toBeNull();
  });

  it('returns null for malformed timestamp and freshness formats', () => {
    const invalidFormat = deepClone(contextualFixture) as Record<string, unknown>;
    invalidFormat['createdAt'] = '2026-05-07T12:00:00Z'; // missing milliseconds
    expect(parseEvidenceBundle(invalidFormat)).toBeNull();

    const invalidTimezone = deepClone(contextualFixture) as Record<string, unknown>;
    invalidTimezone['asOf'] = '2026-05-07T12:00:00.000+00:00'; // not ending in Z
    expect(parseEvidenceBundle(invalidTimezone)).toBeNull();
  });

  it('returns null when any required family is missing from contextual evidence', () => {
    for (const family of [
      'supportResistance',
      'flows',
      'derivatives',
      'events',
      'newsRegulatory',
    ]) {
      const invalid = deepClone(contextualFixture) as Record<string, unknown>;
      const ctx = { ...(invalid['contextualEvidence'] as Record<string, unknown>) };
      delete ctx[family];
      invalid['contextualEvidence'] = ctx;
      expect(parseEvidenceBundle(invalid)).toBeNull();
    }
  });

  it('returns null for null or non-object inputs', () => {
    expect(parseEvidenceBundle(null)).toBeNull();
    expect(parseEvidenceBundle(undefined)).toBeNull();
    expect(parseEvidenceBundle('invalid')).toBeNull();
    expect(parseEvidenceBundle(123)).toBeNull();
    expect(parseEvidenceBundle([])).toBeNull();
  });
});
