import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import * as schema from '../../../../schemas/regime-engine/policy-insight.v1/schema.json';
import currentPairFixture from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json';
import currentPositionFixture from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json';
import historyFixture from '../../../../schemas/regime-engine/policy-insight.v1/fixtures/valid/history.json';

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

const validate = ajv.compile(schema);

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('PolicyInsight contract validation', () => {
  describe('accepts the vendored canonical PolicyInsight fixture with the vendored schema', () => {
    it('validates current-pair.json fixture', () => {
      const valid = validate(deepClone(currentPairFixture));
      expect(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
    });

    it('validates current-position.json fixture', () => {
      const valid = validate(deepClone(currentPositionFixture));
      expect(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
    });

    it('validates history.json fixture', () => {
      const valid = validate(deepClone(historyFixture));
      expect(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`).toBe(true);
    });
  });

  describe('does not mutate the canonical PolicyInsight fixture during validation', () => {
    it('does not mutate current-pair.json fixture', () => {
      const target = deepClone(currentPairFixture);
      validate(target);
      expect(target).toEqual(currentPairFixture);
    });

    it('does not mutate current-position.json fixture', () => {
      const target = deepClone(currentPositionFixture);
      validate(target);
      expect(target).toEqual(currentPositionFixture);
    });

    it('does not mutate history.json fixture', () => {
      const target = deepClone(historyFixture);
      validate(target);
      expect(target).toEqual(historyFixture);
    });
  });
});
