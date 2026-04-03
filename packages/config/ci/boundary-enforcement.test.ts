import { describe, expect, it } from 'vitest';
// @ts-ignore - dependency-cruiser config is a runtime CJS file without shipped typings
import depCruiseConfig from '../boundaries/dependency-cruiser.cjs';

type ForbiddenRule = {
  name: string;
  to: {
    path?: string | string[];
  };
};

describe('dependency-cruiser boundary enforcement config', () => {
  it('matches unresolved @solana package imports by module specifier', () => {
    const rule = (depCruiseConfig.forbidden as ForbiddenRule[]).find(
      (candidate) => candidate.name === 'domain-no-external-sdks',
    );

    expect(rule).toBeDefined();
    expect(rule?.to.path).toEqual(
      expect.arrayContaining([expect.stringMatching(/^\^@solana/)]),
    );

    const solanaPatterns = (rule?.to.path as string[]).map((pattern) => new RegExp(pattern));
    expect(solanaPatterns.some((pattern) => pattern.test('@solana/web3.js'))).toBe(true);
  });
});
