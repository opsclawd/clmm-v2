import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import positionPlanSchema from '../../../../schemas/regime-engine/position-plan.v1/schema.json' with { type: 'json' };
import executionResultSchema from '../../../../schemas/regime-engine/execution-result.v1/schema.json' with { type: 'json' };
import planRequestSchema from '../../../../schemas/regime-engine/plan-request.v1/schema.json' with { type: 'json' };

import positionPlanProvenance from '../../../../schemas/regime-engine/position-plan.v1/provenance.json' with { type: 'json' };
import executionResultProvenance from '../../../../schemas/regime-engine/execution-result.v1/provenance.json' with { type: 'json' };
import planRequestProvenance from '../../../../schemas/regime-engine/plan-request.v1/provenance.json' with { type: 'json' };

import holdFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/hold.json' with { type: 'json' };
import requestExitFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/valid/request-exit.json' with { type: 'json' };
import unsupportedActionFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/invalid/unsupported-action.json' with { type: 'json' };
import missingExitIntentFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/invalid/missing-exit-intent.json' with { type: 'json' };
import inlineCandlesFixture from '../../../../schemas/regime-engine/position-plan.v1/fixtures/invalid/inline-candles-and-portfolio.json' with { type: 'json' };

import successFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/valid/success.json' with { type: 'json' };
import skippedFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/valid/skipped.json' with { type: 'json' };
import unsupportedStatusFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/invalid/unsupported-status.json' with { type: 'json' };
import extraFieldsFixture from '../../../../schemas/regime-engine/execution-result.v1/fixtures/invalid/extra-forbidden-fields.json' with { type: 'json' };

import inRangeFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/in-range.json' with { type: 'json' };
import breachQualifiedFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/valid/breach-qualified.json' with { type: 'json' };
import missingPortfolioFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-portfolio.json' with { type: 'json' };
import missingAutopilotStateFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-autopilot-state.json' with { type: 'json' };
import missingConfigFixture from '../../../../schemas/regime-engine/plan-request.v1/fixtures/invalid/missing-config.json' with { type: 'json' };

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addSchema(positionPlanSchema);
ajv.addSchema(executionResultSchema);
ajv.addSchema(planRequestSchema);

const validatePositionPlan = ajv.compile(positionPlanSchema);
const validateExecutionResult = ajv.compile(executionResultSchema);
const validatePlanRequest = ajv.compile(planRequestSchema);

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

  it('accepts every canonical plan-request valid fixture', () => {
    expect(validatePlanRequest(deepClone(inRangeFixture))).toBe(true);
    expect(validatePlanRequest(deepClone(breachQualifiedFixture))).toBe(true);
  });

  it('rejects every canonical plan-request invalid fixture', () => {
    expect(validatePlanRequest(deepClone(missingPortfolioFixture))).toBe(false);
    expect(validatePlanRequest(deepClone(missingAutopilotStateFixture))).toBe(false);
    expect(validatePlanRequest(deepClone(missingConfigFixture))).toBe(false);
  });

  it('pins regime plan-request, position-plan, and execution-result contracts to shared schemaVersion 1.0 at one upstream commit', () => {
    expect(planRequestSchema.properties.schemaVersion.const).toBe('1.0');
    expect(positionPlanSchema.properties.schemaVersion.const).toBe('1.0');
    expect(executionResultSchema.properties.schemaVersion.const).toBe('1.0');

    expect(planRequestProvenance.commit).toBeDefined();
    expect(planRequestProvenance.commit.length).toBeGreaterThan(0);
    expect(positionPlanProvenance.commit).toBe(planRequestProvenance.commit);
    expect(executionResultProvenance.commit).toBe(planRequestProvenance.commit);
  });

  it('verifies that all vendored asset sha256 checksums match provenance.json', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const crypto = await import('crypto');

    const provenances = [positionPlanProvenance, executionResultProvenance, planRequestProvenance];
    for (const prov of provenances) {
      for (const asset of prov.assets) {
        const filePath = path.resolve(__dirname, '../../../../', asset.localPath);
        const fileBytes = fs.readFileSync(filePath);
        const actualSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
        expect(actualSha256).toBe(asset.sha256);
      }
    }
  });
});
