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

const schemaId = (schema as { $id: string }).$id;
ajv.addSchema(schema);

const validateInsight = ajv.compile({ $ref: `${schemaId}#/$defs/PolicyInsightRead` });
const validateHistory = ajv.compile({ $ref: `${schemaId}#/$defs/PolicyInsightHistoryResponse` });

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('PolicyInsight contract validation', () => {
  it('accepts the vendored canonical PolicyInsight fixture with the vendored schema', () => {
    const pairValid = validateInsight(deepClone(currentPairFixture));
    expect(pairValid, `Validation failed: ${JSON.stringify(validateInsight.errors, null, 2)}`).toBe(
      true,
    );

    const positionValid = validateInsight(deepClone(currentPositionFixture));
    expect(
      positionValid,
      `Validation failed: ${JSON.stringify(validateInsight.errors, null, 2)}`,
    ).toBe(true);

    const historyValid = validateHistory(deepClone(historyFixture));
    expect(
      historyValid,
      `Validation failed: ${JSON.stringify(validateHistory.errors, null, 2)}`,
    ).toBe(true);
  });

  it('does not mutate the canonical PolicyInsight fixture during validation', () => {
    const pairTarget = deepClone(currentPairFixture);
    validateInsight(pairTarget);
    expect(pairTarget).toEqual(currentPairFixture);

    const positionTarget = deepClone(currentPositionFixture);
    validateInsight(positionTarget);
    expect(positionTarget).toEqual(currentPositionFixture);

    const historyTarget = deepClone(historyFixture);
    validateHistory(historyTarget);
    expect(historyTarget).toEqual(historyFixture);
  });
});
