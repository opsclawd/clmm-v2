import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../../../schemas/regime-engine/policy-insight.v1/schema.json' with { type: 'json' };
import type { PolicyInsightBlock } from './policyInsights.js';

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

const schemaId = schema.$id;
ajv.addSchema(schema);

const validatePolicyInsight = ajv.compile<PolicyInsightBlock>({
  $ref: `${schemaId}#/$defs/PolicyInsightRead`,
});

export function parsePolicyInsightBlock(value: unknown): PolicyInsightBlock | null {
  if (validatePolicyInsight(value)) {
    return value;
  }
  return null;
}
