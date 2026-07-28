import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../../../contracts/insight-bundle/v1/schema.json';
import validBundleFixture from '../../../../contracts/insight-bundle/v1/fixtures/valid/bundle.json';
import invalidBundleFixture from '../../../../contracts/insight-bundle/v1/fixtures/invalid/bad-data-quality.json';

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

const schemaId = (schema as { $id: string }).$id;
ajv.addSchema(schema);

const validateBundle = ajv.compile({ $ref: `${schemaId}#/$defs/InsightBundle` });

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('InsightBundle contract validation', () => {
  it('accepts the canonical valid InsightBundle fixture with the schema', () => {
    const valid = validateBundle(deepClone(validBundleFixture));
    expect(valid, `Validation failed: ${JSON.stringify(validateBundle.errors, null, 2)}`).toBe(
      true,
    );
  });

  it('rejects the invalid InsightBundle fixture with the schema', () => {
    const valid = validateBundle(deepClone(invalidBundleFixture));
    expect(valid).toBe(false);
    expect(validateBundle.errors).not.toBeNull();
  });
});
