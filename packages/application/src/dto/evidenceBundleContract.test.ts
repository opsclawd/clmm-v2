import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';

import type { EvidenceBundle } from './evidence.js';
import evidenceBundleSchema from '../../../../schemas/regime-engine/evidence-bundle.v1/schema.json' with { type: 'json' };
import evidenceBundleProvenance from '../../../../schemas/regime-engine/evidence-bundle.v1/provenance.json' with { type: 'json' };

import contextualValidFixture from '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid/contextual.json' with { type: 'json' };

const ajv = new Ajv2020({
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});

ajv.addKeyword({
  keyword: 'finite',
  type: 'number',
  validate: (schema: boolean, data: number) => !schema || Number.isFinite(data),
});

const validateEvidenceBundle = ajv.compile(evidenceBundleSchema);

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('Evidence bundle contract schema validation', () => {
  // Regression proof: the canonical fixture/DTO does not yet carry collector
  // liveness. This documents the contract gap that a follow-up task closes;
  // it.fails keeps the suite green until then and flips to a real failure
  // (forcing this test to be un-skipped) once liveness lands.
  it.fails('canonical fixture exposes typed collector liveness', () => {
    const bundle: EvidenceBundle = contextualValidFixture as EvidenceBundle;
    const liveness = (bundle.assessment as { liveness?: unknown }).liveness;

    expect(liveness).toBeDefined();
    expect(Object.keys((liveness as Record<string, unknown>) ?? {})).not.toHaveLength(0);
  });

  it('canonical fixture exposes typed family coverage', () => {
    const bundle: EvidenceBundle = contextualValidFixture as EvidenceBundle;
    const coverage = bundle.assessment.coverage;

    expect(coverage).toBeDefined();
    expect(Object.keys(coverage ?? {})).not.toHaveLength(0);
  });

  it('verifies every vendored evidence asset against pinned provenance', () => {
    expect(evidenceBundleProvenance.commit).toMatch(/^[0-9a-f]{40}$/i);
    expect(evidenceBundleProvenance.schemaPath).toBe(
      'contracts/evidence-bundle/v1/evidence-bundle.schema.json',
    );
    expect(evidenceBundleProvenance.schemaVersion).toBe('v1');
    expect(evidenceBundleProvenance.assets.length).toBeGreaterThan(0);

    for (const asset of evidenceBundleProvenance.assets) {
      const filePath = path.resolve(import.meta.dirname, '../../../../', asset.localPath);
      const fileBytes = fs.readFileSync(filePath);
      const actualSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
      expect(actualSha256, `Checksum mismatch for ${asset.localPath}`).toBe(asset.sha256);
    }
  });

  it('accepts every canonical valid evidence fixture without mutation', () => {
    const validFixturesDir = path.resolve(
      import.meta.dirname,
      '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/valid',
    );
    const validFiles = fs.readdirSync(validFixturesDir).filter((file) => file.endsWith('.json'));

    expect(validFiles.length).toBeGreaterThan(0);

    for (const file of validFiles) {
      const filePath = path.join(validFixturesDir, file);
      const fixture = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      const cloned = deepClone(fixture);
      const isValid = validateEvidenceBundle(cloned);
      expect(isValid, `Fixture ${file} should pass validation`).toBe(true);
      expect(cloned, `Fixture ${file} should not be mutated`).toEqual(fixture);
    }
  });

  it('evaluates all 13 canonical invalid evidence fixtures against schema boundaries', () => {
    const invalidFixturesDir = path.resolve(
      import.meta.dirname,
      '../../../../schemas/regime-engine/evidence-bundle.v1/fixtures/invalid',
    );
    const invalidFiles = fs
      .readdirSync(invalidFixturesDir)
      .filter((file) => file.endsWith('.json'));

    expect(invalidFiles).toHaveLength(13);

    const structuralInvalidFiles = new Set([
      'malformed-contextual-family.json',
      'noncanonical-timestamp.json',
      'out-of-range-number.json',
      'unknown-field.json',
      'unsupported-unit.json',
      'wrong-schema-version.json',
    ]);

    for (const file of invalidFiles) {
      const filePath = path.join(invalidFixturesDir, file);
      const fixture = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      const cloned = deepClone(fixture);
      const isValid = validateEvidenceBundle(cloned);

      if (structuralInvalidFiles.has(file)) {
        expect(isValid, `Structural invalid fixture ${file} should fail schema validation`).toBe(
          false,
        );
      } else {
        expect(
          isValid,
          `Semantic invalid fixture ${file} should pass structural schema validation`,
        ).toBe(true);
      }
    }
  });
});
