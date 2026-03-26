# CLMM V2 — Epic 1: Repo Foundation & CI Guardrails

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the frozen monorepo structure, TypeScript compile graph, test harness, and CI boundary enforcement so every later epic executes within mechanically-enforced clean architecture constraints.

**Architecture:** Turborepo + pnpm workspaces with 7 packages (`domain`, `application`, `adapters`, `ui`, `config`, `testing`) + 1 app shell (`apps/app`). TypeScript project references enforce the compile graph. dependency-cruiser + ESLint path rules enforce layer boundaries. A banned-concept scanner fails any import of Receipt/Attestation/Proof/ClaimVerification/OnChainHistory/CanonicalExecutionCertificate. No business logic yet — only scaffolding and enforcement.

**Tech Stack:** Node 20+, pnpm 9+, Turborepo, TypeScript 5.x strict, Vitest, dependency-cruiser, ESLint, NestJS (skeleton only), Expo SDK 52 (skeleton only)

---

## File Map

### Created in this epic

```
package.json                               # pnpm workspace root
pnpm-workspace.yaml
turbo.json
.eslintrc.js                               # root ESLint (delegates to packages/config)
.gitignore
tsconfig.json                              # root composite (references all packages)

packages/config/
  package.json
  tsconfig/
    base.json                              # strict TS base
    nestjs.json                            # NestJS-specific extends base
    react-native.json                      # RN-specific extends base
  eslint/
    index.js                               # shared ESLint rules
    boundary-rules.js                      # forbidden-import path rules
  boundaries/
    .dependency-cruiser.cjs                # dep-cruiser rules
  ci/
    banned-concepts.test.ts                # scans all src/ for banned symbols

packages/domain/
  package.json
  tsconfig.json
  src/index.ts                             # empty barrel — filled in Epic 2

packages/application/
  package.json
  tsconfig.json
  src/index.ts                             # empty barrel
  src/public/index.ts                      # UI-facing re-exports (empty for now)

packages/adapters/
  package.json
  tsconfig.json
  src/inbound/http/main.ts                 # NestJS BFF skeleton (bootstrap only)
  src/inbound/jobs/main.ts                 # NestJS worker skeleton (bootstrap only)
  src/composition/AdaptersModule.ts        # empty NestJS module
  src/index.ts                             # empty barrel

packages/ui/
  package.json
  tsconfig.json
  src/index.ts                             # empty barrel

packages/testing/
  package.json
  tsconfig.json
  src/fakes/index.ts                       # empty — filled in Epic 2
  src/fixtures/index.ts                    # empty
  src/scenarios/index.ts                   # empty
  src/contracts/index.ts                   # empty
  src/index.ts                             # barrel

apps/app/
  package.json
  app.json
  tsconfig.json
  app/_layout.tsx                          # Expo Router root layout (skeleton)
  src/composition/index.ts                 # ONE approved adapter composition entrypoint
  src/platform/index.ts                    # platform-edge stubs
```

---

## Task 1: Workspace Root + Turborepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`

- [ ] **Step 1.1: Create root package.json**

```json
{
  "name": "clmm-v2",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "test": "turbo test",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint",
    "boundaries": "turbo boundaries",
    "test:domain": "pnpm --filter @clmm/domain test",
    "test:application": "pnpm --filter @clmm/application test",
    "test:adapters": "pnpm --filter @clmm/adapters test",
    "test:e2e": "pnpm --filter @clmm/testing test"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 1.2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 1.3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "boundaries": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 1.4: Create .gitignore**

```
node_modules/
dist/
.turbo/
*.tsbuildinfo
.expo/
.next/
coverage/
```

- [ ] **Step 1.5: Install workspace deps and verify**

```bash
pnpm install
```

Expected: lockfile created, no errors.

- [ ] **Step 1.6: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore
git commit -m "chore: initialize turborepo workspace root"
```

---

## Task 2: packages/config — TypeScript Bases

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/nestjs.json`
- Create: `packages/config/tsconfig/react-native.json`

- [ ] **Step 2.1: Create packages/config/package.json**

```json
{
  "name": "@clmm/config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./tsconfig/*": "./tsconfig/*.json",
    "./eslint": "./eslint/index.js",
    "./eslint/boundary-rules": "./eslint/boundary-rules.js",
    "./boundaries": "./boundaries/.dependency-cruiser.cjs"
  }
}
```

- [ ] **Step 2.2: Create packages/config/tsconfig/base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

- [ ] **Step 2.3: Create packages/config/tsconfig/nestjs.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 2.4: Create packages/config/tsconfig/react-native.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  }
}
```

- [ ] **Step 2.5: Commit**

```bash
git add packages/config/
git commit -m "chore: add shared TypeScript config bases"
```

---

## Task 3: Package Manifests + tsconfig for All Packages

**Files:** `packages/*/package.json`, `packages/*/tsconfig.json`, `apps/app/package.json`

- [ ] **Step 3.1: Create packages/domain/package.json**

```json
{
  "name": "@clmm/domain",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.2: Create packages/domain/tsconfig.json**

```json
{
  "extends": "@clmm/config/tsconfig/base",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3.3: Create packages/application/package.json**

```json
{
  "name": "@clmm/application",
  "version": "0.0.1",
  "private": true,
  "main": "./src/public/index.ts",
  "types": "./src/public/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./public": "./src/public/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@clmm/domain": "workspace:*"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "@clmm/testing": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.4: Create packages/application/tsconfig.json**

```json
{
  "extends": "@clmm/config/tsconfig/base",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/domain": ["../domain/src/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../domain" }]
}
```

- [ ] **Step 3.5: Create packages/adapters/package.json**

```json
{
  "name": "@clmm/adapters",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json",
    "dev:api": "ts-node -r tsconfig-paths/register src/inbound/http/main.ts",
    "dev:worker": "ts-node -r tsconfig-paths/register src/inbound/jobs/main.ts"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/domain": "workspace:*",
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-fastify": "^10.0.0",
    "reflect-metadata": "^0.2.0"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "@clmm/testing": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.6: Create packages/adapters/tsconfig.json**

```json
{
  "extends": "@clmm/config/tsconfig/nestjs",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/application": ["../application/src/index.ts"],
      "@clmm/application/public": ["../application/src/public/index.ts"],
      "@clmm/domain": ["../domain/src/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../application" },
    { "path": "../domain" }
  ]
}
```

- [ ] **Step 3.7: Create packages/ui/package.json**

```json
{
  "name": "@clmm/ui",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "react": "18.2.0",
    "react-native": "0.74.0"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.8: Create packages/ui/tsconfig.json**

```json
{
  "extends": "@clmm/config/tsconfig/react-native",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/application/public": ["../application/src/public/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../application" }]
}
```

- [ ] **Step 3.9: Create packages/testing/package.json**

```json
{
  "name": "@clmm/testing",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/domain": "workspace:*"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.10: Create packages/testing/tsconfig.json**

```json
{
  "extends": "@clmm/config/tsconfig/base",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@clmm/application": ["../application/src/index.ts"],
      "@clmm/application/public": ["../application/src/public/index.ts"],
      "@clmm/domain": ["../domain/src/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../application" },
    { "path": "../domain" }
  ]
}
```

- [ ] **Step 3.11: Create apps/app/package.json**

```json
{
  "name": "@clmm/app",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "dev:web": "expo start --web",
    "build": "expo export",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/ui": "workspace:*",
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "react": "18.2.0",
    "react-native": "0.74.0"
  },
  "devDependencies": {
    "@clmm/adapters": "workspace:*",
    "@clmm/config": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 3.12: Create apps/app/tsconfig.json**

```json
{
  "extends": "@clmm/config/tsconfig/react-native",
  "compilerOptions": {
    "paths": {
      "@clmm/application/public": ["../../packages/application/src/public/index.ts"],
      "@clmm/ui": ["../../packages/ui/src/index.ts"]
    }
  },
  "include": ["app/**/*", "src/**/*"],
  "references": [
    { "path": "../../packages/ui" },
    { "path": "../../packages/application" }
  ]
}
```

- [ ] **Step 3.13: Create root tsconfig.json (composite references)**

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

- [ ] **Step 3.14: Install all deps and verify install succeeds**

```bash
pnpm install
```

Expected: all workspace packages linked, no resolution errors.

- [ ] **Step 3.15: Commit**

```bash
git add packages/ apps/ tsconfig.json
git commit -m "chore: add package manifests and TypeScript project references"
```

---

## Task 4: Source Skeletons (Empty Barrels)

**Files:** All `src/index.ts` stubs

- [ ] **Step 4.1: Create empty barrels for each package**

`packages/domain/src/index.ts`:
```typescript
// Domain public API — filled in Epic 2
export {};
```

`packages/application/src/index.ts`:
```typescript
// Application internal API — filled in Epic 3
export {};
```

`packages/application/src/public/index.ts`:
```typescript
// UI-facing public API — filled in Epic 3
export {};
```

`packages/adapters/src/index.ts`:
```typescript
// Adapters barrel — filled in Epic 4
export {};
```

`packages/ui/src/index.ts`:
```typescript
// UI public API — filled in Epic 6
export {};
```

`packages/testing/src/index.ts`:
```typescript
// Testing utilities — filled in Epic 2
export {};
```

`packages/testing/src/fakes/index.ts`:
```typescript
export {};
```

`packages/testing/src/fixtures/index.ts`:
```typescript
export {};
```

`packages/testing/src/scenarios/index.ts`:
```typescript
export {};
```

`packages/testing/src/contracts/index.ts`:
```typescript
export {};
```

- [ ] **Step 4.2: Verify TypeScript compiles with no errors**

```bash
pnpm typecheck
```

Expected: exits 0, no TS errors (empty barrels are valid).

- [ ] **Step 4.3: Commit**

```bash
git add packages/*/src/ packages/*/src/**
git commit -m "chore: add empty source barrels for all packages"
```

---

## Task 5: NestJS Skeletons (BFF + Worker)

**Files:**
- Create: `packages/adapters/src/inbound/http/main.ts`
- Create: `packages/adapters/src/inbound/jobs/main.ts`
- Create: `packages/adapters/src/composition/AdaptersModule.ts`

- [ ] **Step 5.1: Create AdaptersModule (empty NestJS module)**

`packages/adapters/src/composition/AdaptersModule.ts`:
```typescript
import 'reflect-metadata';
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class AdaptersModule {}
```

- [ ] **Step 5.2: Create BFF main (HTTP)**

`packages/adapters/src/inbound/http/main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AdaptersModule } from '../../composition/AdaptersModule';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AdaptersModule);
  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`BFF listening on port ${port}`);
}

void bootstrap();
```

- [ ] **Step 5.3: Create worker main**

`packages/adapters/src/inbound/jobs/main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AdaptersModule } from '../../composition/AdaptersModule';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AdaptersModule);
  // pg-boss job handlers registered by NestJS module — wired in Epic 4
  console.log('Worker started');
  // keep alive
  await app.init();
}

void bootstrap();
```

- [ ] **Step 5.4: Create apps/app skeleton**

`apps/app/app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

`apps/app/src/composition/index.ts`:
```typescript
// ONE approved composition bootstrap — wired in Epic 5
// Only this file may import from @clmm/adapters
export {};
```

`apps/app/src/platform/index.ts`:
```typescript
// Platform-edge stubs — filled in Epic 5
export {};
```

`apps/app/app.json`:
```json
{
  "expo": {
    "name": "CLMM V2",
    "slug": "clmm-v2",
    "version": "1.0.0",
    "scheme": "clmmv2",
    "platforms": ["ios", "android", "web"],
    "web": {
      "bundler": "metro",
      "output": "static"
    }
  }
}
```

- [ ] **Step 5.5: Typecheck adapters**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: exits 0.

- [ ] **Step 5.6: Commit**

```bash
git add packages/adapters/src/ apps/app/
git commit -m "chore: add NestJS BFF/worker skeletons and Expo app shell stub"
```

---

## Task 6: ESLint Boundary Rules

**Files:**
- Create: `packages/config/eslint/index.js`
- Create: `packages/config/eslint/boundary-rules.js`
- Create: `.eslintrc.js`

- [ ] **Step 6.1: Create packages/config/eslint/index.js**

```javascript
'use strict';

module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    'no-console': 'warn',
  },
};
```

- [ ] **Step 6.2: Create packages/config/eslint/boundary-rules.js**

```javascript
'use strict';

// Forbidden import patterns enforcing clean architecture boundaries.
// These replicate the dependency-cruiser rules as ESLint for IDE feedback.
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          // domain must not import adapters, ui, or external SDKs
          {
            group: ['@clmm/adapters', '@clmm/ui', '@solana/*', '@orca-so/*', 'react', 'react-native', 'expo*'],
            message: 'packages/domain must not import external SDKs or framework packages.',
          },
        ],
      },
    ],
  },
};
```

- [ ] **Step 6.3: Create root .eslintrc.js**

```javascript
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
```

- [ ] **Step 6.4: Add devDependencies for ESLint to root**

Add to root `package.json` devDependencies:
```json
{
  "@typescript-eslint/eslint-plugin": "^7.0.0",
  "@typescript-eslint/parser": "^7.0.0",
  "eslint": "^8.57.0",
  "eslint-plugin-import": "^2.29.0"
}
```

```bash
pnpm install
```

- [ ] **Step 6.5: Run lint to confirm no errors on empty barrels**

```bash
pnpm lint
```

Expected: exits 0 (empty files have no violations).

- [ ] **Step 6.6: Commit**

```bash
git add packages/config/eslint/ .eslintrc.js package.json pnpm-lock.yaml
git commit -m "chore: add ESLint config and boundary rules"
```

---

## Task 7: dependency-cruiser Boundary Enforcement

**Files:**
- Create: `packages/config/boundaries/.dependency-cruiser.cjs`

- [ ] **Step 7.1: Install dependency-cruiser**

Add to root `package.json` devDependencies:
```json
{
  "dependency-cruiser": "^16.0.0"
}
```

```bash
pnpm install
```

- [ ] **Step 7.2: Create .dependency-cruiser.cjs**

`packages/config/boundaries/.dependency-cruiser.cjs`:
```javascript
'use strict';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-external-sdks',
      severity: 'error',
      comment: 'packages/domain must not import external SDKs',
      from: { path: 'packages/domain/src' },
      to: {
        path: [
          'node_modules/@solana',
          'node_modules/@orca-so',
          'node_modules/react',
          'node_modules/react-native',
          'node_modules/expo',
          'node_modules/@nestjs',
        ],
      },
    },
    {
      name: 'application-no-adapters',
      severity: 'error',
      comment: 'packages/application must not import adapters, Solana SDKs, React, React Native, or Expo',
      from: { path: 'packages/application/src' },
      to: {
        path: [
          'packages/adapters',
          'node_modules/@solana',
          'node_modules/@orca-so',
          'node_modules/react',
          'node_modules/react-native',
          'node_modules/expo',
        ],
      },
    },
    {
      name: 'ui-no-adapters',
      severity: 'error',
      comment: 'packages/ui must not import adapter modules or Solana SDKs',
      from: { path: 'packages/ui/src' },
      to: {
        path: [
          'packages/adapters',
          'node_modules/@solana',
          'node_modules/@orca-so',
        ],
      },
    },
    {
      name: 'app-no-direct-adapters',
      severity: 'error',
      comment: 'apps/app may only import adapters through the one approved composition bootstrap',
      from: {
        path: 'apps/app',
        pathNot: 'apps/app/src/composition',
      },
      to: { path: 'packages/adapters' },
    },
    {
      name: 'no-receipt-concepts',
      severity: 'error',
      comment: 'No on-chain receipt/attestation/proof subsystem permitted',
      from: { path: '(packages|apps)' },
      to: {
        path: [
          'Receipt',
          'Attestation',
          'Proof',
          'ClaimVerification',
          'OnChainHistory',
          'CanonicalExecutionCertificate',
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
```

- [ ] **Step 7.3: Add boundaries script to root package.json**

```json
{
  "scripts": {
    "boundaries": "depcruise --config packages/config/boundaries/.dependency-cruiser.cjs packages apps"
  }
}
```

- [ ] **Step 7.4: Run boundaries check to verify it passes on empty barrels**

```bash
pnpm boundaries
```

Expected: exits 0 — no violations in empty files.

- [ ] **Step 7.5: Commit**

```bash
git add packages/config/boundaries/ package.json pnpm-lock.yaml
git commit -m "chore: add dependency-cruiser boundary rules"
```

---

## Task 8: Banned-Concept CI Scanner

**Files:**
- Create: `packages/config/ci/banned-concepts.test.ts`

- [ ] **Step 8.1: Write the banned-concept scanner test**

`packages/config/ci/banned-concepts.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const BANNED_PATTERNS = [
  /\bReceipt\b/,
  /\bAttestation\b/,
  /\bOnChainHistory\b/,
  /\bClaimVerification\b/,
  /\bCanonicalExecutionCertificate\b/,
  // "Proof" is common in non-banned contexts, so scope narrowly:
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
```

- [ ] **Step 8.2: Add vitest config to packages/config**

`packages/config/package.json` — add scripts:
```json
{
  "scripts": {
    "test": "vitest run ci/"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 8.3: Run the scanner test to verify it passes on empty barrels**

```bash
pnpm --filter @clmm/config test
```

Expected: all banned-concept tests pass (no source files contain banned symbols).

- [ ] **Step 8.4: Commit**

```bash
git add packages/config/ci/ packages/config/package.json
git commit -m "chore: add banned-concept CI scanner"
```

---

## Task 9: Vitest Configs For All Packages

**Files:** `packages/*/vitest.config.ts`

- [ ] **Step 9.1: Create a shared vitest config in packages/config**

`packages/config/vitest/base.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
```

- [ ] **Step 9.2: Add vitest.config.ts to each package**

`packages/domain/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
```

Copy the same pattern to:
- `packages/application/vitest.config.ts`
- `packages/adapters/vitest.config.ts`
- `packages/testing/vitest.config.ts`
- `packages/config/vitest.config.ts` (for CI scanner — uses `ci/**/*.test.ts`)

- [ ] **Step 9.3: Run tests across all packages to verify zero failures**

```bash
pnpm test
```

Expected: all packages report 0 tests run, 0 failures (no test files yet, but no crashes).

- [ ] **Step 9.4: Commit**

```bash
git add packages/*/vitest.config.ts packages/config/vitest/
git commit -m "chore: add vitest configs to all packages"
```

---

## Task 10: Smoke-Test The Full Boundary Enforcement

This task verifies that the boundaries actually reject illegal imports.

- [ ] **Step 10.1: Write a temporary file that violates the domain boundary**

Create `packages/domain/src/_violation_test.ts` (temporary):
```typescript
// THIS FILE INTENTIONALLY VIOLATES BOUNDARIES — delete after test
import { Connection } from '@solana/web3.js';
export const _test = Connection;
```

- [ ] **Step 10.2: Run boundaries check — expect it to fail**

```bash
pnpm boundaries 2>&1 | grep -i "domain-no-external-sdks"
```

Expected: output contains `domain-no-external-sdks` violation.

- [ ] **Step 10.3: Delete the violation file and verify boundaries pass again**

```bash
rm packages/domain/src/_violation_test.ts
pnpm boundaries
```

Expected: exits 0.

- [ ] **Step 10.4: Write a temporary file that uses a banned concept**

Create `packages/domain/src/_banned_test.ts`:
```typescript
// temporary — delete after test
export type ExecutionReceipt = { id: string };
```

- [ ] **Step 10.5: Run banned-concept scanner — expect failure**

```bash
pnpm --filter @clmm/config test 2>&1 | grep -i "receipt"
```

Expected: test failure naming the receipt violation.

- [ ] **Step 10.6: Delete the banned file and verify scanner passes**

```bash
rm packages/domain/src/_banned_test.ts
pnpm --filter @clmm/config test
```

Expected: exits 0.

- [ ] **Step 10.7: Final full check — all CI passes**

```bash
pnpm typecheck && pnpm lint && pnpm boundaries && pnpm test
```

Expected: all exit 0.

- [ ] **Step 10.8: Commit**

```bash
git add -A
git commit -m "chore(epic1): complete repo foundation and CI guardrails

- Frozen monorepo structure with 7 packages + 1 app shell
- TypeScript project references enforce compile graph
- dependency-cruiser rules enforce layer boundaries
- ESLint boundary rules for IDE feedback
- Banned-concept scanner (Receipt/Attestation/Proof/etc.)
- NestJS BFF + worker skeletons in packages/adapters
- Expo app shell skeleton in apps/app"
```

---

## Epic 1 Done-When

- [ ] `pnpm typecheck` exits 0 on all packages
- [ ] `pnpm boundaries` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm lint` exits 0
- [ ] Introducing a `@solana/*` import into `packages/domain/src` causes `pnpm boundaries` to fail
- [ ] Introducing `Receipt` into any `src/` file causes `pnpm --filter @clmm/config test` to fail
- [ ] Only `apps/app/src/composition/index.ts` may import from `packages/adapters`
- [ ] No business logic exists anywhere yet
