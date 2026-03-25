# Sequence 1: Foundation and Boundary Enforcement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the frozen monorepo structure with TypeScript compile graph, import boundary enforcement, shared testing harness, runtime skeletons, and a green GitHub Actions CI pipeline — before any business code exists.

**Architecture:** Turborepo monorepo with pnpm workspaces. All boundary rules are encoded in `packages/config` and consumed by every other package. Two enforcement layers: TypeScript project references (compile-time) + dependency-cruiser + ESLint (lint-time). NestJS BFF and worker are bare bootstrap files under `packages/adapters/src/inbound/`; Expo app shell is a bare Expo Router entry under `apps/app`.

**Tech Stack:** pnpm 9, Turborepo, TypeScript 5, ESLint 9 (flat config), dependency-cruiser, Vitest, NestJS 10, Expo SDK 52, React Native 0.76, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-03-24-seq1-foundation-design.md`

---

## File Map

Files created in this plan, by task:

**Task 1 — Workspace root**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.nvmrc`
- Create: `.node-version`
- Create: `.npmrc`
- Create: `.gitignore`

**Task 2 — Shared TypeScript configs (`packages/config`)**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/typescript/base.json`
- Create: `packages/config/typescript/node.json`
- Create: `packages/config/typescript/react-native.json`
- Create: `packages/config/typescript/vitest.config.base.ts`

**Task 3 — Shared ESLint configs (skeleton)**
- Create: `packages/config/eslint/base.js`
- Create: `packages/config/eslint/node.js`
- Create: `packages/config/eslint/react-native.js`

**Task 4 — Dependency-cruiser boundary config**
- Create: `packages/config/boundaries/dependency-cruiser.cjs`
- Create: `.dependency-cruiser.cjs`

**Task 5 — Pure package scaffolds: domain, application, ui**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/src/index.ts`, `packages/domain/eslint.config.js`, `packages/domain/vitest.config.ts`
- Create: `packages/application/package.json`, `packages/application/tsconfig.json`, `packages/application/src/index.ts`, `packages/application/eslint.config.js`, `packages/application/vitest.config.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/eslint.config.js`, `packages/ui/vitest.config.ts`

**Task 6 — Testing package scaffold**
- Create: `packages/testing/package.json`, `packages/testing/tsconfig.json`, `packages/testing/src/index.ts`, `packages/testing/vitest.config.ts`
- Create: `packages/testing/src/scenarios/README.md`
- Create: `packages/testing/src/fakes/.gitkeep`, `packages/testing/src/contracts/.gitkeep`, `packages/testing/src/fixtures/.gitkeep`

**Task 7 — Adapters package + NestJS skeletons**
- Create: `packages/adapters/package.json`, `packages/adapters/tsconfig.json`, `packages/adapters/src/index.ts`, `packages/adapters/eslint.config.js`, `packages/adapters/vitest.config.ts`
- Create: `packages/adapters/src/composition/index.ts`
- Create: `packages/adapters/src/inbound/http/main.ts`, `packages/adapters/src/inbound/http/app.module.ts`
- Create: `packages/adapters/src/inbound/jobs/main.ts`, `packages/adapters/src/inbound/jobs/worker.module.ts`

**Task 8 — Expo app shell**
- Create: `apps/app/package.json`, `apps/app/tsconfig.json`, `apps/app/app.json`
- Create: `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`
- Create: `apps/app/src/index.ts`, `apps/app/src/composition/client.ts`
- Create: `apps/app/src/platform/.gitkeep`
- Create: `apps/app/eslint.config.js`

**Task 9 — Root tsconfig solution file + first build**
- Create: `tsconfig.json`
- Verify: `pnpm install && pnpm build` passes

**Task 10 — docs/architecture placeholder files**
- Create: `docs/architecture/adr/.gitkeep`
- Create: `docs/architecture/context-map.md`
- Create: `docs/architecture/dependency-rules.md`
- Create: `docs/architecture/event-catalog.md`

**Task 11 — Add boundary rules to ESLint configs**
- Modify: `packages/config/eslint/base.js` — add `no-restricted-imports` patterns
- Modify: `packages/config/eslint/node.js` — add adapter-specific patterns
- Modify: `packages/config/eslint/react-native.js` — add UI-specific patterns

**Task 12 — Add banned-concept ESLint rule**
- Modify: `packages/config/eslint/base.js` — add `no-restricted-syntax` selectors

**Task 13 — GitHub Actions CI workflow**
- Create: `.github/workflows/ci.yml`

**Task 14 — End-to-end verification**
- Verify: all CI checks pass on clean repo
- Verify: deliberate violations are caught
- Verify: clean after removing violations

---

## Task 1: Workspace Root Files

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.nvmrc`, `.node-version`, `.npmrc`, `.gitignore`

- [ ] **Step 1: Create `.nvmrc` and `.node-version`**

```
20
```

Both files contain exactly the string `20`. Create both.

- [ ] **Step 2: Create `.npmrc`**

```ini
shamefully-hoist=false
strict-peer-dependencies=false
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
.expo/
*.tsbuildinfo

# Turbo
.turbo/

# Testing
coverage/
.vitest-cache/

# Env
.env
.env.local
.env.*.local

# OS
.DS_Store
*.log
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Exactly these two globs — no others.

- [ ] **Step 5: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "*.tsbuildinfo"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {
      "dependsOn": []
    },
    "boundaries": {
      "dependsOn": []
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 6: Create root `package.json`**

```json
{
  "name": "clmm-v2",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "boundaries": "turbo run boundaries",
    "test": "turbo run test",
    "dev": "turbo run dev",
    "dev:app": "turbo run dev --filter=@clmm/app",
    "dev:api": "turbo run dev --filter=@clmm/adapters",
    "dev:worker": "turbo run dev --filter=@clmm/adapters"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 7: Install pnpm at the pinned version, then verify workspace is recognized**

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version
```

Expected output: `9.15.0`

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .nvmrc .node-version .npmrc .gitignore
git commit -m "chore: add workspace root manifest and toolchain pins"
```

---

## Task 2: Shared TypeScript Configs (`packages/config`)

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/src/index.ts`
- Create: `packages/config/typescript/base.json`
- Create: `packages/config/typescript/node.json`
- Create: `packages/config/typescript/react-native.json`
- Create: `packages/config/typescript/vitest.config.base.ts`

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@clmm/config",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./typescript/*": "./typescript/*",
    "./eslint/*": "./eslint/*",
    "./boundaries/*": "./boundaries/*"
  },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "echo 'no lint for config package'"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

Note: `exports` includes subpath exports for `typescript/*`, `eslint/*`, and `boundaries/*` so other packages can import directly from these subdirectories (e.g., `import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base'`).

- [ ] **Step 2: Create `packages/config/tsconfig.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src", "typescript", "eslint"]
}
```

- [ ] **Step 3: Create `packages/config/src/index.ts`**

```typescript
// @clmm/config — shared configuration package.
// Import subpaths directly: @clmm/config/typescript/base.json, etc.
export {};
```

- [ ] **Step 4: Create `packages/config/typescript/base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "composite": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 5: Create `packages/config/typescript/node.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node16",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

`emitDecoratorMetadata` and `experimentalDecorators` are required by NestJS's dependency injection container. `node16` is used instead of the deprecated `node`.

- [ ] **Step 6: Create `packages/config/typescript/react-native.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-native",
    "lib": ["ES2022", "DOM"]
  }
}
```

`"jsx": "react-native"` uses the **classic** React transform. Every `.tsx` file must have `import React from 'react'` explicitly — do not use `jsxImportSource`.

- [ ] **Step 7: Create `packages/config/typescript/vitest.config.base.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export function createVitestConfig(root: string) {
  return defineConfig({
    test: {
      globals: true,
      root,
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      coverage: {
        provider: 'v8',
        thresholds: {
          lines: 0,
          branches: 0,
          functions: 0,
          statements: 0,
        },
      },
    },
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/config/
git commit -m "chore: add shared TypeScript and Vitest configs to packages/config"
```

---

## Task 3: Shared ESLint Configs (Skeleton — No Boundary Rules Yet)

**Files:**
- Create: `packages/config/eslint/base.js`
- Create: `packages/config/eslint/node.js`
- Create: `packages/config/eslint/react-native.js`

Add ESLint and TypeScript ESLint to root devDependencies first.

- [ ] **Step 1: Add ESLint devDependencies to root `package.json`**

Add to root `package.json` `devDependencies`:
```json
{
  "eslint": "^9.17.0",
  "typescript-eslint": "^8.18.0",
  "eslint-plugin-import-x": "^4.6.0",
  "@eslint/js": "^9.17.0"
}
```

Then run:
```bash
pnpm install
```

- [ ] **Step 2: Create `packages/config/eslint/base.js`**

This is the skeleton — boundary rules and banned-concept rules are added in Tasks 11 and 12.

```javascript
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';

/** @param {string} tsconfigPath - absolute path to the package's tsconfig.json */
export function createBaseConfig(tsconfigPath) {
  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      plugins: {
        'import-x': importPlugin,
      },
      languageOptions: {
        parserOptions: {
          project: tsconfigPath,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        // No any except at explicit boundaries
        '@typescript-eslint/no-explicit-any': 'error',
        // Enforce explicit return types on exported functions
        '@typescript-eslint/explicit-module-boundary-types': 'warn',
        // Disallow unused variables
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        // Import ordering
        'import-x/order': ['warn', { 'newlines-between': 'always' }],
        // Boundary rules added in Task 11
        // Banned-concept rules added in Task 12
      },
    },
  );
}
```

- [ ] **Step 3: Create `packages/config/eslint/node.js`**

```javascript
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
```

- [ ] **Step 4: Create `packages/config/eslint/react-native.js`**

```javascript
// @ts-check
import { createBaseConfig } from './base.js';

/** @param {string} tsconfigPath */
export function createReactNativeConfig(tsconfigPath) {
  return [
    ...createBaseConfig(tsconfigPath),
    {
      rules: {
        // RN components often have implicit return types via JSX
        '@typescript-eslint/explicit-module-boundary-types': 'off',
      },
    },
  ];
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/config/eslint/
git commit -m "chore: add shared ESLint config skeletons to packages/config"
```

---

## Task 4: Dependency-Cruiser Boundary Config

**Files:**
- Create: `packages/config/boundaries/dependency-cruiser.cjs`
- Create: `.dependency-cruiser.cjs`

- [ ] **Step 1: Add dependency-cruiser to root devDependencies**

Add to root `package.json` `devDependencies`:
```json
{
  "dependency-cruiser": "^16.4.0"
}
```

Then:
```bash
pnpm install
```

- [ ] **Step 2: Create `packages/config/boundaries/dependency-cruiser.cjs`**

```javascript
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-external',
      comment: 'packages/domain must not depend on anything outside itself',
      severity: 'error',
      from: { path: '^packages/domain/src' },
      to: {
        pathNot: '^packages/domain/src',
        dependencyTypes: ['local'],
      },
    },
    {
      name: 'application-no-infra',
      comment: 'packages/application must not import adapters, Solana SDKs, React, or Expo',
      severity: 'error',
      from: { path: '^packages/application/src' },
      to: {
        path: [
          '^packages/adapters',
          '@solana/',
          '@orca-so/',
          '^react$',
          '^react-native$',
          '^expo$',
          '^expo-',
          '@nestjs/',
          '^drizzle-orm',
          '^pg-boss',
        ].join('|'),
      },
    },
    {
      name: 'ui-no-adapters',
      comment: 'packages/ui must not import adapters, Solana SDKs, or storage SDKs',
      severity: 'error',
      from: { path: '^packages/ui/src' },
      to: {
        path: [
          '^packages/adapters',
          '@solana/',
          '@orca-so/',
          '^drizzle-orm',
          '^pg-boss',
        ].join('|'),
      },
    },
    {
      name: 'app-shell-one-composition-path',
      comment: 'Only apps/app/src/composition/client.ts may import from packages/adapters',
      severity: 'error',
      from: {
        path: '^apps/app',
        pathNot: '^apps/app/src/composition/client\\.ts',
      },
      to: { path: '^packages/adapters' },
    },
    {
      name: 'testing-public-apis-only',
      comment: 'packages/testing must not deep-import src/ internals of other packages',
      severity: 'error',
      from: { path: '^packages/testing/src' },
      to: {
        path: '^packages/[^/]+/src/(?!index\\.ts)',
        dependencyTypes: ['local'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
```

- [ ] **Step 3: Create root `.dependency-cruiser.cjs`**

```javascript
module.exports = require('./packages/config/boundaries/dependency-cruiser.cjs');
```

- [ ] **Step 4: Commit**

```bash
git add packages/config/boundaries/ .dependency-cruiser.cjs
git commit -m "chore: add dependency-cruiser boundary enforcement config"
```

---

## Task 5: Pure Package Scaffolds — Domain, Application, UI

**Files:** package.json, tsconfig.json, src/index.ts, eslint.config.js, vitest.config.ts for each of: domain, application, ui.

These three packages have no external deps on each other (except application depends on domain). None of them depend on adapters, Solana SDKs, or NestJS.

- [ ] **Step 1: Create `packages/domain/package.json`**

```json
{
  "name": "@clmm/domain",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "boundaries": "depcruise src --config ../../.dependency-cruiser.cjs",
    "test": "vitest run --coverage"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint-plugin-import-x": "^4.6.0",
    "@eslint/js": "^9.17.0"
  }
}
```

- [ ] **Step 2: Create `packages/domain/tsconfig.json`**

```json
{
  "extends": "../../packages/config/typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {}
  },
  "include": ["src"],
  "references": []
}
```

Domain has no references — it depends on nothing.

- [ ] **Step 3: Create `packages/domain/src/index.ts`**

```typescript
// @clmm/domain — pure business model.
// No external SDK imports allowed here.
// Populated in Sequence 2.
export {};
```

- [ ] **Step 4: Create `packages/domain/eslint.config.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseConfig } from '@clmm/config/eslint/base.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createBaseConfig(path.join(__dirname, 'tsconfig.json'));
```

- [ ] **Step 5: Create `packages/domain/vitest.config.ts`**

```typescript
import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base';

export default createVitestConfig(__dirname);
```

- [ ] **Step 6: Create `packages/application/package.json`**

```json
{
  "name": "@clmm/application",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "boundaries": "depcruise src --config ../../.dependency-cruiser.cjs",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@clmm/domain": "workspace:*"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint-plugin-import-x": "^4.6.0",
    "@eslint/js": "^9.17.0"
  }
}
```

- [ ] **Step 7: Create `packages/application/tsconfig.json`**

```json
{
  "extends": "../../packages/config/typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/domain": ["../domain/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../domain" }
  ]
}
```

- [ ] **Step 8: Create `packages/application/src/index.ts`**

```typescript
// @clmm/application — application use cases and port contracts.
// No Solana SDK, React, or Expo imports allowed here.
// Populated in Sequence 3.
export {};
```

- [ ] **Step 9: Create `packages/application/eslint.config.js`**

Same pattern as domain — copy and adjust path:

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseConfig } from '@clmm/config/eslint/base.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createBaseConfig(path.join(__dirname, 'tsconfig.json'));
```

- [ ] **Step 10: Create `packages/application/vitest.config.ts`**

```typescript
import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base';

export default createVitestConfig(__dirname);
```

- [ ] **Step 11: Create `packages/ui/package.json`**

```json
{
  "name": "@clmm/ui",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "boundaries": "depcruise src --config ../../.dependency-cruiser.cjs",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "react": "18.3.1",
    "react-native": "0.76.7"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint-plugin-import-x": "^4.6.0",
    "@eslint/js": "^9.17.0"
  }
}
```

- [ ] **Step 12: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../packages/config/typescript/react-native.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/application": ["../application/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../application" }
  ]
}
```

- [ ] **Step 13: Create `packages/ui/src/index.ts`**

```typescript
// @clmm/ui — screens, presenters, view-models, components, design-system.
// Imports only from @clmm/application and own UI code.
// Populated in Sequence 9.
export {};
```

- [ ] **Step 14: Create `packages/ui/eslint.config.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReactNativeConfig } from '@clmm/config/eslint/react-native.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createReactNativeConfig(path.join(__dirname, 'tsconfig.json'));
```

- [ ] **Step 15: Create `packages/ui/vitest.config.ts`**

```typescript
import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base';

export default createVitestConfig(__dirname);
```

- [ ] **Step 16: Run install and verify packages are recognized**

```bash
pnpm install
pnpm ls --filter @clmm/domain --filter @clmm/application --filter @clmm/ui
```

Expected: all three packages listed without errors.

- [ ] **Step 17: Commit**

```bash
git add packages/domain/ packages/application/ packages/ui/
git commit -m "chore: scaffold domain, application, and ui packages"
```

---

## Task 6: Testing Package Scaffold

**Files:**
- Create: `packages/testing/package.json`, `tsconfig.json`, `src/index.ts`, `vitest.config.ts`
- Create: `packages/testing/src/scenarios/README.md`
- Create: gitkeep files for fakes, contracts, fixtures

- [ ] **Step 1: Create `packages/testing/package.json`**

```json
{
  "name": "@clmm/testing",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "boundaries": "depcruise src --config ../../.dependency-cruiser.cjs",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@clmm/domain": "workspace:*",
    "@clmm/application": "workspace:*",
    "@clmm/adapters": "workspace:*",
    "@clmm/ui": "workspace:*"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint-plugin-import-x": "^4.6.0",
    "@eslint/js": "^9.17.0"
  }
}
```

- [ ] **Step 2: Create `packages/testing/tsconfig.json`**

```json
{
  "extends": "../../packages/config/typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/domain": ["../domain/src/index.ts"],
      "@clmm/application": ["../application/src/index.ts"],
      "@clmm/adapters": ["../adapters/src/index.ts"],
      "@clmm/ui": ["../ui/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../domain" },
    { "path": "../application" },
    { "path": "../adapters" },
    { "path": "../ui" }
  ]
}
```

- [ ] **Step 3: Create `packages/testing/src/index.ts`**

```typescript
// @clmm/testing — shared test fakes, fixtures, contracts, and scenario helpers.
// Always import from this barrel — never from subdirectories directly.
// Populated in Sequences 2–5.
export {};
```

- [ ] **Step 4: Create `packages/testing/vitest.config.ts`**

```typescript
import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base';

export default createVitestConfig(__dirname);
```

- [ ] **Step 5: Create `packages/testing/eslint.config.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBaseConfig } from '@clmm/config/eslint/base.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createBaseConfig(path.join(__dirname, 'tsconfig.json'));
```

- [ ] **Step 6: Create directory markers**

```bash
touch packages/testing/src/fakes/.gitkeep
touch packages/testing/src/contracts/.gitkeep
touch packages/testing/src/fixtures/.gitkeep
```

- [ ] **Step 7: Create `packages/testing/src/scenarios/README.md`**

```markdown
# Scenario Helpers

This directory contains scenario harness helpers for story-by-story testing.

## Naming Convention

Each scenario helper file is named after the breach direction it exercises:

- `lower-bound-breach.ts` — helpers for testing the downside breach path (SOL -> USDC)
- `upper-bound-breach.ts` — helpers for testing the upside breach path (USDC -> SOL)

## What Goes Here

- **Sequence 2** adds: domain-level position + trigger builders for each breach direction
- **Sequence 3** adds: application-level scenario orchestrators using fake ports

## Usage

Import from the package barrel only:

```typescript
import { lowerBoundBreachScenario } from '@clmm/testing';
```

Never import directly from this subdirectory.
```

- [ ] **Step 8: Commit**

```bash
git add packages/testing/
git commit -m "chore: scaffold testing package with scenario helper contract"
```

---

## Task 7: Adapters Package + NestJS Skeletons

**Files:**
- Create: `packages/adapters/package.json`, `tsconfig.json`, `src/index.ts`, `eslint.config.js`, `vitest.config.ts`
- Create: `packages/adapters/src/composition/index.ts`
- Create: NestJS BFF and Worker entry files

- [ ] **Step 1: Create `packages/adapters/package.json`**

```json
{
  "name": "@clmm/adapters",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "boundaries": "depcruise src --config ../../.dependency-cruiser.cjs",
    "test": "vitest run --coverage"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/domain": "workspace:*",
    "@nestjs/core": "^10.4.0",
    "@nestjs/common": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint-plugin-import-x": "^4.6.0",
    "@eslint/js": "^9.17.0",
    "@types/express": "^5.0.0"
  }
}
```

`rxjs` is a required peer dependency of `@nestjs/core`.

- [ ] **Step 2: Create `packages/adapters/tsconfig.json`**

```json
{
  "extends": "../../packages/config/typescript/node.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/application": ["../application/src/index.ts"],
      "@clmm/domain": ["../domain/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../application" },
    { "path": "../domain" }
  ]
}
```

- [ ] **Step 3: Create `packages/adapters/src/index.ts`**

```typescript
// @clmm/adapters — public adapter entrypoint.
// Sequence 4+ exports adapters here as they are implemented.
export {};
```

- [ ] **Step 4: Create `packages/adapters/src/composition/index.ts`**

```typescript
// NestJS module wiring root.
// Populated in Sequence 4+ as adapters are implemented.
export {};
```

- [ ] **Step 5: Create `packages/adapters/src/inbound/http/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 6: Create `packages/adapters/src/inbound/http/main.ts`**

```typescript
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

void bootstrap();
```

`import 'reflect-metadata'` must be the first import. It enables NestJS decorator metadata.

- [ ] **Step 7: Create `packages/adapters/src/inbound/jobs/worker.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
})
export class WorkerModule {}
```

- [ ] **Step 8: Create `packages/adapters/src/inbound/jobs/main.ts`**

```typescript
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();
}

void bootstrap();
```

Worker uses `createApplicationContext` (no HTTP server).

- [ ] **Step 9: Create `packages/adapters/eslint.config.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeConfig } from '@clmm/config/eslint/node.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createNodeConfig(path.join(__dirname, 'tsconfig.json'));
```

- [ ] **Step 10: Create `packages/adapters/vitest.config.ts`**

```typescript
import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base';

export default createVitestConfig(__dirname);
```

- [ ] **Step 11: Run install**

```bash
pnpm install
```

- [ ] **Step 12: Commit**

```bash
git add packages/adapters/
git commit -m "chore: scaffold adapters package with NestJS BFF and worker skeletons"
```

---

## Task 8: Expo App Shell

**Files:**
- Create: `apps/app/package.json`, `tsconfig.json`, `app.json`
- Create: `apps/app/app/_layout.tsx`, `apps/app/app/index.tsx`
- Create: `apps/app/src/index.ts`, `apps/app/src/composition/client.ts`
- Create: `apps/app/src/platform/.gitkeep`
- Create: `apps/app/eslint.config.js`

- [ ] **Step 1: Create `apps/app/package.json`**

```json
{
  "name": "@clmm/app",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint app src",
    "boundaries": "depcruise app src --config ../../.dependency-cruiser.cjs",
    "test": "vitest run --coverage",
    "dev": "expo start",
    "dev:web": "expo start --web"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/config": "workspace:*",
    "@clmm/ui": "workspace:*",
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.7"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.17.0",
    "typescript-eslint": "^8.18.0",
    "eslint-plugin-import-x": "^4.6.0",
    "@eslint/js": "^9.17.0",
    "@types/react": "^18.3.0",
    "@types/react-native": "^0.76.0"
  }
}
```

`@clmm/adapters` is NOT listed as a dependency.

- [ ] **Step 2: Create `apps/app/app.json`**

```json
{
  "expo": {
    "name": "CLMM V2",
    "slug": "clmm-v2",
    "scheme": "clmmv2",
    "version": "1.0.0",
    "orientation": "portrait",
    "platforms": ["ios", "android", "web"],
    "web": {
      "output": "static",
      "bundler": "metro"
    },
    "plugins": [
      "expo-router"
    ]
  }
}
```

`scheme: "clmmv2"` is set now — required for MWA wallet return deep linking in Sequence 7.

- [ ] **Step 3: Create `apps/app/tsconfig.json`**

```json
{
  "extends": "../../packages/config/typescript/react-native.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "paths": {
      "@clmm/application": ["../../packages/application/src/index.ts"],
      "@clmm/config": ["../../packages/config/src/index.ts"],
      "@clmm/ui": ["../../packages/ui/src/index.ts"]
    }
  },
  "include": ["app", "src"],
  "references": [
    { "path": "../../packages/ui" },
    { "path": "../../packages/application" },
    { "path": "../../packages/config" }
  ]
}
```

- [ ] **Step 4: Create `apps/app/app/_layout.tsx`**

```tsx
import React from 'react';

import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

Explicit `import React from 'react'` is required — `"jsx": "react-native"` uses the classic transform.

- [ ] **Step 5: Create `apps/app/app/index.tsx`**

```tsx
import React from 'react';

import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>CLMM V2</Text>
    </View>
  );
}
```

- [ ] **Step 6: Create `apps/app/src/index.ts`**

```typescript
// @clmm/app — Expo universal app shell.
// Route files live in app/. Composition root lives in src/composition/.
// Does not own screens, presenters, view-models, or business logic.
export {};
```

- [ ] **Step 7: Create `apps/app/src/composition/client.ts`**

```typescript
// Approved adapter composition root.
// This is the ONLY file in apps/app permitted to import from @clmm/adapters.
// Currently a placeholder — wired in Sequence 7 when wallet adapters are integrated.
export {};
```

- [ ] **Step 8: Create `apps/app/src/platform/.gitkeep`**

```bash
touch apps/app/src/platform/.gitkeep
```

- [ ] **Step 9: Create `apps/app/eslint.config.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReactNativeConfig } from '@clmm/config/eslint/react-native.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default createReactNativeConfig(path.join(__dirname, 'tsconfig.json'));
```

- [ ] **Step 10: Run install**

```bash
pnpm install
```

- [ ] **Step 11: Commit**

```bash
git add apps/app/
git commit -m "chore: scaffold Expo app shell with bare router entry and composition root"
```

---

## Task 9: Root `tsconfig.json` Solution File + First Build

**Files:**
- Create: `tsconfig.json` (root — solution file only)

- [ ] **Step 1: Create root `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "packages/config" },
    { "path": "packages/domain" },
    { "path": "packages/application" },
    { "path": "packages/adapters" },
    { "path": "packages/ui" },
    { "path": "packages/testing" },
    { "path": "apps/app" }
  ]
}
```

`"files": []` is required — a solution tsconfig must have no sources of its own. `"references"` lists every package.

- [ ] **Step 2: Run full install to lock pnpm-lock.yaml**

```bash
pnpm install
```

- [ ] **Step 3: Run first build**

```bash
pnpm build
```

Expected: build completes for all packages. Each package emits `dist/` with `.d.ts` and `.js` files. No TypeScript errors.

If errors appear: fix them in the relevant package before continuing. Common causes:
- Missing `composite: true` in a tsconfig
- `paths` alias pointing to wrong relative path
- Missing `references` entry

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: passes for all packages with no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json pnpm-lock.yaml
git commit -m "chore: add root tsconfig solution file; first full build passing"
```

---

## Task 10: `docs/architecture` Placeholder Files

**Files:**
- Create: `docs/architecture/adr/.gitkeep`
- Create: `docs/architecture/context-map.md`
- Create: `docs/architecture/dependency-rules.md`
- Create: `docs/architecture/event-catalog.md`

- [ ] **Step 1: Create placeholder files**

```bash
mkdir -p docs/architecture/adr
touch docs/architecture/adr/.gitkeep
```

`docs/architecture/context-map.md`:
```markdown
# Context Map

_Populated in Sequence 2 when bounded contexts are implemented._
```

`docs/architecture/dependency-rules.md`:
```markdown
# Dependency Rules

See `CLAUDE.md` for the full dependency rule table.
CI enforcement is via dependency-cruiser and ESLint — see `packages/config/boundaries/` and `packages/config/eslint/`.
```

`docs/architecture/event-catalog.md`:
```markdown
# Event Catalog

_Populated in Sequence 3 when application use cases and ports are defined._
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/
git commit -m "docs: add architecture placeholder files"
```

---

## Task 11: Add Boundary Rules to ESLint Configs

**Files:**
- Modify: `packages/config/eslint/base.js` — add `no-restricted-imports` for domain and application
- Modify: `packages/config/eslint/node.js` — add adapter-specific patterns (already covered by node-level ESLint)
- Modify: `packages/config/eslint/react-native.js` — add UI-specific patterns

The goal: adding a forbidden import anywhere in `src/` causes `pnpm lint` to fail.

- [ ] **Step 1: Update `packages/config/eslint/base.js` — add domain/application boundary imports**

Replace the existing `createBaseConfig` function. Add the `no-restricted-imports` rule to the rules object:

```javascript
// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';

/** @param {string} tsconfigPath - absolute path to the package's tsconfig.json */
export function createBaseConfig(tsconfigPath) {
  return tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      plugins: {
        'import-x': importPlugin,
      },
      languageOptions: {
        parserOptions: {
          project: tsconfigPath,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'warn',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        'import-x/order': ['warn', { 'newlines-between': 'always' }],
        // Boundary: domain and application cannot import infra or UI SDKs
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@clmm/adapters', '@clmm/adapters/*'], message: 'Domain and application layers must not import adapters.' },
            { group: ['@solana/*'], message: 'Solana SDK imports not allowed in domain/application.' },
            { group: ['@orca-so/*'], message: 'Orca SDK imports not allowed in domain/application.' },
            { group: ['react', 'react-native'], message: 'UI framework imports not allowed in domain/application.' },
            { group: ['expo', 'expo-*'], message: 'Expo imports not allowed in domain/application.' },
            { group: ['@nestjs/*'], message: 'NestJS imports not allowed in domain/application.' },
            { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Storage SDK imports not allowed in domain/application.' },
            { group: ['pg-boss'], message: 'Job queue imports not allowed in domain/application.' },
          ],
        }],
        // Banned-concept rules added in Task 12
      },
    },
  );
}
```

- [ ] **Step 2: Update `packages/config/eslint/react-native.js` — add UI-specific boundary rules**

Note: this config must include ALL banned patterns for the UI layer — it cannot rely on `base.js` for the adapter block because `no-restricted-imports` is merged, not inherited. Include the full pattern set:

```javascript
// @ts-check
import { createBaseConfig } from './base.js';

/** @param {string} tsconfigPath */
export function createReactNativeConfig(tsconfigPath) {
  return [
    ...createBaseConfig(tsconfigPath),
    {
      rules: {
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        // UI must not import adapters, Solana SDKs, or storage SDKs.
        // Lists the full set (not just additions) because no-restricted-imports does not merge.
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@clmm/adapters', '@clmm/adapters/*'], message: 'UI must not import from adapters.' },
            { group: ['@clmm/adapters/src/inbound', '@clmm/adapters/src/inbound/*'], message: 'UI must not import adapter inbound handlers.' },
            { group: ['@solana/*'], message: 'Solana SDK not allowed in UI.' },
            { group: ['@orca-so/*'], message: 'Orca SDK not allowed in UI.' },
            { group: ['drizzle-orm', 'drizzle-orm/*'], message: 'Storage SDK not allowed in UI.' },
            { group: ['pg-boss'], message: 'Job queue not allowed in UI.' },
          ],
        }],
      },
    },
  ];
}
```

- [ ] **Step 3: Verify lint runs on all packages without errors**

```bash
pnpm lint
```

Expected: no errors. (Rules are in place but no violations exist yet — all `src/index.ts` files are empty barrels.)

- [ ] **Step 4: Write a deliberate violation to verify the domain rule fires**

Add this temporary import to `packages/domain/src/index.ts`:

```typescript
import { Module } from '@nestjs/common'; // DELIBERATE VIOLATION — remove after test
export {};
```

- [ ] **Step 5: Run lint and verify the violation is caught**

```bash
pnpm lint --filter @clmm/domain
```

Expected: ESLint error: `'@nestjs/common'` matches restricted import pattern with message "NestJS imports not allowed in domain/application."

- [ ] **Step 6: Remove the violation**

Restore `packages/domain/src/index.ts` to its original content (the comment + `export {}`).

- [ ] **Step 7: Verify lint is clean again**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/config/eslint/
git commit -m "chore: add no-restricted-imports boundary rules to ESLint configs"
```

---

## Task 12: Add Banned-Concept ESLint Rule

**Files:**
- Modify: `packages/config/eslint/base.js` — add `no-restricted-syntax` selectors

- [ ] **Step 1: Add the banned-concept rule to `packages/config/eslint/base.js`**

Inside the `rules` object in `createBaseConfig`, add after the `no-restricted-imports` rule:

```javascript
'no-restricted-syntax': [
  'error',
  {
    selector: 'ClassDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
    message: "Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.",
  },
  {
    selector: 'TSTypeAliasDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
    message: "Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.",
  },
  {
    selector: 'TSInterfaceDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
    message: "Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.",
  },
  {
    selector: 'TSEnumDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
    message: "Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.",
  },
],
```

These selectors match the **declaration name** via regex. They fire on `class Receipt`, `type Receipt`, `interface Receipt`, `enum Receipt`. They do NOT fire on variable names or string literals containing these words.

- [ ] **Step 2: Write a deliberate violation to verify the banned-concept rule fires**

Add this temporary declaration to `packages/domain/src/index.ts`:

```typescript
// DELIBERATE VIOLATION — remove after test
class Receipt {}
export {};
```

- [ ] **Step 3: Run lint and verify the violation is caught**

```bash
pnpm lint --filter @clmm/domain
```

Expected: ESLint error on `class Receipt` with message "Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem."

- [ ] **Step 4: Verify a non-matching name does NOT fire**

Temporarily change `class Receipt` to `class ReceiptData` (substring, not exact start). This should NOT trigger the rule because the regex is `/^(Receipt|...)` which matches names STARTING with the banned term. `ReceiptData` starts with `Receipt` so it will match — that is correct and intentional behavior. Change to `class DataReceipt` to confirm a name that doesn't START with the banned term passes.

- [ ] **Step 5: Remove the violation**

Restore `packages/domain/src/index.ts` to its original content.

- [ ] **Step 6: Verify lint is clean**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/config/eslint/base.js
git commit -m "chore: add banned-concept no-restricted-syntax ESLint rule"
```

---

## Task 13: GitHub Actions CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```bash
mkdir -p .github/workflows
```

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  ci:
    name: Build, Typecheck, Lint, Boundaries, Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        # version is read from root package.json packageManager field automatically

      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Check boundaries
        run: pnpm boundaries

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions CI pipeline"
```

---

## Task 14: End-to-End Verification

This task verifies the "done when" condition from the spec: CI enforces boundaries. No business code exists. All checks are green.

- [ ] **Step 1: Run the full local CI sequence**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test
```

Expected: all steps pass with no errors. `pnpm test` exits 0 (no test files found yet — Vitest exits 0 on empty test suite by default; verify this is the case).

If `pnpm test` exits with an error about "no tests found", add `passWithNoTests: true` to `vitest.config.base.ts`:
```typescript
test: {
  globals: true,
  passWithNoTests: true,
  // ...
}
```

- [ ] **Step 2: Verify the layer-violation scenario — domain imports adapters**

Add to `packages/domain/src/index.ts`:
```typescript
import {} from '@clmm/adapters'; // VIOLATION
export {};
```

Run:
```bash
pnpm lint --filter @clmm/domain
pnpm boundaries --filter @clmm/domain
```

Expected: both commands fail with a clear error referencing the forbidden import.

- [ ] **Step 3: Remove the violation and re-verify clean**

Restore `packages/domain/src/index.ts`. Run:
```bash
pnpm lint && pnpm boundaries
```

Expected: both pass.

- [ ] **Step 4: Verify the banned-concept scenario**

Add to `packages/application/src/index.ts`:
```typescript
interface OnChainHistory {} // VIOLATION
export {};
```

Run:
```bash
pnpm lint --filter @clmm/application
```

Expected: ESLint error with banned-concept message.

- [ ] **Step 5: Remove the violation and re-verify clean**

Restore `packages/application/src/index.ts`. Run:
```bash
pnpm lint
```

Expected: passes.

- [ ] **Step 6: Verify app-shell composition boundary**

Add to `apps/app/app/index.tsx` (NOT the composition root):
```typescript
import {} from '@clmm/adapters'; // VIOLATION — not in composition/client.ts
```

First add `@clmm/adapters` temporarily to `apps/app/package.json` dependencies so the import resolves, then run:
```bash
pnpm boundaries --filter @clmm/app
```

Expected: dep-cruiser fails with `app-shell-one-composition-path` rule violation.

Remove the violation and the temporary dependency. Then regenerate the lockfile:

```bash
pnpm install
```

- [ ] **Step 7: Final clean run**

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test
```

Expected: all steps pass. This is the Sequence 1 done condition.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: sequence 1 complete — foundation and boundary enforcement verified"
```

---

## Sequence 1 Complete

**Definition of done (from spec):**
- Clean checkout runs `pnpm build && pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test` successfully.
- Introducing a forbidden import causes `pnpm lint` and `pnpm boundaries` to fail.
- Introducing a banned concept declaration causes `pnpm lint` to fail.
- No domain types, application ports, adapter implementations, or UI screens exist.
- Sequence 2 can begin at `packages/domain/src/` with the testing harness available and all boundary enforcement already in place.
