import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  BANNED_PATTERNS,
  collectSourceFiles,
  findPatternViolations,
} from './banned-concepts.js';

const SCAN_DIRS = [
  join(__dirname, '../../../packages/domain/src'),
  join(__dirname, '../../../packages/application/src'),
  join(__dirname, '../../../packages/adapters/src'),
  join(__dirname, '../../../packages/ui/src'),
  join(__dirname, '../../../apps/app/src'),
  join(__dirname, '../../../apps/app/app'),
];

describe('banned-concept scanner', () => {
  const allFiles = SCAN_DIRS.flatMap(collectSourceFiles);

  for (const pattern of BANNED_PATTERNS) {
    it(`no file contains banned concept: ${pattern.source}`, () => {
      const violations = findPatternViolations(allFiles, [pattern]);
      expect(violations).toEqual([]);
    });
  }
});
