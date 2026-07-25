# Design Document: Drizzle Schema Tracking Integrity

## 1. Problem Being Solved & Why It Matters

When `drizzle-kit generate` is run with a narrowed schema path (e.g., via CLI argument `schema: './src/.../position-plans.ts'`) instead of relying on the configured `schema/index.ts`, Drizzle creates a snapshot JSON that excludes the omitted tables. Since Drizzle uses these snapshots to calculate schema diffs, subsequent migration generation attempts will falsely conclude that the missing tables don't exist in the database and attempt to recreate them. Applying such a migration fails outright due to duplicate table/constraint errors. This risks developers unknowingly committing corrupted migration chains, blocking deployments, and breaking local database setups.

## 2. Key Design Decisions and Trade-offs

**Option A: Wrap `db:generate` in `package.json` to enforce configuration**
_Trade-off:_ Prevents manual CLI errors when using `pnpm db:generate`, but doesn't prevent someone from running `npx drizzle-kit generate` directly, nor does it catch corrupted snapshots introduced via merge conflicts or manual editing.

**Option B: CI bash script parsing `schema/index.ts` and snapshots**
_Trade-off:_ Bash/grep parsing of TypeScript ASTs or barrel files is brittle and error-prone. It's difficult to distinguish actual tables from types, enums, or relations.

**Option C: Automated test validating the latest snapshot against the initialized schema**
_Trade-off:_ By adding a unit test (using `vitest`) that parses the latest `drizzle/meta/*_snapshot.json` and compares it against the imported `schema` object, we can catch mismatches in CI (`pnpm test`) and locally before commits. It is less brittle than parsing text and integrates perfectly into the existing test pipeline.

## 3. Proposed Approach with Rationale

We will adopt **Option C** (Automated Test Validation).

- Create a test file `packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts`.
- The test will dynamically read the `packages/adapters/drizzle/meta/_journal.json` to find the latest snapshot file, or simply list the directory to find the highest numbered snapshot.
- It will parse the JSON and extract the table names present in the snapshot.
- It will import `* as schema from '../index.js'` and extract the actual table objects defined in the codebase.
- The test will assert that the snapshot contains an entry for every table exported by the schema.

**Rationale:**
Testing is a built-in step of the development and CI process. A test will fail fast if a developer commits a bad snapshot. It leverages existing tools (`vitest`, which is already configured in `packages/adapters/package.json`) and requires no additional CI orchestration, bash scripting, or build steps.

## 4. Assumptions Made

- A snapshot's `tables` object keys match the real table names.
- The `schema/index.ts` exports tables directly, and the exported schema objects contain the Drizzle table metadata (we can identify them using Drizzle's `is(pgTable)` or by checking properties unique to Drizzle tables).
- `vitest` is run on every CI build and PR, effectively gating any PR with a corrupted snapshot.
- The issue mentions 14 tables in total. We assume all schema exports are either tables, relations, or types, and we can programmatically filter for actual table objects to reach the correct expected count.

## 5. Scope

**In Scope:**

- A validation test script that verifies the latest Drizzle snapshot includes all tables defined in `schema/index.ts`.
- Necessary documentation or comments within the test explaining why this check exists (referencing the issue).

**Out of Scope:**

- Retroactively fixing previous snapshots (like `0002`), since they have already been bypassed/fixed by merging the missing tables into `0003` / `0004` (as described in the issue).
- Scanning historical migrations for errors (already done manually by the issue author).
- Modifying how `drizzle-kit` itself generates snapshots.

## 6. Risks or Concerns Identified from Code Analysis

- **Identifying Tables vs. Relations:** Drizzle's `schema/index.ts` might export types, relations, or enums alongside tables. The validation logic must accurately filter these out to count only tables; otherwise, the test will falsely fail.
- **Snapshot Format Changes:** Drizzle occasionally updates its internal snapshot schema (e.g. `version: "5"` to `"6"`). The test should be robust enough to handle the structure or focus strictly on the `tables` dictionary, which is generally stable across minor versions.
- **Test Execution Context:** The test needs access to the file system to read the `meta` directory. `vitest` runs in a Node.js environment, so `fs` is available, but paths must be resolved correctly relative to the `packages/adapters` directory, regardless of where the test is invoked from.
