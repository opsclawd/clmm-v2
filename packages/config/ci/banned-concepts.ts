import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';

const SUFFIX_BANNED_CONCEPTS = [
  'Receipt',
  'Attestation',
  'OnChainHistory',
  'ClaimVerification',
  'CanonicalExecutionCertificate',
] as const;

export const BANNED_PATTERNS = [
  ...SUFFIX_BANNED_CONCEPTS.map((concept) => new RegExp(`\\b\\w*${concept}\\b`)),
  /\bProofVerification\b/,
  /\bExecutionProof\b/,
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export function containsBannedConcept(content: string): boolean {
  return BANNED_PATTERNS.some((pattern) => pattern.test(content));
}

export function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...collectSourceFiles(full));
      } else if (SOURCE_EXTENSIONS.has(extname(entry))) {
        results.push(full);
      }
    }
  } catch {
    // directory may not exist yet during early scaffold
  }
  return results;
}

export function findBannedConceptViolations(files: readonly string[]): string[] {
  return findPatternViolations(files, BANNED_PATTERNS);
}

export function findPatternViolations(
  files: readonly string[],
  patterns: readonly RegExp[],
): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    if (patterns.some((pattern) => pattern.test(content))) {
      violations.push(file);
    }
  }
  return violations;
}
