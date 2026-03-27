'use strict';

module.exports = {
  root: true,
  extends: [
    './packages/config/eslint/index.js',
    './packages/config/eslint/boundary-rules.js',
  ],
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
};
