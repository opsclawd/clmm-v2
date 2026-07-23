# Task Context: Task 1

Title: Vendor the canonical contract and gate the migration on it

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-92
Repository: opsclawd/clmm-v2
Branch: ai/issue-92
Start Commit: fb1d4a761de856add80733ef0af21e8e69fdc1eb

## Task Requirements

**Goal:** Vendor Regime Engine's checked-in `contracts/policy-insight/v1/` into this repo, add the validator dependency, then prove the schema compiles strictly and accepts its own canonical fixture before any exported clmm DTO changes.

**Files:**

- Create: `schemas/regime-engine/policy-insight.v1/schema.json`
- Create: `schemas/regime-engine/policy-insight.v1/schema.sha256`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/valid/history.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/invalid/action-position-and-version.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/invalid/fields-and-enums.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/invalid/numbers-and-levels.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/invalid/ordering-and-duplicates.json`
- Create: `schemas/regime-engine/policy-insight.v1/fixtures/invalid/timestamps-and-freshness.json`
- Create: `schemas/regime-engine/policy-insight.v1/provenance.json`
- Modify: `packages/application/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/application/src/dto/policyInsightContract.test.ts`

**Dependencies:** None.

**Signature changes:** None.

**Invariants to write as tests first:**

1. `accepts the vendored canonical PolicyInsight fixture with the vendored schema`
   - Import the local vendored PolicyInsight schema and fixture (`schemas/regime-engine/policy-insight.v1/`).
   - Compile with Ajv configured with `strict: true`, `coerceTypes: false`, `useDefaults: false`, and `removeAdditional: false`.
   - Assert validation returns `true`; include `validator.errors` in the assertion message so a contract-vendoring defect is diagnosable.
2. `does not mutate the canonical PolicyInsight fixture during validation`
   - Deep-clone the fixture before validation.
   - Assert the validated value is deeply equal to the clone afterward.

**Implementation steps:**

- [ ] Vendor Regime Engine's contract via a pinned-commit sparse clone (network/`gh`-authenticated git, not a local sibling-directory read):

  ```bash
  git clone --depth 1 --filter=blob:none --sparse https://github.com/opsclawd/regime-engine.git /tmp/regime-engine-contract-fetch
  cd /tmp/regime-engine-contract-fetch && git sparse-checkout set contracts/policy-insight/v1
  SOURCE_COMMIT=$(git rev-parse HEAD)
  cd -
  mkdir -p schemas/regime-engine/policy-insight.v1
  cp -r /tmp/regime-engine-contract-fetch/contracts/policy-insight/v1/. schemas/regime-engine/policy-insight.v1/
  rm -rf /tmp/regime-engine-contract-fetch
  ```

  Rename the copied `policy-insight.schema.json` to `schema.json` for consistency with the intelligence repo's naming (`sol-usdc-clmm-intelligence`'s `schemas/regime-engine/evidence-bundle.v1/schema.json`).

- [ ] Write `provenance.json` recording the source repository, `$SOURCE_COMMIT`, and a sha256 of every vendored asset (schema, `schema.sha256`, and each fixture file) — mirroring the shape of `sol-usdc-clmm-intelligence`'s `schemas/regime-engine/evidence-bundle.v1/provenance.json` (fields: `repository`, `commit`, `schemaPath`, `schemaVersion`, `copiedAt`, `assets[].sourcePath`/`localPath`/`sha256`).
- [ ] Add `ajv@^8.18.0` to `@clmm/application` runtime dependencies because the built parser imports it at runtime.

  ```bash
  pnpm --filter @clmm/application add ajv@^8.18.0
  ```

- [ ] Write `policyInsightContract.test.ts` importing the vendored schema/fixture directly from `schemas/regime-engine/policy-insight.v1/` (a relative import, not a package import) with the two named tests above. Freeze the fixture or validate a deep clone before mutating; the mutation assertion must still compare the before/after wire value.
- [ ] Run the focused contract test and confirm both tests pass. A compile failure from an unsupported JSON Schema vocabulary or format is a stop condition; do not disable Ajv strictness to get green.

**Acceptance criteria:**

- `schemas/regime-engine/policy-insight.v1/` contains the vendored schema, `schema.sha256`, all 8 fixtures, and a `provenance.json` whose recorded hashes match the vendored files.
- The schema compiles under strict Ajv configuration.
- The real fixture validates without mutation.
- No application DTO, parser, adapter, app client, or UI code has changed yet.

**Task-scoped validation commands:**

```bash
pnpm install --frozen-lockfile
pnpm --filter @clmm/application exec vitest run src/dto/policyInsightContract.test.ts
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/application build
```

**Commit boundary:** Commit the dependency lock and contract preflight together. Do not proceed to Task 2 unless this task is green.

---

## Repository Targets

### Expected Files

- schemas/regime-engine/policy-insight.v1/schema.json
- schemas/regime-engine/policy-insight.v1/schema.sha256
- schemas/regime-engine/policy-insight.v1/fixtures/valid/current-pair.json
- schemas/regime-engine/policy-insight.v1/fixtures/valid/current-position.json
- schemas/regime-engine/policy-insight.v1/fixtures/valid/history.json
- schemas/regime-engine/policy-insight.v1/fixtures/invalid/action-position-and-version.json
- schemas/regime-engine/policy-insight.v1/fixtures/invalid/fields-and-enums.json
- schemas/regime-engine/policy-insight.v1/fixtures/invalid/numbers-and-levels.json
- schemas/regime-engine/policy-insight.v1/fixtures/invalid/ordering-and-duplicates.json
- schemas/regime-engine/policy-insight.v1/fixtures/invalid/timestamps-and-freshness.json
- schemas/regime-engine/policy-insight.v1/provenance.json
- packages/application/package.json
- pnpm-lock.yaml
- packages/application/src/dto/policyInsightContract.test.ts

## Validation Commands

```bash
pnpm install --frozen-lockfile
pnpm --filter @clmm/application exec vitest run src/dto/policyInsightContract.test.ts
pnpm --filter @clmm/application typecheck
pnpm --filter @clmm/application build
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **canonical fixture validates**: The vendored PolicyInsight fixture at schemas/regime-engine/policy-insight.v1/ validates successfully against the vendored schema in the same directory under strict Ajv settings. (Test: `accepts the vendored canonical PolicyInsight fixture with the vendored schema`)
- **contract validation is non-mutating**: Strict schema validation does not coerce, default, remove, rename, or otherwise mutate the canonical fixture. (Test: `does not mutate the canonical PolicyInsight fixture during validation`)
