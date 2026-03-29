# CLMM V2 — Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 5 blocking audit failures (app build, UI→domain boundary violation, co-located tests, missing devDep, missing CI) and address DRIFT-1 (adapter ESLint) + DRIFT-8 (testing dep type).

**Architecture:** The remediation touches 6 independent areas: Metro bundler resolution, UI import boundary enforcement (dep-cruiser + ESLint + re-exports), test file co-location, package.json dependency corrections, CI pipeline creation, and ESLint adapter strictness. Each task produces independently verifiable results.

**Tech Stack:** TypeScript, Expo SDK 52 / Metro bundler, Vitest, dependency-cruiser, ESLint, GitHub Actions, pnpm workspaces, Turborepo

---

## File Map

### Task 1 — Fix App Build (FAIL-1)
- **Create:** `apps/app/metro.config.js`
- **Verify:** `packages/ui/src/index.ts` (read-only — confirm `.js` imports)

### Task 2 — Re-export Domain Types via Application Public Barrel (FAIL-2, part 1)
- **Modify:** `packages/application/src/public/index.ts`

### Task 3 — Update UI Source Files to Import from Application (FAIL-2, part 2)
- **Modify:** `packages/ui/src/components/DirectionalPolicyCardUtils.ts`
- **Modify:** `packages/ui/src/components/DirectionalPolicyCard.tsx`
- **Modify:** `packages/ui/src/components/PreviewStepSequenceUtils.ts`
- **Modify:** `packages/ui/src/components/PreviewStepSequence.tsx`
- **Modify:** `packages/ui/src/view-models/ExecutionStateViewModel.ts`

### Task 4 — Update UI Test Files to Import from Application (FAIL-2, part 3)
- **Modify:** `packages/ui/src/components/DirectionalPolicyCard.test.ts`
- **Modify:** `packages/ui/src/components/PreviewStepSequence.test.ts`
- **Modify:** `packages/ui/src/view-models/ExecutionStateViewModel.test.ts`
- **Modify:** `packages/ui/src/view-models/PreviewViewModel.test.ts`

### Task 5 — Add UI→Domain Boundary Enforcement (FAIL-2, part 4)
- **Modify:** `packages/config/boundaries/.dependency-cruiser.cjs`
- **Modify:** `packages/config/eslint/boundary-rules.js`

### Task 6 — Co-locate Application Use-Case Tests (FAIL-3)
- **Create:** `packages/application/src/use-cases/positions/ListSupportedPositions.test.ts`
- **Create:** `packages/application/src/use-cases/positions/GetPositionDetail.test.ts`
- **Create:** `packages/application/src/use-cases/positions/GetMonitoringReadiness.test.ts`
- **Create:** `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`
- **Create:** `packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts`
- **Create:** `packages/application/src/use-cases/previews/CreateExecutionPreview.test.ts`
- **Create:** `packages/application/src/use-cases/previews/GetExecutionPreview.test.ts`
- **Create:** `packages/application/src/use-cases/previews/RefreshExecutionPreview.test.ts`
- **Create:** `packages/application/src/use-cases/execution/ApproveExecution.test.ts`
- **Create:** `packages/application/src/use-cases/execution/ReconcileExecutionAttempt.test.ts`
- **Create:** `packages/application/src/use-cases/execution/GetExecutionAttemptDetail.test.ts`
- **Create:** `packages/application/src/use-cases/execution/GetExecutionHistory.test.ts`
- **Create:** `packages/application/src/use-cases/execution/RecordExecutionAbandonment.test.ts`
- **Create:** `packages/application/src/use-cases/execution/ResolveExecutionEntryContext.test.ts`
- **Create:** `packages/application/src/use-cases/execution/RequestWalletSignature.test.ts`
- **Create:** `packages/application/src/use-cases/execution/SubmitExecutionAttempt.test.ts`
- **Create:** `packages/application/src/use-cases/execution/RecordSignatureDecline.test.ts`
- **Create:** `packages/application/src/use-cases/execution/ResumeExecutionAttempt.test.ts`
- **Create:** `packages/application/src/use-cases/notifications/DispatchActionableNotification.test.ts`
- **Create:** `packages/application/src/use-cases/wallet/ConnectWalletSession.test.ts`
- **Create:** `packages/application/src/use-cases/wallet/SyncPlatformCapabilities.test.ts`
- **Create:** `packages/application/src/use-cases/alerts/AcknowledgeAlert.test.ts`
- **Create:** `packages/application/src/use-cases/alerts/ListActionableAlerts.test.ts`
- **Remove from testing barrel:** `packages/testing/src/scenarios/index.ts` (remove per-use-case re-exports; keep integration scenarios)
- **Modify:** `packages/application/package.json` (add devDep)
- **Modify:** `packages/testing/package.json` (fix dep type)

### Task 7 — Add CI Configuration (FAIL-5)
- **Create:** `.github/workflows/ci.yml`

### Task 8 — Tighten ESLint for Adapters (DRIFT-1)
- **Modify:** `packages/config/eslint/index.js`
- **Modify:** `packages/adapters/src/outbound/wallet-signing/NativeWalletSigningAdapter.ts`
- **Modify:** `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts`
- **Modify:** `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`
- **Modify:** `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`
- **Modify:** `packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.test.ts`

---

## Task 1: Fix App Build — Metro Resolution (FAIL-1)

**Problem:** `pnpm run build` exits 1. Metro bundler cannot resolve `./screens/PositionsListScreen.js` from `packages/ui/src/index.ts`. The screen files exist as `.tsx` but Metro does not follow TypeScript's `.js` → `.tsx` convention.

**Root cause:** `packages/ui/src/index.ts` uses `.js` extension imports (standard for `moduleResolution: "bundler"`), but no `metro.config.js` exists in `apps/app/`. Expo's default Metro config does not resolve `.js` → `.tsx` across monorepo workspace packages.

**Fix:** Create a Metro config that enables sourceExts resolution and adds monorepo watchFolders.

**Files:**
- Create: `apps/app/metro.config.js`

- [ ] **Step 1: Create `apps/app/metro.config.js`**

```js
// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all packages in the monorepo
config.watchFolders = [monorepoRoot];

// Resolve packages from both the app and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure Metro resolves .ts/.tsx when imports use .js extension
// (TypeScript moduleResolution: "bundler" emits .js extensions that Metro must map back)
config.resolver.sourceExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'cjs', 'mjs'];

// Ensure .ts and .tsx are resolved before .js and .jsx
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // If the import ends with .js, try .ts/.tsx first
  if (moduleName.endsWith('.js')) {
    const tsName = moduleName.replace(/\.js$/, '.ts');
    const tsxName = moduleName.replace(/\.js$/, '.tsx');

    for (const candidate of [tsxName, tsName]) {
      try {
        return context.resolveRequest(context, candidate, platform);
      } catch {
        // Try next candidate
      }
    }
  }

  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
```

- [ ] **Step 2: Verify the app build passes**

Run: `pnpm run build`
Expected: Exit code 0. Metro successfully resolves all `.js` imports to their `.tsx`/`.ts` source files.

If this still fails, check the error message. Common issue: recursive resolution. If `context.resolveRequest` recurses infinitely, replace the custom `resolveRequest` with this simpler approach — remove the `resolveRequest` override entirely and instead change the UI barrel (`packages/ui/src/index.ts`) to use extensionless imports:

```ts
// Fallback fix if Metro resolveRequest recurses:
// Change packages/ui/src/index.ts imports from:
//   export { PositionsListScreen } from './screens/PositionsListScreen.js';
// to:
//   export { PositionsListScreen } from './screens/PositionsListScreen';
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `pnpm run test`
Expected: All 193 tests pass (exit 0).

- [ ] **Step 4: Commit**

```bash
git add apps/app/metro.config.js
git commit -m "fix: add Metro config for .js→.tsx resolution in monorepo (FAIL-1)"
```

---

## Task 2: Re-export Domain Types via Application Public Barrel (FAIL-2, part 1)

**Problem:** 9 files in `packages/ui/src/` import directly from `@clmm/domain`, violating the rule that UI must only import from `@clmm/application/public`. Before we can update those imports, the needed symbols must be available from the application barrel.

**Symbols needed by UI source files (production):**
- `BreachDirection` (type) — used in `DirectionalPolicyCard.tsx`, `DirectionalPolicyCardUtils.ts`, `PreviewStepSequenceUtils.ts`, `PreviewStepSequence.tsx`
- `applyDirectionalExitPolicy` (value) — used in `DirectionalPolicyCardUtils.ts`
- `DirectionalExitPolicyResult` (type) — return type of `applyDirectionalExitPolicy`
- `ExecutionLifecycleState` (type) — used in `ExecutionStateViewModel.ts`

**Symbols needed by UI test files:**
- `LOWER_BOUND_BREACH` (value constant) — used in 3 test files
- `UPPER_BOUND_BREACH` (value constant) — used in 3 test files
- `makeClockTimestamp` (value function) — used in `PreviewViewModel.test.ts`
- `makePositionId` (value function) — used in `PreviewViewModel.test.ts`

**Files:**
- Modify: `packages/application/src/public/index.ts`

- [ ] **Step 1: Add domain re-exports to the application public barrel**

Replace the entire file `packages/application/src/public/index.ts` with:

```ts
// This is the ONLY import surface for packages/ui.
// Do not add implementation details here.

// DTOs
export type {
  PositionSummaryDto,
  PositionDetailDto,
  ExecutionPreviewDto,
  PreviewStepDto,
  ExecutionAttemptDto,
  ActionableAlertDto,
  HistoryEventDto,
  MonitoringReadinessDto,
  EntryContextDto,
} from '../dto/index.js';

// Port types needed by UI (capability + permission state)
export type { PlatformCapabilityState } from '../ports/index.js';

// Domain types re-exported for UI consumption.
// UI must NEVER import @clmm/domain directly.
export type {
  BreachDirection,
  ExecutionLifecycleState,
  DirectionalExitPolicyResult,
} from '@clmm/domain';

export {
  applyDirectionalExitPolicy,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  makeClockTimestamp,
  makePositionId,
} from '@clmm/domain';
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: Exit 0. The re-exports resolve correctly through the application→domain dependency.

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/public/index.ts
git commit -m "feat: re-export domain types through application public barrel for UI consumption (FAIL-2 prep)"
```

---

## Task 3: Update UI Source Files to Import from Application (FAIL-2, part 2)

**Problem:** 5 production source files in `packages/ui/src/` import from `@clmm/domain`. Each must be changed to import from `@clmm/application/public`.

**Files:**
- Modify: `packages/ui/src/components/DirectionalPolicyCardUtils.ts`
- Modify: `packages/ui/src/components/DirectionalPolicyCard.tsx`
- Modify: `packages/ui/src/components/PreviewStepSequenceUtils.ts`
- Modify: `packages/ui/src/components/PreviewStepSequence.tsx`
- Modify: `packages/ui/src/view-models/ExecutionStateViewModel.ts`

- [ ] **Step 1: Update `DirectionalPolicyCardUtils.ts`**

Replace lines 1–2 of `packages/ui/src/components/DirectionalPolicyCardUtils.ts`:

```ts
import type { BreachDirection } from '@clmm/domain';
import { applyDirectionalExitPolicy } from '@clmm/domain';
```

With:

```ts
import type { BreachDirection } from '@clmm/application/public';
import { applyDirectionalExitPolicy } from '@clmm/application/public';
```

- [ ] **Step 2: Update `DirectionalPolicyCard.tsx`**

Replace line 2 of `packages/ui/src/components/DirectionalPolicyCard.tsx`:

```ts
import type { BreachDirection } from '@clmm/domain';
```

With:

```ts
import type { BreachDirection } from '@clmm/application/public';
```

- [ ] **Step 3: Update `PreviewStepSequenceUtils.ts`**

Replace line 1 of `packages/ui/src/components/PreviewStepSequenceUtils.ts`:

```ts
import type { BreachDirection } from '@clmm/domain';
```

With:

```ts
import type { BreachDirection } from '@clmm/application/public';
```

- [ ] **Step 4: Update `PreviewStepSequence.tsx`**

Replace line 1 of `packages/ui/src/components/PreviewStepSequence.tsx`:

```ts
import type { BreachDirection } from '@clmm/domain';
```

With:

```ts
import type { BreachDirection } from '@clmm/application/public';
```

- [ ] **Step 5: Update `ExecutionStateViewModel.ts`**

Replace line 1 of `packages/ui/src/view-models/ExecutionStateViewModel.ts`:

```ts
import type { ExecutionLifecycleState } from '@clmm/domain';
```

With:

```ts
import type { ExecutionLifecycleState } from '@clmm/application/public';
```

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: Exit 0.

- [ ] **Step 7: Verify tests pass**

Run: `pnpm --filter @clmm/ui test`
Expected: All UI tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/DirectionalPolicyCardUtils.ts packages/ui/src/components/DirectionalPolicyCard.tsx packages/ui/src/components/PreviewStepSequenceUtils.ts packages/ui/src/components/PreviewStepSequence.tsx packages/ui/src/view-models/ExecutionStateViewModel.ts
git commit -m "fix: update UI source files to import from @clmm/application/public instead of @clmm/domain (FAIL-2)"
```

---

## Task 4: Update UI Test Files to Import from Application (FAIL-2, part 3)

**Problem:** 4 test files in `packages/ui/src/` import from `@clmm/domain`. They need constants and factory functions that are now available from `@clmm/application/public`.

**Files:**
- Modify: `packages/ui/src/components/DirectionalPolicyCard.test.ts`
- Modify: `packages/ui/src/components/PreviewStepSequence.test.ts`
- Modify: `packages/ui/src/view-models/ExecutionStateViewModel.test.ts`
- Modify: `packages/ui/src/view-models/PreviewViewModel.test.ts`

- [ ] **Step 1: Update `DirectionalPolicyCard.test.ts`**

Replace line 3 of `packages/ui/src/components/DirectionalPolicyCard.test.ts`:

```ts
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
```

With:

```ts
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/application/public';
```

- [ ] **Step 2: Update `PreviewStepSequence.test.ts`**

Replace line 3 of `packages/ui/src/components/PreviewStepSequence.test.ts`:

```ts
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';
```

With:

```ts
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/application/public';
```

- [ ] **Step 3: Update `ExecutionStateViewModel.test.ts`**

Replace line 3 of `packages/ui/src/view-models/ExecutionStateViewModel.test.ts`:

```ts
import type { ExecutionLifecycleState } from '@clmm/domain';
```

With:

```ts
import type { ExecutionLifecycleState } from '@clmm/application/public';
```

- [ ] **Step 4: Update `PreviewViewModel.test.ts`**

Replace line 3 of `packages/ui/src/view-models/PreviewViewModel.test.ts`:

```ts
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp, makePositionId } from '@clmm/domain';
```

With:

```ts
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp, makePositionId } from '@clmm/application/public';
```

- [ ] **Step 5: Verify no `@clmm/domain` imports remain in `packages/ui/src/`**

Run: `grep -r "@clmm/domain" packages/ui/src/`
Expected: Zero matches.

- [ ] **Step 6: Verify all tests pass**

Run: `pnpm --filter @clmm/ui test`
Expected: All UI tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/DirectionalPolicyCard.test.ts packages/ui/src/components/PreviewStepSequence.test.ts packages/ui/src/view-models/ExecutionStateViewModel.test.ts packages/ui/src/view-models/PreviewViewModel.test.ts
git commit -m "fix: update UI test files to import from @clmm/application/public instead of @clmm/domain (FAIL-2)"
```

---

## Task 5: Add UI→Domain Boundary Enforcement (FAIL-2, part 4)

**Problem:** Neither the ESLint boundary rules nor dependency-cruiser currently block `packages/ui` from importing `@clmm/domain`. This means the violation we just fixed could silently regress.

**Files:**
- Modify: `packages/config/boundaries/.dependency-cruiser.cjs`
- Modify: `packages/config/eslint/boundary-rules.js`

- [ ] **Step 1: Add dependency-cruiser rule**

In `packages/config/boundaries/.dependency-cruiser.cjs`, add a new rule in the `forbidden` array immediately after the existing `ui-no-adapters` rule (which ends around line 57). Insert:

```js
    {
      name: 'ui-no-domain',
      severity: 'error',
      comment: 'packages/ui must not import @clmm/domain directly — use @clmm/application/public re-exports',
      from: { path: 'packages/ui/src' },
      to: {
        path: [
          'packages/domain',
          '^@clmm/domain',
        ],
      },
    },
```

The full `ui-no-adapters` + new `ui-no-domain` block should look like:

```js
    {
      name: 'ui-no-adapters',
      severity: 'error',
      comment: 'packages/ui must not import adapter modules or Solana SDKs',
      from: { path: 'packages/ui/src' },
      to: {
        path: [
          'packages/adapters',
          SOLANA_IMPORT_PATTERN,
          ORCA_IMPORT_PATTERN,
        ],
      },
    },
    {
      name: 'ui-no-domain',
      severity: 'error',
      comment: 'packages/ui must not import @clmm/domain directly — use @clmm/application/public re-exports',
      from: { path: 'packages/ui/src' },
      to: {
        path: [
          'packages/domain',
          '^@clmm/domain',
        ],
      },
    },
```

- [ ] **Step 2: Add ESLint boundary rule**

In `packages/config/eslint/boundary-rules.js`, find the UI override block (the one with `files: ['packages/ui/src/**/*.{ts,tsx,js,jsx}']`). Add `'@clmm/domain'` to the restricted `group` array.

Change:

```js
    {
      files: ['packages/ui/src/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': restrictedPatterns([
          {
            group: ['@clmm/adapters', '@solana/*', '@orca-so/*'],
            message: 'packages/ui must not import adapters or Solana SDK packages.',
          },
        ]),
      },
    },
```

To:

```js
    {
      files: ['packages/ui/src/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'no-restricted-imports': restrictedPatterns([
          {
            group: ['@clmm/adapters', '@clmm/domain', '@solana/*', '@orca-so/*'],
            message: 'packages/ui must not import @clmm/domain, adapters, or Solana SDK packages. Use @clmm/application/public re-exports.',
          },
        ]),
      },
    },
```

- [ ] **Step 3: Verify boundary checks pass**

Run: `pnpm run boundaries`
Expected: Exit 0 — the UI files no longer import `@clmm/domain`.

- [ ] **Step 4: Verify lint passes**

Run: `pnpm run lint`
Expected: Exit 0 (with at most the existing 15 warnings).

- [ ] **Step 5: Regression test — confirm a new `@clmm/domain` import in UI would be caught**

Temporarily add `import type { PositionId } from '@clmm/domain';` to the top of `packages/ui/src/components/DirectionalPolicyCard.tsx`, then run:

Run: `pnpm run lint 2>&1 | grep "no-restricted-imports"`
Expected: Error referencing the `@clmm/domain` import.

Then revert the temporary change.

- [ ] **Step 6: Commit**

```bash
git add packages/config/boundaries/.dependency-cruiser.cjs packages/config/eslint/boundary-rules.js
git commit -m "fix: enforce UI→domain boundary via dep-cruiser + ESLint rules (FAIL-2 enforcement)"
```

---

## Task 6: Co-locate Application Use-Case Tests (FAIL-3 + FAIL-4 + DRIFT-8)

**Problem:** Epic 3 requires `.test.ts` files co-located next to each use case in `packages/application/src/use-cases/`. Currently all 25 test files live in `packages/testing/src/scenarios/`. Also: `@clmm/application` is missing `@clmm/testing` as a devDependency (FAIL-4), and `@clmm/testing` has `@clmm/application` in devDeps instead of deps (DRIFT-8).

**Strategy:** Copy (not move) the 23 per-use-case test files from `packages/testing/src/scenarios/` to co-located positions in `packages/application/src/use-cases/`. Keep the 2 integration scenarios (`BreachToExitScenario`, `StalePreviews`) in `packages/testing/`. Remove the per-use-case test re-exports from `packages/testing/src/scenarios/index.ts`. The original test files in `packages/testing/src/scenarios/` will be deleted to avoid duplication.

**Important:** The test files currently import use cases from `@clmm/application` and test infra from `@clmm/testing`. When co-located inside `packages/application/`, the use case imports must change to relative imports, but `@clmm/testing` imports remain unchanged (they'll come from devDependencies).

**Files:**
- Create: 23 test files in `packages/application/src/use-cases/` (listed in File Map above)
- Remove: 23 test files from `packages/testing/src/scenarios/`
- Modify: `packages/testing/src/scenarios/index.ts`
- Modify: `packages/application/package.json`
- Modify: `packages/testing/package.json`

- [ ] **Step 1: Add `@clmm/testing` devDependency to `@clmm/application`**

In `packages/application/package.json`, add to the `devDependencies` object:

```json
"@clmm/testing": "workspace:*"
```

The full `devDependencies` should now be:

```json
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "@clmm/testing": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
```

- [ ] **Step 2: Fix `@clmm/testing` dependency type (DRIFT-8)**

In `packages/testing/package.json`, move `@clmm/application` from `devDependencies` to `dependencies`:

```json
  "dependencies": {
    "@clmm/application": "workspace:*",
    "@clmm/domain": "workspace:*"
  },
  "devDependencies": {
    "@clmm/config": "workspace:*",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
```

- [ ] **Step 3: Run `pnpm install` to update lockfile**

Run: `pnpm install`
Expected: Lockfile updates, exit 0.

- [ ] **Step 4: Copy test files to co-located positions**

For each of the 23 per-use-case test files, copy from `packages/testing/src/scenarios/` to the matching directory in `packages/application/src/use-cases/`. The mapping is:

| Source (packages/testing/src/scenarios/) | Destination (packages/application/src/use-cases/) |
|---|---|
| `ListSupportedPositions.test.ts` | `positions/ListSupportedPositions.test.ts` |
| `GetPositionDetail.test.ts` | `positions/GetPositionDetail.test.ts` |
| `GetMonitoringReadiness.test.ts` | `positions/GetMonitoringReadiness.test.ts` |
| `ScanPositionsForBreaches.test.ts` | `triggers/ScanPositionsForBreaches.test.ts` |
| `QualifyActionableTrigger.test.ts` | `triggers/QualifyActionableTrigger.test.ts` |
| `CreateExecutionPreview.test.ts` | `previews/CreateExecutionPreview.test.ts` |
| `GetExecutionPreview.test.ts` | `previews/GetExecutionPreview.test.ts` |
| `RefreshExecutionPreview.test.ts` | `previews/RefreshExecutionPreview.test.ts` |
| `ApproveExecution.test.ts` | `execution/ApproveExecution.test.ts` |
| `ReconcileExecutionAttempt.test.ts` | `execution/ReconcileExecutionAttempt.test.ts` |
| `GetExecutionAttemptDetail.test.ts` | `execution/GetExecutionAttemptDetail.test.ts` |
| `GetExecutionHistory.test.ts` | `execution/GetExecutionHistory.test.ts` |
| `RecordExecutionAbandonment.test.ts` | `execution/RecordExecutionAbandonment.test.ts` |
| `ResolveExecutionEntryContext.test.ts` | `execution/ResolveExecutionEntryContext.test.ts` |
| `RequestWalletSignature.test.ts` | `execution/RequestWalletSignature.test.ts` |
| `SubmitExecutionAttempt.test.ts` | `execution/SubmitExecutionAttempt.test.ts` |
| `RecordSignatureDecline.test.ts` | `execution/RecordSignatureDecline.test.ts` |
| `ResumeExecutionAttempt.test.ts` | `execution/ResumeExecutionAttempt.test.ts` |
| `DispatchActionableNotification.test.ts` | `notifications/DispatchActionableNotification.test.ts` |
| `ConnectWalletSession.test.ts` | `wallet/ConnectWalletSession.test.ts` |
| `SyncPlatformCapabilities.test.ts` | `wallet/SyncPlatformCapabilities.test.ts` |
| `AcknowledgeAlert.test.ts` | `alerts/AcknowledgeAlert.test.ts` |
| `ListActionableAlerts.test.ts` | `alerts/ListActionableAlerts.test.ts` |

Run for each file (example for the first):

```bash
cp packages/testing/src/scenarios/ListSupportedPositions.test.ts packages/application/src/use-cases/positions/ListSupportedPositions.test.ts
```

- [ ] **Step 5: Update imports in co-located test files**

Each copied test file imports use cases from `@clmm/application`. Now that the tests live inside `packages/application/`, these imports should become relative imports to the co-located use case file. The `@clmm/testing` and `@clmm/domain` imports remain unchanged (they reference external packages).

**Pattern for every file:**

Replace:
```ts
import { listSupportedPositions } from '@clmm/application';
```

With the relative import to the same-directory use case:
```ts
import { listSupportedPositions } from './ListSupportedPositions.js';
```

For each of the 23 files, change the `from '@clmm/application'` import to use a relative path. The function name and source file vary per test — match the test filename to the use case filename in the same directory.

**Example transformations:**

`packages/application/src/use-cases/positions/ListSupportedPositions.test.ts`:
```ts
// Before:
import { listSupportedPositions } from '@clmm/application';
// After:
import { listSupportedPositions } from './ListSupportedPositions.js';
```

`packages/application/src/use-cases/execution/ApproveExecution.test.ts`:
```ts
// Before:
import { approveExecution, createExecutionPreview } from '@clmm/application';
// After:
import { approveExecution } from './ApproveExecution.js';
import { createExecutionPreview } from '../previews/CreateExecutionPreview.js';
```

For test files that import multiple use cases from different directories, use relative paths to each. Check each file's actual imports and adjust accordingly.

- [ ] **Step 6: Verify co-located tests run in `@clmm/application`**

Run: `pnpm --filter @clmm/application test`
Expected: 23+ tests pass (the vitest config `include: ['src/**/*.test.ts']` will now find them).

- [ ] **Step 7: Delete the original per-use-case test files from `packages/testing/src/scenarios/`**

Remove all 23 per-use-case test files from `packages/testing/src/scenarios/`. Keep ONLY:
- `BreachToExitScenario.ts` (integration scenario)
- `BreachToExitScenario.test.ts` (integration test)
- `StalePreviews.test.ts` (integration test)
- `index.ts` (barrel — update in next step)

```bash
rm packages/testing/src/scenarios/ListSupportedPositions.test.ts
rm packages/testing/src/scenarios/GetPositionDetail.test.ts
rm packages/testing/src/scenarios/GetMonitoringReadiness.test.ts
rm packages/testing/src/scenarios/ScanPositionsForBreaches.test.ts
rm packages/testing/src/scenarios/QualifyActionableTrigger.test.ts
rm packages/testing/src/scenarios/CreateExecutionPreview.test.ts
rm packages/testing/src/scenarios/GetExecutionPreview.test.ts
rm packages/testing/src/scenarios/RefreshExecutionPreview.test.ts
rm packages/testing/src/scenarios/ApproveExecution.test.ts
rm packages/testing/src/scenarios/ReconcileExecutionAttempt.test.ts
rm packages/testing/src/scenarios/GetExecutionAttemptDetail.test.ts
rm packages/testing/src/scenarios/GetExecutionHistory.test.ts
rm packages/testing/src/scenarios/RecordExecutionAbandonment.test.ts
rm packages/testing/src/scenarios/ResolveExecutionEntryContext.test.ts
rm packages/testing/src/scenarios/RequestWalletSignature.test.ts
rm packages/testing/src/scenarios/SubmitExecutionAttempt.test.ts
rm packages/testing/src/scenarios/RecordSignatureDecline.test.ts
rm packages/testing/src/scenarios/ResumeExecutionAttempt.test.ts
rm packages/testing/src/scenarios/DispatchActionableNotification.test.ts
rm packages/testing/src/scenarios/ConnectWalletSession.test.ts
rm packages/testing/src/scenarios/SyncPlatformCapabilities.test.ts
rm packages/testing/src/scenarios/AcknowledgeAlert.test.ts
rm packages/testing/src/scenarios/ListActionableAlerts.test.ts
```

- [ ] **Step 8: Update `packages/testing/src/scenarios/index.ts`**

Replace the file contents with only the integration scenario exports:

```ts
export { BreachToExitScenario } from './BreachToExitScenario.js';
```

- [ ] **Step 9: Verify all tests pass across the monorepo**

Run: `pnpm run test`
Expected: All tests pass. The total count should remain at 193 (23 moved to application + the rest in their original locations).

- [ ] **Step 10: Verify typecheck passes**

Run: `pnpm run typecheck`
Expected: Exit 0.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "fix: co-locate use-case tests in packages/application, fix dependency graph (FAIL-3, FAIL-4, DRIFT-8)"
```

---

## Task 7: Add CI Configuration (FAIL-5)

**Problem:** No `.github/workflows/` directory exists. Epics 5–8 reference CI gates.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/` directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main, superpowers-v2]
  pull_request:
    branches: [main]

jobs:
  check:
    name: Build, Test & Lint
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm run typecheck

      - name: Lint
        run: pnpm run lint

      - name: Boundary checks
        run: pnpm run boundaries

      - name: Test
        run: pnpm run test

      - name: Build
        run: pnpm run build
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI pipeline (FAIL-5)"
```

---

## Task 8: Tighten ESLint for Adapters (DRIFT-1)

**Problem:** `packages/config/eslint/index.js` lines 37–53 disable `no-explicit-any` and all `no-unsafe-*` rules for `packages/adapters/src/**`. The spec requires `no-explicit-any: error` globally. There are 16 `any` usages across adapter files, 5 in production code and 11 in tests. None have the required `// boundary: <reason>` comment.

**Strategy:**
1. Fix the 5 production-code `any` usages with proper types + boundary comments where `any` is truly unavoidable.
2. Fix the 11 test-file `any` usages with typed mocks or boundary comments.
3. Remove the ESLint override block to re-enable strict rules.

**Files:**
- Modify: `packages/adapters/src/outbound/wallet-signing/NativeWalletSigningAdapter.ts`
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionPreparationAdapter.ts`
- Modify: `packages/adapters/src/outbound/swap-execution/SolanaExecutionSubmissionAdapter.ts`
- Modify: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`
- Modify: `packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.test.ts`
- Modify: `packages/config/eslint/index.js`

- [ ] **Step 1: Fix `NativeWalletSigningAdapter.ts` — line 41**

In `packages/adapters/src/outbound/wallet-signing/NativeWalletSigningAdapter.ts`, replace line 41:

```ts
            chain: this.cluster as any,
```

With:

```ts
            // boundary: MWA authorize() expects a branded chain type; cluster string is runtime-configured
            chain: this.cluster as unknown as Parameters<typeof wallet.authorize>[0]['chain'],
```

If the MWA type is not easily extractable via `Parameters`, use this simpler alternative with boundary comment:

```ts
            // boundary: MWA SDK authorize() chain param expects opaque branded type not exported publicly
            chain: this.cluster as never,
```

- [ ] **Step 2: Fix `SolanaExecutionPreparationAdapter.ts` — line 115**

Replace line 115:

```ts
        poolId: whirlpoolAddress.toString() as any,
```

With:

```ts
        // boundary: Orca SDK returns Address type; domain uses branded PoolId
        poolId: whirlpoolAddress.toString() as unknown as PoolId,
```

Ensure `PoolId` is imported at the top of the file (it should already be via `@clmm/domain` through `@clmm/application`).

- [ ] **Step 3: Fix `SolanaExecutionPreparationAdapter.ts` — lines 202 and 215**

Replace the Jupiter methods with typed alternatives.

Replace line 202:

```ts
  private async getJupiterQuote(inputMint: string, outputMint: string, amount: string): Promise<any | null> {
```

With:

```ts
  // boundary: Jupiter v6 REST /quote response is untyped — no official SDK types available
  private async getJupiterQuote(inputMint: string, outputMint: string, amount: string): Promise<unknown> {
```

Replace line 215:

```ts
  private async getJupiterSwapTransaction(quoteResponse: any, userPublicKey: string): Promise<string | null> {
```

With:

```ts
  // boundary: Jupiter v6 REST /swap expects the raw /quote response object — no official SDK types
  private async getJupiterSwapTransaction(quoteResponse: unknown, userPublicKey: string): Promise<string | null> {
```

Then update any code inside `getJupiterSwapTransaction` that accesses `quoteResponse` properties to narrow the type first. For the `JSON.stringify({ quoteResponse, ... })` usage, `unknown` is fine because `JSON.stringify` accepts `unknown`.

- [ ] **Step 4: Fix `SolanaExecutionSubmissionAdapter.ts` — line 58**

Replace:

```ts
        const status = await rpc.getSignatureStatuses([ref.signature as any], { searchTransactionHistory: true }).send();
```

With:

```ts
        // boundary: @solana/kit getSignatureStatuses expects Signature branded type; ref.signature is a string
        const status = await rpc.getSignatureStatuses([ref.signature as unknown as import('@solana/kit').Signature], { searchTransactionHistory: true }).send();
```

Or if the Signature type import is already available at the top of the file:

```ts
        // boundary: @solana/kit getSignatureStatuses expects Signature branded type; ref.signature is a string
        const status = await rpc.getSignatureStatuses([ref.signature as unknown as Signature], { searchTransactionHistory: true }).send();
```

- [ ] **Step 5: Fix `OrcaPositionReadAdapter.test.ts` — 10 `as any` casts**

In `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.test.ts`, replace each `as any` with `as unknown as <correct type>` and add a boundary comment. The pattern repeats 5 times (pairs of `fetchPositionsForOwner` and `fetchWhirlpool` mocks).

For each `] as any);` (mock position array), replace with:

```ts
        // boundary: Orca SDK Position type has many fields; test uses minimal shape
        ] as unknown as Awaited<ReturnType<typeof fetchPositionsForOwner>>);
```

For each `} as any);` (mock whirlpool object), replace with:

```ts
        // boundary: Orca SDK Whirlpool type has many fields; test uses minimal shape
        } as unknown as Awaited<ReturnType<typeof fetchWhirlpool>>);
```

Alternatively, if the Orca SDK types are hard to reference, create a minimal typed mock factory at the top of the test file to avoid repeating casts.

- [ ] **Step 6: Fix `JupiterQuoteAdapter.test.ts` — line 136**

Replace:

```ts
      toAsset: 'UNSUPPORTED' as any,
```

With:

```ts
      // boundary: intentionally invalid value to test error path
      toAsset: 'UNSUPPORTED' as unknown as AssetSymbol,
```

Ensure `AssetSymbol` is imported.

- [ ] **Step 7: Remove the ESLint adapter override block**

In `packages/config/eslint/index.js`, remove the entire override block (lines 37–53) that disables rules for adapter files:

Remove this block entirely:

```js
    {
      files: [
        'packages/adapters/src/inbound/**/*.{ts,tsx}',
        'packages/adapters/src/outbound/**/*.{ts,tsx}',
        'packages/adapters/src/**/*.test.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-enum-comparison': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
      },
    },
```

Keep the `require-await` override for adapters (lines 32–36) — that one is fine.

- [ ] **Step 8: Verify lint passes**

Run: `pnpm run lint`
Expected: Exit 0. There may be new warnings from the re-enabled rules (like `no-unsafe-assignment` for `unknown` usage), but no errors. If there are errors, fix them — each error will be a remaining `any` or unsafe operation that needs proper typing.

- [ ] **Step 9: Verify tests still pass**

Run: `pnpm run test`
Expected: All tests pass.

- [ ] **Step 10: Verify typecheck still passes**

Run: `pnpm run typecheck`
Expected: Exit 0.

- [ ] **Step 11: Commit**

```bash
git add packages/config/eslint/index.js packages/adapters/src/
git commit -m "fix: re-enable strict ESLint rules for adapters, add boundary comments (DRIFT-1)"
```

---

## Final Verification

After all 8 tasks are complete, run the full verification suite:

- [ ] **Full build**
```bash
pnpm run build
```
Expected: Exit 0.

- [ ] **All tests**
```bash
pnpm run test
```
Expected: 193 tests pass.

- [ ] **Typecheck**
```bash
pnpm run typecheck
```
Expected: Exit 0.

- [ ] **Lint**
```bash
pnpm run lint
```
Expected: Exit 0.

- [ ] **Boundaries**
```bash
pnpm run boundaries
```
Expected: Exit 0.

- [ ] **No `@clmm/domain` imports in UI**
```bash
grep -r "@clmm/domain" packages/ui/src/
```
Expected: Zero matches.

- [ ] **No bare `any` in adapters (without boundary comment)**
```bash
grep -rn ": any\b\|as any\b" packages/adapters/src/ | grep -v "// boundary:"
```
Expected: Zero matches.

- [ ] **Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: final verification — all FAIL items resolved, drift addressed"
```
