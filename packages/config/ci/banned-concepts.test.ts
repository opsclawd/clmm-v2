import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const BANNED_PATTERNS = [
  /\bReceipt\b/,
  /\bAttestation\b/,
  /\bOnChainHistory\b/,
  /\bClaimVerification\b/,
  /\bCanonicalExecutionCertificate\b/,
  /\bProofVerification\b/,
  /\bExecutionProof\b/,
];

const SCAN_DIRS = [
  join(__dirname, '../../../packages/domain/src'),
  join(__dirname, '../../../packages/application/src'),
  join(__dirname, '../../../packages/adapters/src'),
  join(__dirname, '../../../packages/ui/src'),
  join(__dirname, '../../../apps/app/src'),
  join(__dirname, '../../../apps/app/app'),
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...collectFiles(full));
      } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
        results.push(full);
      }
    }
  } catch {
    // directory may not exist yet during early scaffold
  }
  return results;
}

describe('banned-concept scanner', () => {
  const allFiles = SCAN_DIRS.flatMap(collectFiles);

  for (const pattern of BANNED_PATTERNS) {
    it(`no file contains banned concept: ${pattern.source}`, () => {
      const violations: string[] = [];
      for (const file of allFiles) {
        const content = readFileSync(file, 'utf-8');
        if (pattern.test(content)) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
