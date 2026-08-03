import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../../../../schemas/regime-engine/evidence-bundle.v1/schema.json' with { type: 'json' };
import type { EvidenceBundle } from './evidence.js';

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addKeyword('finite');

const validateEvidenceBundle = ajv.compile<EvidenceBundle>(schema);

export function parseEvidenceBundle(value: unknown): EvidenceBundle | null {
  if (validateEvidenceBundle(value)) {
    return value;
  }
  return null;
}
