// @ts-check
import { createBaseConfig } from './base.js';

/** @param {string} tsconfigPath */
export function createNodeConfig(tsconfigPath) {
  return [
    ...createBaseConfig(tsconfigPath),
    {
      rules: {
        // NestJS uses classes heavily — allow decorators and class usage
        '@typescript-eslint/no-extraneous-class': 'off',
      },
    },
  ];
}
