# Sequence 1: Foundation and Boundary Enforcement — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Covers:** Epic 1, Stories 1.1–1.4
**Sequence:** 1 of 9

---

## Purpose

Establish the frozen monorepo structure, TypeScript compile graph, import boundary enforcement, shared testing harness, runtime skeletons, and CI pipeline before any business code is written.

**Done when:** A fresh GitHub Actions run passes all pipeline steps on a clean repo. Introducing a deliberate layer violation (e.g., importing `@clmm/adapters` from `packages/domain/src/index.ts`) causes `pnpm lint` and `pnpm boundaries` to fail. Removing the violation makes the run green. No business types, domain logic, or adapter implementations exist yet.

---

## Decisions Made

| Question | Decision |
|---|---|
| CI platform | GitHub Actions |
| Test runner | Vitest |
| Runtime skeletons | Minimal NestJS bootstrap for BFF + Worker; minimal Expo entry for app shell |
| CI pipeline scope | Full pipeline skeleton (build, typecheck, lint, boundaries, test) — all green trivially |
| Banned-concept enforcement | ESLint `no-restricted-syntax` rule in shared base config |

---

## Section 1: Repository Structure and Workspace Manifest

### Files created at repo root

| File | Purpose |
|---|---|
| `package.json` | pnpm workspace root; `private: true`; declares `packageManager: "pnpm@9.x.x"` with pinned pnpm version; root-level `devDependencies` for turbo, typescript, and shared tooling only; no `dependencies` |
| `pnpm-workspace.yaml` | Declares `packages: ["apps/*", "packages/*"]` — exactly these two globs, no others |
| `turbo.json` | Pipeline task definitions (see CI section) |
| `.nvmrc` | `20` — pins Node.js major version |
| `.node-version` | `20` — redundant pin for tools that read this file |
| `.npmrc` | `shamefully-hoist=false`, `strict-peer-dependencies=false` |
| `.gitignore` | Standard Node / Turbo / Expo ignores — includes `dist/`, `.turbo/`, `node_modules/`, `.expo/`, `*.tsbuildinfo` |

### Package directories and minimum files created

Every package directory must contain at minimum: `package.json`, `tsconfig.json`, and `src/index.ts` (empty barrel). Without these, `tsc --build` and Turbo cannot process the package.

```
apps/
  app/
    package.json          @clmm/app
    tsconfig.json
    app.json
    app/
      _layout.tsx
      index.tsx
    src/
      index.ts            empty barrel (re-exports nothing in Sequence 1)
      composition/
        client.ts         placeholder composition root
      platform/
        .gitkeep

packages/
  domain/
    package.json          @clmm/domain
    tsconfig.json
    src/
      index.ts            empty barrel

  application/
    package.json          @clmm/application
    tsconfig.json
    src/
      index.ts            empty barrel

  adapters/
    package.json          @clmm/adapters
    tsconfig.json
    src/
      index.ts            empty barrel (public entrypoint)
      composition/
        index.ts          placeholder
      inbound/
        http/
          main.ts
          app.module.ts
        jobs/
          main.ts
          worker.module.ts

  ui/
    package.json          @clmm/ui
    tsconfig.json
    src/
      index.ts            empty barrel

  config/
    package.json          @clmm/config
    tsconfig.json
    src/
      index.ts            empty barrel
    typescript/
      base.json
      node.json
      react-native.json
      vitest.config.base.ts
    eslint/
      base.js
      node.js
      react-native.js
    boundaries/
      dependency-cruiser.cjs

  testing/
    package.json          @clmm/testing
    tsconfig.json
    vitest.config.ts
    src/
      index.ts            empty barrel
      fakes/              (empty directory — .gitkeep)
      contracts/          (empty directory — .gitkeep)
      fixtures/           (empty directory — .gitkeep)
      scenarios/
        README.md

docs/
  architecture/
    adr/                  (empty directory — .gitkeep)
    context-map.md        (one-line placeholder: "# Context Map — populated in Sequence 2")
    dependency-rules.md   (one-line placeholder: "# Dependency Rules — see CLAUDE.md")
    event-catalog.md      (one-line placeholder: "# Event Catalog — populated in Sequence 3")
```

All placeholder files and `.gitkeep` files must be committed to git so the directory structure exists on a clean checkout.

### Per-package `package.json` shape

Every package is `"private": true`. Declared inter-package dependencies use workspace protocol (`"@clmm/domain": "workspace:*"`). No package declares a dependency it is not permitted to import per the dependency rules.

Permitted declared dependencies per package:

| Package | May declare as dependency |
|---|---|
| `@clmm/domain` | none (no inter-package deps) |
| `@clmm/application` | `@clmm/domain` |
| `@clmm/adapters` | `@clmm/application`, `@clmm/domain`, NestJS runtime packages |
| `@clmm/ui` | `@clmm/application` |
| `@clmm/app` | `@clmm/ui`, `@clmm/application`, `@clmm/config`, Expo/RN packages |
| `@clmm/testing` | `@clmm/domain`, `@clmm/application`, `@clmm/adapters`, `@clmm/ui` |
| `@clmm/config` | none |

**`@clmm/app` does NOT declare `@clmm/adapters` as a dependency in Sequence 1.** The file `src/composition/client.ts` is a placeholder and does not import from `@clmm/adapters` yet. The dep-cruiser rule `app-shell-one-composition-path` is a forward guard: if `@clmm/adapters` is later added to `apps/app`'s `package.json` (which it may need to be in Sequence 7 for composition), the rule ensures only `src/composition/client.ts` may use that import. The rule does not fire in Sequence 1 because no such import exists.

Each package's `package.json` must include these scripts:

```json
{
  "scripts": {
    "build":      "tsc --build",
    "typecheck":  "tsc --noEmit",
    "lint":       "eslint src",
    "boundaries": "depcruise src --config ../../.dependency-cruiser.cjs",
    "test":       "vitest run --coverage"
  }
}
```

`@clmm/app` uses `"boundaries": "depcruise app src --config ../../.dependency-cruiser.cjs"` (scans both `app/` and `src/` directories).

`@clmm/config` omits `boundaries` and `test` scripts (it is a config-only package with no `src/` to scan in the dependency graph sense).

### `turbo.json` pipeline

```json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", "*.tsbuildinfo"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      { "dependsOn": [] },
    "boundaries":{ "dependsOn": [] },
    "test":      { "dependsOn": ["^build"] }
  }
}
```

Root `package.json` scripts:

```json
{
  "scripts": {
    "build":      "turbo run build",
    "typecheck":  "turbo run typecheck",
    "lint":       "turbo run lint",
    "boundaries": "turbo run boundaries",
    "test":       "turbo run test",
    "dev":        "turbo run dev",
    "dev:app":    "turbo run dev --filter=@clmm/app",
    "dev:api":    "turbo run dev --filter=@clmm/adapters",
    "dev:worker": "turbo run dev --filter=@clmm/adapters"
  }
}
```

---

## Section 2: TypeScript Compile Graph

### `composite: true` requirement

Every package `tsconfig.json` that participates in project references **must** include `"composite": true`. Without it, `tsc --build` errors with "Referenced project must have setting 'composite': true." This applies to all packages except the root solution `tsconfig.json`.

Each package's `tsconfig.json` must also set `"outDir": "dist"` and `"declarationDir": "dist"` so that `.d.ts` files are emitted for downstream references.

### Base configs in `packages/config/typescript/`

**`base.json`**
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
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  }
}
```

**`node.json`** — extends `base.json`; overrides for NestJS CommonJS runtimes:
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node16",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

`emitDecoratorMetadata` and `experimentalDecorators` are required by NestJS's DI container. `moduleResolution: "node16"` is used instead of the deprecated `"node"`. Mixed `moduleResolution` across referenced projects is safe because TypeScript compiles each project in isolation against its declared references' emitted `.d.ts` files — not against the source files of other projects.

**`react-native.json`** — extends `base.json`; adds RN JSX config:
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-native",
    "lib": ["ES2022", "DOM"]
  }
}
```

`"jsx": "react-native"` uses the **classic** React JSX transform (not the automatic runtime). This means every `.tsx` file in `@clmm/app` and `@clmm/ui` must include `import React from 'react'` explicitly. Do not configure `jsxImportSource` — it is not compatible with `"jsx": "react-native"`.

**`vitest.config.base.ts`** — lives in `packages/config/typescript/`, exported as a factory function:

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
        thresholds: { lines: 0, branches: 0, functions: 0, statements: 0 },
      },
    },
  });
}
```

### Per-package `tsconfig.json` structure

Each package `tsconfig.json` follows this pattern:

```json
{
  "extends": "../../packages/config/typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@clmm/domain": ["../domain/src/index.ts"],
      "@clmm/application": ["../application/src/index.ts"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../domain" },
    { "path": "../application" }
  ]
}
```

**`paths` aliases** must be defined in each package's own `tsconfig.json` (not only in a root config) so that TypeScript resolves workspace imports to `src/index.ts` of the referenced package during development without requiring a prior `tsc --build`. The alias pattern is always `"@clmm/<name>": ["../<name>/src/index.ts"]` (relative from the consuming package's location in `packages/`). For `apps/app`, the path is `"@clmm/<name>": ["../../packages/<name>/src/index.ts"]`.

### Per-package reference table

| Package | Extends | `references` declared | `paths` aliases declared |
|---|---|---|---|
| `@clmm/domain` | `base.json` | _(none)_ | _(none)_ |
| `@clmm/application` | `base.json` | `@clmm/domain` | `@clmm/domain` |
| `@clmm/adapters` | `node.json` | `@clmm/application`, `@clmm/domain` | `@clmm/application`, `@clmm/domain` |
| `@clmm/ui` | `react-native.json` | `@clmm/application` | `@clmm/application` |
| `@clmm/app` | `react-native.json` | `@clmm/ui`, `@clmm/application`, `@clmm/config` | `@clmm/ui`, `@clmm/application`, `@clmm/config` |
| `@clmm/testing` | `base.json` | `@clmm/domain`, `@clmm/application`, `@clmm/adapters`, `@clmm/ui` | all four |
| `@clmm/config` | `base.json` | _(none)_ | _(none)_ |

The root `tsconfig.json` is a solution file only — no `compilerOptions.include`, no `compilerOptions.paths`. It contains only `references` pointing to each package directory.

`tsc --build` at the root fails if any package tries to import from a package not declared in its `references` array.

### Per-package `package.json` `main` and `exports` fields

Every package must declare where its public entrypoint lives so that pnpm workspace resolution and TypeScript `paths` agree:

```json
{
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

This applies to `@clmm/domain`, `@clmm/application`, `@clmm/adapters`, `@clmm/ui`, `@clmm/config`, and `@clmm/testing`. `@clmm/app` is a host shell and does not need `exports`.

---

## Section 3: Import Boundary Enforcement

Two complementary layers — TypeScript catches violations at compile time, these catch them at lint time with human-readable error messages.

### dependency-cruiser

Config file: `packages/config/boundaries/dependency-cruiser.cjs`
Consumed via root `.dependency-cruiser.cjs`:
```javascript
module.exports = require('./packages/config/boundaries/dependency-cruiser.cjs');
```

Rules:

| Rule name | What it forbids |
|---|---|
| `domain-no-external` | Any file in `packages/domain/src` importing from outside `packages/domain` |
| `application-no-infra` | Any file in `packages/application/src` importing from `packages/adapters`, `@solana/*`, `@orca-so/*`, `react`, `react-native`, `expo`, or any `expo-*` package |
| `ui-no-adapters` | Any file in `packages/ui/src` importing from `packages/adapters`, `@solana/*`, `@orca-so/*`, `drizzle-orm`, or `pg-boss` |
| `app-shell-one-composition-path` | Any file in `apps/app` other than `apps/app/src/composition/client.ts` importing from `packages/adapters` |
| `testing-public-apis-only` | Any file in `packages/testing/src` importing via a path that resolves to `packages/*/src/**` other than the package's own `src/index.ts` (no deep imports) |

**Note on `app-shell-one-composition-path`:** `@clmm/adapters` is not in `apps/app`'s `package.json` in Sequence 1, so this rule will not fire in Sequence 1. It is a forward guard that activates if/when `@clmm/adapters` is added to `apps/app`'s declared dependencies in a later sequence.

Each package's `package.json` `boundaries` script:
- `packages/*`: `"depcruise src --config ../../.dependency-cruiser.cjs"`
- `apps/app`: `"depcruise app src --config ../../.dependency-cruiser.cjs"`

### ESLint

Config presets in `packages/config/eslint/`:

- **`base.js`** — TypeScript ESLint + import plugin + `no-restricted-imports` rules + banned-concept rule. Used by domain, application, testing.
- **`node.js`** — extends `base.js`. Used by adapters.
- **`react-native.js`** — extends `base.js`. Used by ui, app.

Each package has an `eslint.config.js` (flat config format) that imports the appropriate preset.

### `no-restricted-imports` patterns per package type

These patterns are in addition to whatever the specific package's rules require. They encode the same layer violations as dependency-cruiser for belt-and-suspenders enforcement.

**Applied to `@clmm/domain`** (via `base.js`):
```javascript
{ patterns: ['@clmm/adapters', '@clmm/adapters/*', '@solana/*', '@orca-so/*', 'react', 'react-native', 'expo', 'expo-*', '@nestjs/*', 'drizzle-orm', 'pg-boss'] }
```

**Applied to `@clmm/application`** (via `base.js`, same as domain plus adapters):
```javascript
{ patterns: ['@clmm/adapters', '@clmm/adapters/*', '@solana/*', '@orca-so/*', 'react', 'react-native', 'expo', 'expo-*', '@nestjs/*', 'drizzle-orm', 'pg-boss'] }
```

**Applied to `@clmm/ui`** (via `react-native.js`):
```javascript
{ patterns: ['@clmm/adapters', '@clmm/adapters/*', '@solana/*', '@orca-so/*', 'drizzle-orm', 'pg-boss'] }
```

**Applied to `@clmm/app`** (via `react-native.js`):
```javascript
{ patterns: ['@clmm/adapters/src/inbound', '@clmm/adapters/src/inbound/*'] }
```
(Blocks direct inbound handler imports; composition import via `src/composition/client.ts` is permitted.)

### Banned-concept ESLint rule

Added to `base.js` (applies to all packages via inheritance). Uses `no-restricted-syntax` with precise AST selectors to target declaration identifiers only — not general `Identifier` nodes (which would produce false positives on any identifier).

The exact selectors:

```javascript
{
  selector: 'ClassDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
  message: 'Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.'
},
{
  selector: 'TSTypeAliasDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
  message: 'Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.'
},
{
  selector: 'TSInterfaceDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
  message: 'Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.'
},
{
  selector: 'TSEnumDeclaration[id.name=/^(Receipt|Attestation|Proof|ClaimVerification|OnChainHistory|CanonicalExecutionCertificate)/]',
  message: 'Banned architectural concept. See CLAUDE.md: no on-chain receipt/attestation subsystem.'
}
```

These selectors match on the exact **declaration name** using a regex. They fire on `class Receipt`, `type Receipt`, `interface Receipt`, and `enum Receipt`. They do NOT fire on a variable named `receiptData` or a string containing "proof". This is exact declaration-name matching, not substring matching.

---

## Section 4: Shared Testing Harness (`packages/testing`)

### What Sequence 1 creates

```
packages/testing/
  package.json           @clmm/testing; deps: @clmm/domain, @clmm/application,
                         @clmm/adapters, @clmm/ui (all workspace:*)
  tsconfig.json          extends base.json; composite: true; references all four packages
  vitest.config.ts       imports createVitestConfig from @clmm/config, calls it with __dirname
  src/
    index.ts             empty barrel: export {}
    fakes/
      .gitkeep           marks approved location; no implementations until Sequence 3
    contracts/
      .gitkeep           marks approved location; no contract tests until Sequence 3
    fixtures/
      .gitkeep           marks approved location; no fixtures until Sequence 5
    scenarios/
      README.md          (see content below)
```

### `scenarios/README.md` content

The README must define the naming contract so Sequence 2 agents know exactly where to add helpers:

```markdown
# Scenario Helpers

This directory contains scenario harness helpers for story-by-story testing.

## Naming Convention

Each scenario helper file is named after the breach direction it exercises:
- `lower-bound-breach.ts` — helpers for testing the downside breach path (SOL -> USDC)
- `upper-bound-breach.ts` — helpers for testing the upside breach path (USDC -> SOL)

## What Goes Here

Sequence 2 adds: domain-level position + trigger builders for each breach direction.
Sequence 3 adds: application-level scenario orchestrators using fake ports.

## Usage

Import from the package barrel only:
  import { lowerBoundBreachScenario } from '@clmm/testing';
Never import directly from this subdirectory.
```

### What Sequence 1 does NOT create

- No fake port implementations (ports not defined until Sequence 3)
- No fixtures (no external API calls until Sequence 5)
- No scenario harness implementations (require domain types from Sequence 2)

### `vitest.config.ts` per-package pattern

```typescript
import { createVitestConfig } from '@clmm/config/typescript/vitest.config.base';
export default createVitestConfig(__dirname);
```

Coverage thresholds are `0` in the base for Sequence 1. `packages/domain`'s `vitest.config.ts` will override coverage thresholds for `DirectionalExitPolicyService` when that service is implemented in Sequence 2.

---

## Section 5: Runtime Skeletons

### `apps/app` — Expo SDK 52 universal shell

**`package.json`:**
```json
{
  "name": "@clmm/app",
  "private": true,
  "dependencies": {
    "expo": "~52.0.0",
    "expo-router": "~4.0.0",
    "react": "18.3.1",
    "react-native": "0.76.x",
    "@clmm/ui": "workspace:*",
    "@clmm/application": "workspace:*",
    "@clmm/config": "workspace:*"
  }
}
```

`@clmm/adapters` is NOT listed as a dependency.

**`app.json`:**
```json
{
  "expo": {
    "name": "CLMM V2",
    "slug": "clmm-v2",
    "scheme": "clmmv2",
    "version": "1.0.0",
    "platforms": ["ios", "android", "web"],
    "web": { "output": "static", "bundler": "metro" }
  }
}
```

`scheme: "clmmv2"` is set now because Expo Router deep link and MWA wallet return handling in Sequence 7 requires it to be defined from the start.

**`app/_layout.tsx`:**
```tsx
import React from 'react';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
```

Explicit `import React from 'react'` is required because `"jsx": "react-native"` uses the classic runtime.

**`app/index.tsx`:**
```tsx
import React from 'react';
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View>
      <Text>CLMM V2</Text>
    </View>
  );
}
```

**`src/composition/client.ts`:**
```typescript
// Approved adapter composition root.
// This is the ONLY file in apps/app permitted to import from @clmm/adapters.
// Currently a placeholder — wired in Sequence 7.
export {};
```

### `packages/adapters` — NestJS BFF and Worker

**`package.json`** (relevant section):
```json
{
  "name": "@clmm/adapters",
  "private": true,
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/domain": "workspace:*",
    "@nestjs/core": "^10.0.0",
    "@nestjs/common": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "reflect-metadata": "^0.2.0"
  }
}
```

**`src/index.ts`** (public entrypoint):
```typescript
// Public adapter entrypoint.
// Sequence 4+ adds exports here as adapters are implemented.
export {};
```

**`src/inbound/http/main.ts`:**
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
}

void bootstrap();
```

`import 'reflect-metadata'` must be the first import. It is required by NestJS's decorator metadata system.

**`src/inbound/http/app.module.ts`:**
```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

**`src/inbound/jobs/main.ts`:**
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();
}

void bootstrap();
```

Worker uses `createApplicationContext` (not `create`) because it runs without HTTP.

**`src/inbound/jobs/worker.module.ts`:**
```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  providers: [],
})
export class WorkerModule {}
```

**`src/composition/index.ts`:**
```typescript
// NestJS module wiring root.
// Populated in Sequence 4+ as adapters are implemented.
export {};
```

### Runtime separation constraint

`apps/app`, `packages/ui`, and `packages/application` must never transitively import `packages/adapters/src/inbound/http` or `packages/adapters/src/inbound/jobs`. Enforced by:
1. `app-shell-one-composition-path` dep-cruiser rule (blocks adapter imports from non-composition files in `apps/app`)
2. `no-restricted-imports` ESLint rule blocking `@clmm/adapters/src/inbound` and `@clmm/adapters/src/inbound/*` in client packages

---

## Section 6: GitHub Actions CI Pipeline

### Workflow file: `.github/workflows/ci.yml`

**Triggers:** `push` and `pull_request` on all branches.

**Single job: `ci`** on `ubuntu-latest`:

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: actions/setup-node@v4
    with:
      node-version-file: .nvmrc

  - uses: pnpm/action-setup@v4
    # version read from root package.json packageManager field automatically

  - uses: actions/cache@v4
    with:
      path: .turbo
      key: turbo-${{ runner.os }}-${{ github.sha }}
      restore-keys: |
        turbo-${{ runner.os }}-

  - run: pnpm install --frozen-lockfile

  - run: pnpm build
    # turbo run build — tsc --build in dependency order

  - run: pnpm typecheck
    # turbo run typecheck — tsc --noEmit all packages

  - run: pnpm lint
    # turbo run lint — ESLint: boundary rules + banned-concept rule

  - run: pnpm boundaries
    # turbo run boundaries — dependency-cruiser all packages

  - run: pnpm test
    # turbo run test — Vitest all packages (trivially passes; no code yet)
```

The `restore-keys: turbo-${{ runner.os }}-` fallback allows CI to restore `.turbo` cache from previous commits on the same OS, so Turborepo's task input hashing still benefits from prior run caches.

### Failure contract

| Violation | Step that fails |
|---|---|
| Forbidden inter-package import | `pnpm lint` (ESLint `no-restricted-imports`) AND `pnpm boundaries` (dep-cruiser) |
| Banned concept declaration name | `pnpm lint` (ESLint `no-restricted-syntax`) |
| TypeScript type error or reference violation | `pnpm typecheck` |
| Missing `composite: true` or broken `references` | `pnpm build` (tsc --build) |

### Not included in Sequence 1

- Railway deployment steps
- EAS / Expo build or submit steps
- E2E tests
- Turbo Remote Cache (no secrets required yet)
- Environment secrets (no real adapters)
- Branch protection rules (configured in GitHub repo settings, not in this spec)

---

## Acceptance Criteria (from Epic 1 stories)

### Story 1.1 — Workspace and compile graph
- Given a clean checkout, when workspace manifests and package directories are created, then only the approved top-level structure exists: `apps/app`, `packages/domain`, `packages/application`, `packages/adapters`, `packages/ui`, `packages/config`, `packages/testing`, `docs/architecture`.
- Given TypeScript project references are configured with `composite: true`, when `pnpm build` is run, then the compile graph permits exactly the allowed import directions and fails on violations.
- Given `paths` aliases are defined per-package, when a package imports `@clmm/domain` during development, then TypeScript resolves it to `packages/domain/src/index.ts` without requiring a prior build.

### Story 1.2 — CI boundary enforcement
- Given dependency-cruiser and ESLint rules are configured, when a forbidden import is introduced (e.g., `@clmm/application` importing `@clmm/adapters`), then `pnpm lint` and `pnpm boundaries` both fail.
- Given banned-concept scanning is configured, when a declaration named `Receipt`, `Attestation`, `Proof`, `ClaimVerification`, `OnChainHistory`, or `CanonicalExecutionCertificate` is introduced, then `pnpm lint` fails.
- Given the app-shell exception is narrow, when any file in `apps/app` other than `src/composition/client.ts` imports from `@clmm/adapters`, then `pnpm boundaries` fails.

### Story 1.3 — Shared testing harness
- Given the testing package exists with `composite: true` and correct `references`, when later stories import from `@clmm/testing`, then they import from the public barrel only (no deep imports to `src/fakes/` etc.).
- Given `scenarios/README.md` defines the `lower-bound-breach.ts` / `upper-bound-breach.ts` naming contract, when Sequence 2 adds domain helpers, then the file placement is unambiguous.
- Given the test harness is reviewed, then no `Receipt`, `Attestation`, `Proof`, `ClaimVerification`, `OnChainHistory`, or `CanonicalExecutionCertificate` identifiers exist in any file.

### Story 1.4 — Runtime skeletons
- Given the frozen repo structure, when runtime skeletons are added, then client code lives under `apps/app`, BFF entrypoints under `packages/adapters/src/inbound/http`, and worker entrypoints under `packages/adapters/src/inbound/jobs`.
- Given `reflect-metadata` is the first import in both NestJS `main.ts` files, when the BFF and worker are started with `node dist/inbound/http/main.js` and `node dist/inbound/jobs/main.js` respectively, then they boot without error.
- Given `"jsx": "react-native"` is used (classic transform), when `_layout.tsx` and `index.tsx` are compiled, then they include explicit `import React from 'react'` and compile without error.
- Given runtime separation is required, when server-only inbound entrypoints are inspected, then they are not reachable via `@clmm/app`, `@clmm/ui`, or `@clmm/application` import paths.

---

## Out of Scope for Sequence 1

- Domain types, entities, value objects, or services (Sequence 2)
- Application ports or DTOs (Sequence 3)
- Drizzle schema or database connections (Sequence 4)
- Any Solana, Orca, or Jupiter SDK imports (Sequence 5+)
- Expo Push Notification or MWA configuration (Sequence 7–8)
- UI screens, components, or design system (Sequence 9)
- Railway environment secrets or deployment configuration
- Turbo Remote Cache configuration
- Branch protection rules or CODEOWNERS
