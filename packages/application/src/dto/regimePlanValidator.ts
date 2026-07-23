import { Ajv2020 } from 'ajv/dist/2020.js';
import positionPlanSchema from '../../../../schemas/regime-engine/position-plan.v1/schema.json' with { type: 'json' };
import executionResultSchema from '../../../../schemas/regime-engine/execution-result.v1/schema.json' with { type: 'json' };
import type { RegimePlanResponse, RegimeExecutionResult } from './regimePlan.js';

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addSchema(positionPlanSchema);
ajv.addSchema(executionResultSchema);

const validatePlanResponse = ajv.compile<RegimePlanResponse>(positionPlanSchema);
const validateExecutionResult = ajv.compile<RegimeExecutionResult>(executionResultSchema);

export function parseRegimePlanResponse(value: unknown): RegimePlanResponse | null {
  if (!validatePlanResponse(value)) {
    return null;
  }
  if (value.expiresAtUnixMs < value.asOfUnixMs) {
    return null;
  }
  return value;
}

export function parseRegimeExecutionResult(value: unknown): RegimeExecutionResult | null {
  if (!validateExecutionResult(value)) {
    return null;
  }
  return value;
}
