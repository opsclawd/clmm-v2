import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';

import evidenceBundleSchema from '../../../../schemas/regime-engine/evidence-bundle.v1/schema.json' with { type: 'json' };
import evidenceBundleProvenance from '../../../../schemas/regime-engine/evidence-bundle.v1/provenance.json' with { type: 'json' };

import contextualValidFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };
import deterministicOnlyValidFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/deterministic-only.json' with { type: 'json' };

import malformedContextualFamilyFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid/malformed-contextual-family.json' with { type: 'json' };
import noncanonicalTimestampFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid/noncanonical-timestamp.json' with { type: 'json' };
import outOfRangeNumberFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid/out-of-range-number.json' with { type: 'json' };
import unknownFieldFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid/unknown-field.json' with { type: 'json' };
import unsupportedUnitFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid/unsupported-unit.json' with { type: 'json' };
import wrongSchemaVersionFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid/wrong-schema-version.json' with { type: 'json' };

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addKeyword('finite');

const validateEvidenceBundle = ajv.compile(evidenceBundleSchema);

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('Evidence bundle contract schema validation', () => {
  it('verifies every vendored evidence asset against pinned provenance', () => {
    expect(evidenceBundleProvenance.commit).toBe('a46581862ee4f2cd82cb68dbb66088a2af375a7c');
    expect(evidenceBundleProvenance.schemaPath).toBe(
      'contracts/evidence-bundle/v1/evidence-bundle.schema.json',
    );
    expect(evidenceBundleProvenance.schemaVersion).toBe('v1');
    expect(evidenceBundleProvenance.assets.length).toBeGreaterThan(0);

    for (const asset of evidenceBundleProvenance.assets) {
      const filePath = path.resolve(__dirname, '../../../../', asset.localPath);
      const fileBytes = fs.readFileSync(filePath);
      const actualSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
      expect(actualSha256, `Checksum mismatch for ${asset.localPath}`).toBe(asset.sha256);
    }
  });

  it('accepts every canonical valid evidence fixture without mutation', () => {
    const validFixtures = [
      { name: 'contextual', fixture: contextualValidFixture },
      { name: 'deterministic-only', fixture: deterministicOnlyValidFixture },
    ];

    for (const { name, fixture } of validFixtures) {
      const cloned = deepClone(fixture);
      const isValid = validateEvidenceBundle(cloned);
      expect(isValid, `Fixture ${name} should pass validation`).toBe(true);
      expect(cloned, `Fixture ${name} should not be mutated`).toEqual(fixture);
    }
  });

  it('rejects every canonical invalid evidence fixture', () => {
    const invalidFixtures = [
      { name: 'malformed-contextual-family', fixture: malformedContextualFamilyFixture },
      { name: 'noncanonical-timestamp', fixture: noncanonicalTimestampFixture },
      { name: 'out-of-range-number', fixture: outOfRangeNumberFixture },
      { name: 'unknown-field', fixture: unknownFieldFixture },
      { name: 'unsupported-unit', fixture: unsupportedUnitFixture },
      { name: 'wrong-schema-version', fixture: wrongSchemaVersionFixture },
    ];

    for (const { name, fixture } of invalidFixtures) {
      const cloned = deepClone(fixture);
      const isValid = validateEvidenceBundle(cloned);
      expect(isValid, `Fixture ${name} should have failed schema validation`).toBe(false);
    }
  });
});
