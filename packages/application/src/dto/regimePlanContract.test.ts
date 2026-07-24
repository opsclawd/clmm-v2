import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import positionPlanSchema from '../../../../schemas/regime-engine/position-plan.v1/schema.json' with { type: 'json' };
import executionResultSchema from '../../../../schemas/regime-engine/execution-result.v1/schema.json' with { type: 'json' };

import holdFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/hold.json' with { type: 'json' };
import requestExitFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json' with { type: 'json' };
import unsupportedActionFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/invalid/unsupported-action.json' with { type: 'json' };
import missingExitIntentFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json' with { type: 'json' };
import inlineCandlesFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/invalid/inline-candles-and-portfolio.json' with { type: 'json' };

import successFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/valid/success.json' with { type: 'json' };
import skippedFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json' with { type: 'json' };
import unsupportedStatusFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/invalid/unsupported-status.json' with { type: 'json' };
import extraFieldsFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/invalid/extra-forbidden-fields.json' with { type: 'json' };

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addSchema(positionPlanSchema);
ajv.addSchema(executionResultSchema);

const validatePositionPlan = ajv.compile(positionPlanSchema);
const validateExecutionResult = ajv.compile(executionResultSchema);

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('Regime plan contract schema validation', () => {
  it('accepts every canonical position-plan valid fixture', () => {
    expect(validatePositionPlan(deepClone(holdFixture))).toBe(true);
    expect(validatePositionPlan(deepClone(requestExitFixture))).toBe(true);
  });

  it('rejects every canonical position-plan invalid fixture', () => {
    expect(validatePositionPlan(deepClone(unsupportedActionFixture))).toBe(false);
    expect(validatePositionPlan(deepClone(missingExitIntentFixture))).toBe(false);
    expect(validatePositionPlan(deepClone(inlineCandlesFixture))).toBe(false);
  });

  it('accepts every canonical execution-result valid fixture', () => {
    expect(validateExecutionResult(deepClone(successFixture))).toBe(true);
    expect(validateExecutionResult(deepClone(skippedFixture))).toBe(true);
  });

  it('rejects every canonical execution-result invalid fixture', () => {
    expect(validateExecutionResult(deepClone(unsupportedStatusFixture))).toBe(false);
    expect(validateExecutionResult(deepClone(extraFieldsFixture))).toBe(false);
  });
});
