import { Ajv2020 } from 'ajv/dist/2020.js';
import positionPlanSchema from '../../../../schemas/regime-engine/position-plan.v1/schema.json' with { type: 'json' };
import executionResultSchema from '../../../../schemas/regime-engine/execution-result.v1/schema.json' with { type: 'json' };
import planRequestSchema from '../../../../schemas/regime-engine/plan-request.v1/schema.json' with { type: 'json' };
import type { RegimePlanResponse, RegimeExecutionResult, RegimePlanRequest } from './regimePlan.js';

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addSchema(positionPlanSchema);
ajv.addSchema(executionResultSchema);
ajv.addSchema(planRequestSchema);

const validatePlanResponse = ajv.compile<RegimePlanResponse>(positionPlanSchema);
const validateExecutionResult = ajv.compile<RegimeExecutionResult>(executionResultSchema);
const validatePlanRequest = ajv.compile<RegimePlanRequest>(planRequestSchema);

function migrateSchemaVersion(value: unknown, legacyVersions: string[]): unknown {
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value) {
    const obj = value as Record<string, unknown>;
    const version = obj['schemaVersion'];
    if (typeof version === 'string' && legacyVersions.includes(version)) {
      return { ...obj, schemaVersion: '1.0' };
    }
  }
  return value;
}

export function parseRegimePlanResponse(value: unknown): RegimePlanResponse | null {
  const migrated = migrateSchemaVersion(value, ['position-plan.v1', 'v1']);
  if (!validatePlanResponse(migrated)) {
    return null;
  }
  if (migrated.expiresAtUnixMs < migrated.asOfUnixMs) {
    return null;
  }
  return migrated;
}

export function parseRegimeExecutionResult(value: unknown): RegimeExecutionResult | null {
  const migrated = migrateSchemaVersion(value, ['execution-result.v1', 'v1']);
  if (!validateExecutionResult(migrated)) {
    return null;
  }
  return migrated;
}

export function parseRegimePlanRequest(value: unknown): RegimePlanRequest | null {
  const migrated = migrateSchemaVersion(value, ['plan-request.v1', 'v1']);
  if (!validatePlanRequest(migrated)) {
    return null;
  }
  return migrated;
}
