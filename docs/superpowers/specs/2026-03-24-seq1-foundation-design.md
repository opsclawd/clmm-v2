# Sequence 1: Foundation and Boundary Enforcement — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Covers:** Epic 1, Stories 1.1–1.4
**Sequence:** 1 of 9

---

## Purpose

Establish the frozen monorepo structure, TypeScript compile graph, import boundary enforcement, shared testing harness, runtime skeletons, and CI pipeline before any business code is written.

**Done when:** A fresh GitHub Actions run passes all pipeline steps on a clean repo. Introducing a deliberate layer violation (e.g., importing `@clmm/adapters` from `packages/domain`) causes `pnpm lint` and `pnpm boundaries` to fail. Removing the violation makes the run green. No business types, domain logic, or adapter implementations exist yet.

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
| `package.json` | pnpm workspace root; `private: true`; declares `packageManager` with pinned pnpm version; root-level `devDependencies` for turbo, typescript, and shared tooling only; no `dependencies` |
| `pnpm-workspace.yaml` | Declares `packages: ["apps/*", "packages/*"]` — exactly these two globs, no others |
| `turbo.json` | Pipeline task definitions (see CI section) |
| `.nvmrc` | `20` — pins Node.js major version |
| `.node-version` | `20` — redundant pin for tools that read this file |
| `.npmrc` | `shamefully-hoist=false`, `strict-peer-dependencies=false` |
| `.gitignore` | Standard Node / Turbo / Expo ignores |

### Package directories created

```
apps/
  app/                   @clmm/app

packages/
  domain/                @clmm/domain
  application/           @clmm/application
  adapters/              @clmm/adapters
  ui/                    @clmm/ui
  config/                @clmm/config
  testing/               @clmm/testing

docs/
  architecture/
    adr/                 (empty, placeholder directory)
    context-map.md       (placeholder)
    dependency-rules.md  (placeholder)
    event-catalog.md     (placeholder)
```

### Per-package `package.json` shape

Every package is `"private": true`. Declared inter-package dependencies use workspace protocol (`"@clmm/domain": "workspace:*"`). No package declares a dependency it is not permitted to import per the dependency rules.

Permitted declared dependencies per package:

| Package | May declare as dependency |
|---|---|
| `@clmm/domain` | none (no inter-package deps) |
| `@clmm/application` | `@clmm/domain` |
| `@clmm/adapters` | `@clmm/application`, `@clmm/domain`, approved external SDKs |
| `@clmm/ui` | `@clmm/application` |
| `@clmm/app` | `@clmm/ui`, `@clmm/application`, `@clmm/config` |
| `@clmm/testing` | `@clmm/domain`, `@clmm/application`, `@clmm/adapters`, `@clmm/ui` |
| `@clmm/config` | none |

`@clmm/app` does NOT declare `@clmm/adapters` as a dependency. The one approved composition entrypoint (`src/composition/client.ts`) accesses adapter composition only if the composition bootstrap explicitly re-exports from `@clmm/adapters` — this is enforced by the boundary rules, not by `package.json` alone.

### `turbo.json` pipeline

```json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      { "dependsOn": [] },
    "boundaries":{ "dependsOn": [] },
    "test":      { "dependsOn": ["^build"] }
  }
}
```

Root scripts:

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
    "dev:api":    "turbo run dev --filter=@clmm/adapters --filter=http",
    "dev:worker": "turbo run dev --filter=@clmm/adapters --filter=jobs"
  }
}
```

---

## Section 2: TypeScript Compile Graph

### Base configs in `packages/config/typescript/`

**`base.json`**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "skipLibCheck": true,
    "isolatedModules": true
  }
}
```

**`node.json`** — extends `base.json`; overrides `module: "CommonJS"`, `moduleResolution: "node"` for NestJS runtimes.

**`react-native.json`** — extends `base.json`; adds `"jsx": "react-native"` and RN-appropriate lib entries.

**`vitest.config.base.ts`** — shared Vitest config extended by each package:
- `globals: true`
- `coverage.provider: "v8"`
- `include: ["src/**/*.test.ts"]`
- `coverage.thresholds` set to `0` in base (packages override as needed)

### Per-package `tsconfig.json` references

| Package | Extends | `references` |
|---|---|---|
| `@clmm/domain` | `base.json` | _(none)_ |
| `@clmm/application` | `base.json` | `@clmm/domain` |
| `@clmm/adapters` | `node.json` | `@clmm/application`, `@clmm/domain` |
| `@clmm/ui` | `react-native.json` | `@clmm/application` |
| `@clmm/app` | `react-native.json` | `@clmm/ui`, `@clmm/application`, `@clmm/config` |
| `@clmm/testing` | `base.json` | `@clmm/domain`, `@clmm/application`, `@clmm/adapters`, `@clmm/ui` |
| `@clmm/config` | `base.json` | _(none)_ |

The root `tsconfig.json` is a solution file only — no `include`, only `references` pointing to each package.

`paths` aliases are defined per-package so that `import { Foo } from '@clmm/domain'` resolves to `packages/domain/src/index.ts` during development without a prior build step.

`tsc --build` at the root fails if any package imports from a package not declared in its `references` array.

---

## Section 3: Import Boundary Enforcement

### dependency-cruiser

Config file: `packages/config/boundaries/dependency-cruiser.cjs`
Consumed via root `.dependency-cruiser.cjs` that requires the shared config.

Rules:

| Rule name | What it forbids |
|---|---|
| `domain-no-external` | `@clmm/domain` importing any package outside itself |
| `application-no-infra` | `@clmm/application` importing `@clmm/adapters`, any Solana SDK, React, React Native, or Expo |
| `ui-no-adapters` | `@clmm/ui` importing `@clmm/adapters`, Solana SDKs, or storage SDKs |
| `app-shell-one-composition-path` | `@clmm/app` importing `@clmm/adapters` from any file other than `src/composition/client.ts` |
| `testing-public-apis-only` | `@clmm/testing` deep-importing `src/` internals of other packages (must use package entrypoints only) |

Each package's `package.json` includes:
```json
"boundaries": "depcruise src --config ../../.dependency-cruiser.cjs"
```

### ESLint

Config presets in `packages/config/eslint/`:

- **`base.js`** — TypeScript ESLint + import plugin + `no-restricted-imports` rules encoding the same layer violations as dependency-cruiser + banned-concept rule (see below)
- **`node.js`** — extends `base.js`; NestJS-appropriate rules
- **`react-native.js`** — extends `base.js`; RN-appropriate rules

Each package has an `eslint.config.js` that imports the appropriate preset from `@clmm/config`.

### Banned-concept ESLint rule

Added to `base.js` using `no-restricted-syntax` targeting `Identifier` nodes:

Banned identifiers: `Receipt`, `Attestation`, `Proof`, `ClaimVerification`, `OnChainHistory`, `CanonicalExecutionCertificate`

This rule catches class declarations, interface declarations, type alias declarations, and variable names using these terms. Applied to all packages via `base.js`.

Error message template: `"'{{name}}' is a banned architectural concept. See CLAUDE.md for the prohibition on on-chain receipt/attestation subsystems."`

---

## Section 4: Shared Testing Harness (`packages/testing`)

### What Sequence 1 creates

```
packages/testing/
  package.json           @clmm/testing
  tsconfig.json          extends base.json; references all other packages
  vitest.config.ts       extends vitest.config.base.ts
  src/
    index.ts             empty barrel export
    fakes/               empty — populated in Sequence 3 when ports are defined
    contracts/           empty — populated in Sequence 3
    fixtures/            empty — populated in Sequence 5+ when external SDK calls exist
    scenarios/
      README.md          documents that lower-bound and upper-bound scenario helpers live here;
                         Sequence 2 agents add implementations alongside domain types
```

### What Sequence 1 does NOT create

- No fake port implementations (ports are not defined until Sequence 3)
- No fixtures (no external APIs touched until Sequence 5)
- No scenario harnesses (require domain types from Sequence 2)

### Test command per package

```json
"test": "vitest run --coverage"
```

Coverage threshold in `vitest.config.base.ts` is `0` for Sequence 1. `packages/domain` will set its own threshold to `100` for `DirectionalExitPolicyService` when that service is implemented in Sequence 2.

---

## Section 5: Runtime Skeletons

### `apps/app` — Expo SDK 52 universal shell

```
apps/app/
  package.json           @clmm/app; deps: expo@~52.0.0, expo-router, react, react-native,
                         @clmm/ui (workspace), @clmm/application (workspace), @clmm/config (workspace)
                         NOT @clmm/adapters
  app.json               name: "CLMM V2", slug: "clmm-v2", scheme: "clmmv2",
                         web: { output: "static", bundler: "metro" }
  tsconfig.json          extends @clmm/config react-native base
  app/
    _layout.tsx          Expo Router root layout — bare Stack navigator
    index.tsx            placeholder screen: renders <Text>CLMM V2</Text>
  src/
    composition/
      client.ts          placeholder composition root — the one approved file
                         permitted to import from @clmm/adapters composition
    platform/
      .gitkeep           marks approved location for native/web edge logic
```

`app.json` sets `scheme: "clmmv2"` for deep link registration — needed in Sequence 7 for MWA wallet return handling.

### `packages/adapters/src/inbound/http` — NestJS BFF

```
packages/adapters/src/inbound/http/
  main.ts                NestFactory.create(AppModule); listens on PORT env var (default 3000)
  app.module.ts          @Module({ imports: [], controllers: [], providers: [] })
```

NestJS packages (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) are declared as `dependencies` of `@clmm/adapters` (they are runtime deps for the BFF process, not devDeps).

### `packages/adapters/src/inbound/jobs` — NestJS Worker

```
packages/adapters/src/inbound/jobs/
  main.ts                NestFactory.create(WorkerModule); standalone context (no HTTP)
  worker.module.ts       @Module({ imports: [], providers: [] })
```

### `packages/adapters/src/composition/`

```
  index.ts               placeholder — will wire NestJS modules in Sequence 4+
```

### Runtime separation constraint

`apps/app`, `packages/ui`, and `packages/application/src/public/` must never transitively import `packages/adapters/src/inbound/http` or `packages/adapters/src/inbound/jobs`. These are server-only entry files. This is enforced by:
1. The `app-shell-one-composition-path` dep-cruiser rule
2. The `no-restricted-imports` ESLint rule blocking `@clmm/adapters/src/inbound` from client packages

---

## Section 6: GitHub Actions CI Pipeline

### Workflow file: `.github/workflows/ci.yml`

**Triggers:** `push` and `pull_request` on all branches.

**Single job: `ci`** on `ubuntu-latest`:

```
steps:
  1. actions/checkout@v4
  2. actions/setup-node@v4 with node-version-file: .nvmrc
  3. pnpm/action-setup (version from root package.json packageManager field)
  4. actions/cache for .turbo (key: turbo-${{ runner.os }}-${{ github.sha }})
  5. pnpm install --frozen-lockfile
  6. pnpm build        (turbo run build — compile graph in dependency order)
  7. pnpm typecheck    (turbo run typecheck — tsc --noEmit all packages)
  8. pnpm lint         (turbo run lint — ESLint: boundary rules + banned-concept rule)
  9. pnpm boundaries   (turbo run boundaries — dependency-cruiser all packages)
  10. pnpm test        (turbo run test — Vitest all packages; trivially passes with no code)
```

**Failure contract:**

| Violation | Step that fails |
|---|---|
| Forbidden inter-package import | `pnpm lint` (ESLint) AND `pnpm boundaries` (dep-cruiser) |
| Banned concept identifier | `pnpm lint` (ESLint banned-concept rule) |
| TypeScript type error violating project references | `pnpm typecheck` |
| Compile graph reference violation | `pnpm build` (tsc --build) |

**Not included in Sequence 1:**
- Railway deployment steps
- EAS / Expo build steps
- E2E tests
- Turbo Remote Cache (no secrets required yet)
- Environment secrets (no real adapters)

---

## Acceptance Criteria (from Epic 1 stories)

### Story 1.1 — Workspace and compile graph
- Given a clean checkout, when workspace manifests and package directories are created, then only the approved top-level structure exists.
- Given TypeScript project references are configured, when a workspace build is run, then the compile graph permits exactly the allowed import directions and forbids all others.

### Story 1.2 — CI boundary enforcement
- Given dependency-cruiser and ESLint rules are configured, when a forbidden import is introduced (e.g., `@clmm/application` importing `@clmm/adapters`), then CI fails.
- Given banned-concept scanning is configured, when code introduces `Receipt`, `Attestation`, `Proof`, `ClaimVerification`, `OnChainHistory`, or `CanonicalExecutionCertificate`, then CI fails.
- Given the app-shell exception is narrow, when any file outside `src/composition/client.ts` in `apps/app` imports `@clmm/adapters`, then CI fails.

### Story 1.3 — Shared testing harness
- Given the testing package exists, when later stories import fake ports and fixtures, then they do so from `@clmm/testing` public barrel only (no deep imports).
- Given shared scenario helpers are documented, when domain and application tests are added in Sequences 2–3, then they can model lower-bound and upper-bound paths independently.
- Given the test harness is reviewed, then no on-chain receipt, attestation, claim, or proof helpers exist.

### Story 1.4 — Runtime skeletons
- Given the frozen repo structure, when runtime skeletons are added, then client code lives under `apps/app`, BFF entrypoints under `packages/adapters/src/inbound/http`, and worker entrypoints under `packages/adapters/src/inbound/jobs`.
- Given the host shell boundary is frozen, when `apps/app` is inspected, then it owns route files, platform bootstrap, and one client composition bootstrap only.
- Given runtime separation is required, when server-only code is inspected, then it is not importable from `packages/ui`, `packages/application/src/public/`, or client bundles.
- Given future sequences use these entrypoints, when they add behavior, then they do so without creating new top-level app directories or changing the approved structure.

---

## Out of Scope for Sequence 1

- Domain types, entities, value objects, or services (Sequence 2)
- Application ports or DTOs (Sequence 3)
- Drizzle schema or database connections (Sequence 4)
- Any Solana, Orca, or Jupiter SDK imports (Sequence 5+)
- Expo Push Notification or MWA configuration (Sequence 7–8)
- UI screens, components, or design system (Sequence 9)
- Railway environment secrets or deployment configuration
- Turbo Remote Cache
