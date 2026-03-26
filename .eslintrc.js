'use strict';

module.exports = {
  root: true,
  extends: ['@clmm/config/eslint'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    // Per-package overrides applied in each package's own .eslintrc.js
  },
};
