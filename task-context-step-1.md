# Task Context: Task 1

Title: Add the latest-snapshot schema coverage regression test

## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/clmm-superpowers-v2/.ai-worktrees/issue-106
Repository: opsclawd/clmm-v2
Branch: ai/issue-106
Start Commit: 5de7a00506e53854be7a695212e43f2ca8ec71cd

## Task Requirements

**Files:**

- Create: `packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts`
- Read for established patterns only: `packages/adapters/src/outbound/storage/SchemaReadiness.ts`
- Read as inputs only: `packages/adapters/src/outbound/storage/schema/index.ts`
- Read as inputs only: `packages/adapters/drizzle/meta/*_snapshot.json`

- [ ] **Step 1: Write the three named tests before their helper implementations**

Create `packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts` with the imports, local snapshot shape, metadata path, and tests below. Leave the helper calls unresolved for this first red phase.

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../index.js';

interface SchemaSnapshot {
  tables: Record<string, { name: string }>;
}

const metaDirectory = resolve(__dirname, '../../../../../drizzle/meta');

describe('Drizzle schema snapshot integrity', () => {
  it('filters non-table exports when deriving expected schema tables', () => {
    const fixtureTable = pgTable('fixture_table', {
      id: text('id').primaryKey(),
    });

    expect(
      getSchemaTableNames({
        fixtureTable,
        fixtureHelper: () => 'not a table',
        fixtureRelation: { referencedTableName: 'fixture_table' },
      }),
    ).toEqual(['fixture_table']);
  });

  it('reports schema tables that are missing from a snapshot', () => {
    expect(
      findMissingTableNames(['fixture_b', 'fixture_a'], ['fixture_b', 'fixture_extra']),
    ).toEqual(['fixture_a']);
  });

  it('fails when no numbered Drizzle snapshot exists', () => {
    expect(() => selectLatestSnapshotFile(['_journal.json', 'README.md'])).toThrow(
      'No numbered Drizzle snapshot found',
    );
  });

  it('tracks every exported schema table in the latest Drizzle snapshot', () => {
    const latestSnapshot = readLatestSnapshot(metaDirectory);

    expect(
      findMissingTableNames(getSchemaTableNames(schema), getSnapshotTableNames(latestSnapshot)),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the red phase**

Run:

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
```

Expected: FAIL during transformation/type analysis because `getSchemaTableNames`, `findMissingTableNames`, `selectLatestSnapshotFile`, `readLatestSnapshot`, and `getSnapshotTableNames` do not exist yet. If it fails instead because dependencies are absent, run `pnpm install --frozen-lockfile` and repeat the focused command; do not change source or migration files.

- [ ] **Step 3: Add the minimal local helpers above the `describe` block**

Add the established Drizzle metadata imports:

```ts
import { getTableName, is } from 'drizzle-orm';
import { PgTable, pgTable, text } from 'drizzle-orm/pg-core';
```

Replace the original `drizzle-orm/pg-core` import and add these helpers after `metaDirectory`:

```ts
function getSchemaTableNames(schemaNamespace: Record<string, unknown>): string[] {
  return Object.values(schemaNamespace)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableName(table))
    .sort();
}

function getSnapshotTableNames(snapshot: SchemaSnapshot): string[] {
  return Object.values(snapshot.tables)
    .map((table) => table.name)
    .sort();
}

function findMissingTableNames(expected: string[], tracked: string[]): string[] {
  const trackedNames = new Set(tracked);
  return expected.filter((tableName) => !trackedNames.has(tableName)).sort();
}

function selectLatestSnapshotFile(fileNames: string[]): string {
  const latestSnapshotFile = fileNames
    .filter((fileName) => /^\d{4}_snapshot\.json$/.test(fileName))
    .sort()
    .at(-1);

  if (!latestSnapshotFile) {
    throw new Error('No numbered Drizzle snapshot found');
  }

  return latestSnapshotFile;
}

function readLatestSnapshot(directory: string): SchemaSnapshot {
  const latestSnapshotFile = selectLatestSnapshotFile(readdirSync(directory));
  return JSON.parse(readFileSync(resolve(directory, latestSnapshotFile), 'utf8')) as SchemaSnapshot;
}
```

Keep every helper local to the test file. Do not replace Drizzle identity checks with property probing, do not count exports, and do not compare snapshot object keys such as `public.table_name`; compare the snapshot entries’ stable `name` fields.

- [ ] **Step 4: Run focused behavior and file-scoped static checks**

Run:

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/storage/schema/__tests__/schema-snapshot.test.ts --ext .ts
```

Expected: all four named tests PASS, including the current 14-table canonical schema against `0004_snapshot.json`; ESLint exits 0 for the new file. The implementation loop’s automatic `pnpm -r typecheck` gate must also remain green.

- [ ] **Step 5: Review the scoped diff and commit**

Run:

```bash
git diff --check -- packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
git diff -- packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
git add packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
git commit -m "test(adapters): guard drizzle snapshot table coverage"
```

Expected: the diff contains only the new test file, `git diff --check` emits no output, and the commit succeeds.

## Tests to add or update

- Add `filters non-table exports when deriving expected schema tables` to prove types, helpers, relations, and other barrel exports cannot inflate the expected table set.
- Add `reports schema tables that are missing from a snapshot` to prove the comparison detects and names omissions while ignoring ordering and unrelated tracked entries.
- Add `fails when no numbered Drizzle snapshot exists` to ensure absence or unexpected renaming cannot be mistaken for a valid empty baseline.
- Add `tracks every exported schema table in the latest Drizzle snapshot` as the repository regression guard. It must use the real schema barrel and real latest snapshot, with no hard-coded count of 14.
- Do not update existing tests or create fixture files; the helper-level cases and checked-in snapshot are sufficient.

## Validation commands

These commands intentionally target only the new file or the behavior it owns:

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/storage/schema/__tests__/schema-snapshot.test.ts --ext .ts
git diff --check -- packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
```

The implementation harness separately runs the required workspace-wide `pnpm -r typecheck` gate after the task; it is not a standalone plan task.

## Risk areas

- **False table detection:** Barrel exports may later include non-table values. Use the same Drizzle class identity mechanism already proven by `SchemaReadiness.ts`.
- **Path fragility:** Vitest may be launched from the repository root or through a filtered package command. Resolve `drizzle/meta` from the test file’s CommonJS `__dirname`, not `process.cwd()`.
- **Snapshot selection drift:** Match only zero-padded `NNNN_snapshot.json` files and sort their names; ignore `_journal.json` and unrelated JSON.
- **Snapshot format changes:** The guard deliberately depends only on `tables` and each entry’s `name`. A Drizzle format change that removes those fields should fail loudly rather than silently pass.
- **One-way coverage:** The issue requires every schema table to be tracked. Extra snapshot entries are not rejected because historical/drop workflows may require separate migration policy and are outside this issue.
- **Known historical corruption:** Never aim this assertion at every snapshot; `0002_snapshot.json` is intentionally retained as repository history and is known to omit 12 tables.

## Stop conditions

Abort implementation instead of broadening the change if any of the following occurs:

- The latest snapshot is not `packages/adapters/drizzle/meta/0004_snapshot.json` or no longer contains all canonical exported tables before this task begins; report the pre-existing migration-chain change for investigation.
- `schema/index.ts` exports tables from a non-PostgreSQL Drizzle dialect, or Drizzle’s `is(value, PgTable)` / `getTableName` behavior no longer matches the established `SchemaReadiness.ts` implementation.
- Making the focused test pass would require editing a migration, snapshot, `_journal.json`, `drizzle.config.ts`, package script, or production source file.
- The focused test requires a live database, environment secret, or network access; the intended guard must remain deterministic and filesystem-only.
- The repository’s test compiler does not provide CommonJS `__dirname`; stop and reassess a repository-relative path strategy rather than falling back to `process.cwd()`.

## Plan risk classification

This plan adds a deterministic, read-only test. It introduces no retry/recovery loop, explicit state-machine transition, database write, or irreversible external side effect, so `<!-- plan-review-required -->` is intentionally omitted.

## Repository Targets

### Expected Files

- packages/adapters/src/outbound/storage/schema/**tests**/schema-snapshot.test.ts

## Validation Commands

```bash
pnpm --filter @clmm/adapters exec vitest run src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
pnpm --filter @clmm/adapters exec eslint src/outbound/storage/schema/__tests__/schema-snapshot.test.ts --ext .ts
git diff --check -- packages/adapters/src/outbound/storage/schema/__tests__/schema-snapshot.test.ts
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **canonical table discovery**: Only Drizzle PostgreSQL tables exported by the canonical schema namespace contribute expected table names; unrelated exports are ignored and names are sorted deterministically. (Test: `filters non-table exports when deriving expected schema tables`)
- **missing-table diagnosis**: Every expected schema table absent from the tracked snapshot names is returned in sorted order, regardless of input order or unrelated snapshot entries. (Test: `reports schema tables that are missing from a snapshot`)
- **missing snapshot visibility**: When no filename matches the zero-padded numbered Drizzle snapshot convention, snapshot selection throws instead of accepting an empty baseline. (Test: `fails when no numbered Drizzle snapshot exists`)
- **latest snapshot coverage**: The lexicographically greatest NNNN_snapshot.json file is parsed and must contain the name of every PostgreSQL table exported by packages/adapters/src/outbound/storage/schema/index.ts. (Test: `tracks every exported schema table in the latest Drizzle snapshot`)
