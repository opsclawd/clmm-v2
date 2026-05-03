# Deploy Migration Ordering + Schema Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the deploy-order race that lets API or worker traffic hit a database with missing schema. API owns migrations via Railway `preDeployCommand`; both API `/health` and worker startup refuse to operate against a half-migrated database; required-table list derives from a single source — `packages/adapters/src/outbound/storage/schema/index.ts`.

**Architecture:** Three independent guarantees. (1) Migrations run before API serves traffic, owned by Railway preDeployCommand on the API service. (2) `/health` queries `information_schema.tables` against the Drizzle-derived expected list and returns 503 with the missing list when any table is absent. (3) Worker `main.ts` runs the same gate before `NestFactory.createApplicationContext` and exits non-zero on failure. The schema readiness check has no caching, no env-var override, no allowlist. Drift = loud deploy failure.

**Tech Stack:** TypeScript 5.4+, NestJS 10 + Fastify, drizzle-orm + drizzle-kit (postgres-js), pg-boss, vitest for tests, pnpm 9 + turbo, Railway for infra.

**Spec:** `docs/superpowers/specs/2026-05-02-deploy-migration-ordering-design.md`

---

## Pre-flight notes (already verified during planning)

- **CJS production build confirmed.** `packages/config/tsconfig/nestjs.json` sets `"module": "CommonJS"`. The `if (require.main === module)` guard in `packages/adapters/src/inbound/http/main.ts:18` works under `node dist/inbound/http/main.js`. No ESM refactor needed.
- **No `DB` token exists today.** `packages/adapters/src/inbound/http/AppModule.ts:59` creates `db` as a module-level constant. Task 3 adds the token and wires it.
- **`packages/adapters/src/outbound/storage/schema/index.ts` already exists** and does `export *` from each schema module. Task 1 makes `db.ts` consume it (today `db.ts` imports each module individually).
- **Test pattern: mocked `Db`, not real Postgres.** Storage adapter tests construct fake `Db`-shaped objects with `vi.fn()`. SchemaReadiness tests follow the same pattern.
- **No `inbound/jobs/main.test.ts` exists.** Task 5 creates it.
- **12 expected tables** in current schema (informational, do not hardcode this list — derive from `schema/index.ts`):
  - `breach_episodes`, `exit_triggers`, `execution_previews`, `execution_attempts`, `execution_sessions`, `prepared_payloads`, `history_events`, `monitored_wallets`, `notification_dedup`, `notification_events`, `wallet_position_ownership`, `wallet_challenges`.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `packages/adapters/src/outbound/storage/SchemaReadiness.ts` | Pure function `checkSchemaReadiness(db, schemaNamespace)` — derives expected tables via Drizzle helpers, queries `information_schema.tables`, returns `{ ready, missing? }` |
| `packages/adapters/src/outbound/storage/SchemaReadiness.test.ts` | Unit tests with mocked `db.execute` + fixture namespaces |
| `packages/adapters/src/inbound/jobs/main.test.ts` | Worker bootstrap gate test |
| `packages/adapters/railway.api.toml` | (Path A only) API service deploy contract |
| `packages/adapters/railway.worker.toml` | (Path A only) Worker service deploy contract |
| `docs/runbooks/railway-deploy.md` | Canonical deploy runbook |

**Modified files:**

| Path | Change |
|---|---|
| `packages/adapters/package.json` | Add `start:api` script |
| `packages/adapters/src/outbound/storage/db.ts` | Consume `schema/index.ts`; re-export `schema` |
| `packages/adapters/src/outbound/storage/db.test.ts` | Strengthen assertion to verify schema namespace contains expected table keys |
| `packages/adapters/src/inbound/http/tokens.ts` | Add `DB` token |
| `packages/adapters/src/inbound/http/AppModule.ts` | Add `{ provide: DB, useValue: db }` provider |
| `packages/adapters/src/inbound/http/HealthController.ts` | Inject DB; check schema readiness; 503 on missing |
| `packages/adapters/src/inbound/http/HealthController.test.ts` | Cover ready/not-ready/error paths |
| `packages/adapters/src/inbound/jobs/main.ts` | Pre-Nest gate; export `bootstrap` |
| `README.md` | Link to runbook |
| `docs/architecture/release-checklist.md` | New "Deploy / Schema Readiness" section |

**Total:** 6 new + 10 modified = 16 files (Path A) or 14 files (Path B fallback).

---

## Task 1: Refactor `db.ts` to consume `schema/index.ts`

**Why first:** Every other task imports from `db.ts`. Land this clean refactor first so subsequent tasks can `import { createDb, schema } from '...storage/db.js'`.

**Files:**
- Modify: `packages/adapters/src/outbound/storage/db.ts`
- Modify: `packages/adapters/src/outbound/storage/db.test.ts`

- [ ] **Step 1: Strengthen the existing test first (TDD: tighten assertion before refactor)**

Open `packages/adapters/src/outbound/storage/db.test.ts`. Replace the existing test body so it asserts the schema namespace contains a known table export (`walletChallenges`):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { drizzleMock } = vi.hoisted(() => ({
  drizzleMock: vi.fn(),
}));

type DrizzleCall = [unknown, { schema?: Record<string, unknown> }];

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: drizzleMock,
}));

import { createDb } from './db.js';

describe('createDb', () => {
  beforeEach(() => {
    drizzleMock.mockReset();
  });

  it('passes a schema namespace containing every defined table into drizzle', () => {
    const fakeDb = { query: vi.fn() };
    drizzleMock.mockReturnValue(fakeDb);

    const db = createDb('postgresql://localhost/clmm');

    expect(drizzleMock).toHaveBeenCalledTimes(1);
    const drizzleCalls = drizzleMock.mock.calls as DrizzleCall[];
    const drizzleCall = drizzleCalls[0];
    if (drizzleCall == null) throw new Error('Expected drizzle to be called once');

    const [, config] = drizzleCall;
    expect(config.schema).toBeDefined();
    expect(typeof config.schema).toBe('object');

    // Source-of-truth assertion: schema namespace must include every table
    // exported from packages/adapters/src/outbound/storage/schema/index.ts.
    // If schema/index.ts adds a table, this list updates by re-running the test.
    const schemaKeys = Object.keys(config.schema ?? {});
    expect(schemaKeys).toEqual(
      expect.arrayContaining([
        'walletChallenges',
        'monitoredWallets',
        'executionAttempts',
        'executionSessions',
        'notificationDedup',
        'notificationEvents',
        'executionPreviews',
        'historyEvents',
        'walletPositionOwnership',
        'preparedPayloads',
        'breachEpisodes',
        'exitTriggers',
      ]),
    );

    expect(db).toBe(fakeDb);
  });
});
```

- [ ] **Step 2: Run the strengthened test against the current (unrefactored) `db.ts` and confirm it passes**

Run: `pnpm --filter @clmm/adapters test src/outbound/storage/db.test.ts`
Expected: PASS. The current `db.ts` spreads each schema module's exports, so `walletChallenges` etc. are present.

(Why this test passes pre-refactor: the existing `db.ts` already merges every schema module via spread. The refactor in Step 3 changes how the namespace is built, not what's in it. Running the strengthened test now establishes the baseline; if Step 3 regresses, this test catches it.)

- [ ] **Step 3: Refactor `db.ts` to consume `schema/index.ts`**

Replace the entire contents of `packages/adapters/src/outbound/storage/db.ts` with:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres = require('postgres');
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
```

- [ ] **Step 4: Run the test and confirm it still passes**

Run: `pnpm --filter @clmm/adapters test src/outbound/storage/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full adapter test suite to confirm no regressions in storage adapters that import `Db`**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS.

- [ ] **Step 6: Run typecheck to confirm no downstream type breakage**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/outbound/storage/db.ts \
        packages/adapters/src/outbound/storage/db.test.ts
git commit -m "refactor(adapters): consume schema/index.ts in db.ts and re-export schema

Single source of truth for the schema registry. Both db.ts (drizzle ORM
registration) and the upcoming SchemaReadiness module will consume the
same export. Strengthens db.test.ts to assert the namespace contains
every known table.

Refs: #58"
```

---

## Task 2: Create the `SchemaReadiness` library

**Files:**
- Create: `packages/adapters/src/outbound/storage/SchemaReadiness.ts`
- Create: `packages/adapters/src/outbound/storage/SchemaReadiness.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `packages/adapters/src/outbound/storage/SchemaReadiness.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { checkSchemaReadiness } from './SchemaReadiness.js';
import type { Db } from './db.js';

function makeDbWithPresentTables(present: string[]): Db {
  return {
    execute: vi.fn(async () =>
      present.map((table_name) => ({ table_name })),
    ),
  } as unknown as Db;
}

const fixtureTableA = pgTable('fixture_a', { id: text('id').primaryKey() });
const fixtureTableB = pgTable('fixture_b', { id: text('id').primaryKey() });

describe('checkSchemaReadiness', () => {
  it('returns ready: true when every expected table is present', async () => {
    const db = makeDbWithPresentTables(['fixture_a', 'fixture_b']);
    const namespace = { fixtureTableA, fixtureTableB };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({ ready: true });
  });

  it('returns ready: false with sorted missing list when tables are absent', async () => {
    const db = makeDbWithPresentTables([]);
    const namespace = { fixtureTableA, fixtureTableB };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({
      ready: false,
      missing: ['fixture_a', 'fixture_b'],
    });
  });

  it('returns missing list with only the absent tables', async () => {
    const db = makeDbWithPresentTables(['fixture_b']);
    const namespace = { fixtureTableA, fixtureTableB };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({
      ready: false,
      missing: ['fixture_a'],
    });
  });

  it('filters non-table exports from the namespace', async () => {
    const executeMock = vi.fn(async () => [{ table_name: 'fixture_a' }]);
    const db = { execute: executeMock } as unknown as Db;
    const namespace = {
      fixtureTableA,
      // these are non-table values that come from `export *` (relations,
      // helper functions, types stripped at runtime). The check must skip them.
      fixtureRelation: { __isNotATable: true },
      fixtureHelper: () => 'hello',
      fixtureNumber: 42,
      fixtureNull: null,
    };

    const result = await checkSchemaReadiness(db, namespace);

    expect(result).toEqual({ ready: true });
    // Only the one real table name should have been queried.
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('returns ready: true vacuously when the namespace has no tables', async () => {
    const executeMock = vi.fn();
    const db = { execute: executeMock } as unknown as Db;

    const result = await checkSchemaReadiness(db, { notATable: 123 });

    expect(result).toEqual({ ready: true });
    // Skip the round-trip when there's nothing to check.
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('passes the expected table list to information_schema query', async () => {
    const executeMock = vi.fn(async () => [
      { table_name: 'fixture_a' },
      { table_name: 'fixture_b' },
    ]);
    const db = { execute: executeMock } as unknown as Db;
    const namespace = { fixtureTableA, fixtureTableB };

    await checkSchemaReadiness(db, namespace);

    expect(executeMock).toHaveBeenCalledTimes(1);
    // The query is constructed as a Drizzle SQL template; we don't
    // assert the exact SQL string (that's an internal detail), but we
    // assert one round-trip and rely on integration verification at deploy.
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm --filter @clmm/adapters test src/outbound/storage/SchemaReadiness.test.ts`
Expected: FAIL with "Cannot find module './SchemaReadiness.js'".

- [ ] **Step 3: Write the minimal implementation**

Create `packages/adapters/src/outbound/storage/SchemaReadiness.ts`:

```ts
import { is, getTableName, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from './db.js';

export type SchemaReadinessResult =
  | { ready: true }
  | { ready: false; missing: string[] };

export async function checkSchemaReadiness(
  db: Db,
  schemaNamespace: Record<string, unknown>,
): Promise<SchemaReadinessResult> {
  const expected = Object.values(schemaNamespace)
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => getTableName(table));

  if (expected.length === 0) return { ready: true };

  const rows = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY(${expected})
  `);

  const present = new Set((rows as Array<{ table_name: string }>).map((row) => row.table_name));
  const missing = expected.filter((table) => !present.has(table)).sort();

  return missing.length === 0 ? { ready: true } : { ready: false, missing };
}
```

Notes for the implementer:
- `db.execute<T>(sql\`...\`)` is the drizzle-orm/postgres-js raw-SQL escape hatch. It returns row arrays directly (not a `{ rows }` wrapper).
- The cast `rows as Array<{ table_name: string }>` is a defensive narrow because `db.execute`'s return type is unioned across drivers.
- `is(value, PgTable)` is Drizzle's runtime type predicate; `PgTable` from `drizzle-orm/pg-core` is the abstract base that every `pgTable(...)` instance subclasses.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @clmm/adapters test src/outbound/storage/SchemaReadiness.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: exit 0.

- [ ] **Step 6: Run lint**

Run: `pnpm --filter @clmm/adapters lint`
Expected: exit 0. If lint flags the `as unknown as Db` cast in the test, the implementer adds a `// eslint-disable-next-line @typescript-eslint/...` comment scoped to that line — do not weaken the assertion.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/outbound/storage/SchemaReadiness.ts \
        packages/adapters/src/outbound/storage/SchemaReadiness.test.ts
git commit -m "feat(adapters): add SchemaReadiness library

Pure function checkSchemaReadiness(db, schemaNamespace) that derives
expected tables from a Drizzle schema namespace via is(value, PgTable)
and queries information_schema.tables in one round-trip. Returns
{ ready: true } or { ready: false, missing: [...] } sorted.

No caching. No env-var override. Single source of truth: the namespace
passed in (which production callers will source from schema/index.ts).

Refs: #58"
```

---

## Task 3: Add `DB` token + `AppModule` provider

**Why before HealthController:** The next task injects `DB` into `HealthController`. The token must exist first.

**Files:**
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 1: Add the `DB` token**

Edit `packages/adapters/src/inbound/http/tokens.ts`. Append at the end:

```ts
export const DB = 'DB';
```

- [ ] **Step 2: Wire the provider in `AppModule`**

Edit `packages/adapters/src/inbound/http/AppModule.ts`.

In the `tokens.ts` import block (line ~34-55), add `DB` to the imported names:

```ts
import {
  TRIGGER_REPOSITORY,
  // ... existing tokens ...
  INSIGHTS_API_KEY,
  DB,
} from './tokens.js';
```

In the `providers` array (`@Module({ providers: [...] })` starting at line ~106), add a new provider entry. Place it near the top of the array, just after the existing wallet/storage providers:

```ts
{ provide: DB, useValue: db },
```

The `db` constant is already declared at line 59 (`const db = createDb(dbUrl);`); we're exposing the same instance through DI.

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: exit 0.

- [ ] **Step 4: Run the full HTTP test suite to confirm no DI graph regressions**

Run: `pnpm --filter @clmm/adapters test src/inbound/http`
Expected: PASS for every existing test (HealthController, WalletController, etc.).

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts \
        packages/adapters/src/inbound/http/AppModule.ts
git commit -m "feat(adapters): expose Db via DB DI token

Exposes the existing module-level db instance through Nest DI so the
upcoming schema-aware HealthController can inject it. The same db
instance is already shared with every storage adapter; this is
re-use, not a second connection.

Refs: #58"
```

---

## Task 4: Make `HealthController` schema-aware

**Files:**
- Modify: `packages/adapters/src/inbound/http/HealthController.ts`
- Modify: `packages/adapters/src/inbound/http/HealthController.test.ts`

- [ ] **Step 1: Write failing tests for the new contract**

Replace the entire contents of `packages/adapters/src/inbound/http/HealthController.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';

const { checkSchemaReadinessMock } = vi.hoisted(() => ({
  checkSchemaReadinessMock: vi.fn(),
}));

vi.mock('../../outbound/storage/SchemaReadiness.js', () => ({
  checkSchemaReadiness: checkSchemaReadinessMock,
}));

vi.mock('../../outbound/storage/db.js', () => ({
  schema: { walletChallenges: 'fake-table' },
}));

import { HealthController } from './HealthController.js';
import type { Db } from '../../outbound/storage/db.js';

const fakeDb = { __isFakeDb: true } as unknown as Db;

describe('HealthController', () => {
  beforeEach(() => {
    checkSchemaReadinessMock.mockReset();
  });

  it('returns { status: "ok" } when schema readiness passes', async () => {
    checkSchemaReadinessMock.mockResolvedValue({ ready: true });
    const controller = new HealthController(fakeDb);

    const result = await controller.health();

    expect(result).toEqual({ status: 'ok' });
    expect(checkSchemaReadinessMock).toHaveBeenCalledWith(
      fakeDb,
      expect.any(Object),
    );
  });

  it('throws 503 with missing list when schema readiness fails', async () => {
    checkSchemaReadinessMock.mockResolvedValue({
      ready: false,
      missing: ['wallet_challenges', 'monitored_wallets'],
    });
    const controller = new HealthController(fakeDb);

    await expect(controller.health()).rejects.toThrow(HttpException);

    try {
      await controller.health();
      throw new Error('Expected HttpException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(httpError.getResponse()).toEqual({
        status: 'not_ready',
        missing: ['wallet_challenges', 'monitored_wallets'],
      });
    }
  });

  it('lets readiness errors propagate (Nest default 500 mapping)', async () => {
    checkSchemaReadinessMock.mockRejectedValue(new Error('connection refused'));
    const controller = new HealthController(fakeDb);

    await expect(controller.health()).rejects.toThrow('connection refused');
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm --filter @clmm/adapters test src/inbound/http/HealthController.test.ts`
Expected: FAIL — current `HealthController` has no constructor parameter and returns sync `{ status: 'ok' }` unconditionally.

- [ ] **Step 3: Update `HealthController.ts`**

Replace the entire contents of `packages/adapters/src/inbound/http/HealthController.ts` with:

```ts
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { checkSchemaReadiness } from '../../outbound/storage/SchemaReadiness.js';
import { schema, type Db } from '../../outbound/storage/db.js';
import { DB } from './tokens.js';

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    const result = await checkSchemaReadiness(this.db, schema);
    if (result.ready) return { status: 'ok' };
    throw new HttpException(
      { status: 'not_ready', missing: result.missing },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm --filter @clmm/adapters test src/inbound/http/HealthController.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Run full adapter test suite**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS for everything.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/inbound/http/HealthController.ts \
        packages/adapters/src/inbound/http/HealthController.test.ts
git commit -m "feat(adapters): make /health schema-aware

HealthController now calls checkSchemaReadiness on every request and
returns 503 { status: 'not_ready', missing: [...] } when any table
defined in the Drizzle schema is missing in the DB. Railway healthcheck
will hold traffic from a pod with missing schema; running pods are not
torn down — they just stay unhealthy until the migration lands.

Refs: #58"
```

---

## Task 5: Worker startup gate

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/main.ts`
- Create: `packages/adapters/src/inbound/jobs/main.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/adapters/src/inbound/jobs/main.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  createDbMock,
  checkSchemaReadinessMock,
  createApplicationContextMock,
  exitMock,
  errorMock,
} = vi.hoisted(() => ({
  createDbMock: vi.fn(),
  checkSchemaReadinessMock: vi.fn(),
  createApplicationContextMock: vi.fn(),
  exitMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock('../../outbound/storage/db.js', () => ({
  createDb: createDbMock,
  schema: { walletChallenges: 'fake-table' },
}));

vi.mock('../../outbound/storage/SchemaReadiness.js', () => ({
  checkSchemaReadiness: checkSchemaReadinessMock,
}));

vi.mock('@nestjs/core', () => ({
  NestFactory: {
    createApplicationContext: createApplicationContextMock,
  },
}));

vi.mock('./WorkerModule.js', () => ({
  WorkerModule: class WorkerModule {},
}));

import { bootstrap } from './main.js';

describe('worker bootstrap', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;
  const originalError = console.error;

  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://localhost/clmm' };
    // Cast through unknown because process.exit's type is `(code?: number) => never`
    // and our mock returns void. Tests assert calls, not termination.
    (process as unknown as { exit: typeof exitMock }).exit = exitMock;
    console.error = errorMock;

    createDbMock.mockReset();
    checkSchemaReadinessMock.mockReset();
    createApplicationContextMock.mockReset();
    exitMock.mockReset();
    errorMock.mockReset();

    createDbMock.mockReturnValue({ __isFakeGateDb: true });
    createApplicationContextMock.mockResolvedValue({ close: vi.fn() });
  });

  afterEach(() => {
    process.env = originalEnv;
    (process as unknown as { exit: typeof originalExit }).exit = originalExit;
    console.error = originalError;
  });

  it('proceeds to NestFactory when readiness check passes', async () => {
    checkSchemaReadinessMock.mockResolvedValue({ ready: true });

    await bootstrap();

    expect(createDbMock).toHaveBeenCalledWith('postgresql://localhost/clmm');
    expect(checkSchemaReadinessMock).toHaveBeenCalledTimes(1);
    expect(createApplicationContextMock).toHaveBeenCalledTimes(1);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('logs fatal and exits 1 when readiness check fails', async () => {
    checkSchemaReadinessMock.mockResolvedValue({
      ready: false,
      missing: ['wallet_challenges'],
    });

    await bootstrap();

    expect(createApplicationContextMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errorMock).toHaveBeenCalledTimes(1);

    const errorCalls = errorMock.mock.calls as Array<[string]>;
    const [logLine] = errorCalls[0] ?? [''];
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed['level']).toBe('fatal');
    expect(parsed['message']).toMatch(/schema readiness check failed/);
    expect(parsed['missing']).toEqual(['wallet_challenges']);
    expect(parsed['timestamp']).toEqual(expect.any(String));
  });

  it('logs fatal and exits 1 when DATABASE_URL is unset', async () => {
    process.env = { ...originalEnv };
    delete process.env['DATABASE_URL'];

    await bootstrap();

    expect(createDbMock).not.toHaveBeenCalled();
    expect(checkSchemaReadinessMock).not.toHaveBeenCalled();
    expect(createApplicationContextMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);

    const errorCalls = errorMock.mock.calls as Array<[string]>;
    const [logLine] = errorCalls[0] ?? [''];
    const parsed = JSON.parse(logLine) as Record<string, unknown>;
    expect(parsed['message']).toMatch(/DATABASE_URL not set/);
  });

  it('logs fatal and exits 1 when DATABASE_URL is empty string', async () => {
    process.env = { ...originalEnv, DATABASE_URL: '' };

    await bootstrap();

    expect(createDbMock).not.toHaveBeenCalled();
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `pnpm --filter @clmm/adapters test src/inbound/jobs/main.test.ts`
Expected: FAIL — `bootstrap` is not exported from `main.ts`, and the gate logic does not exist.

- [ ] **Step 3: Update `main.ts` with the gate**

Replace the entire contents of `packages/adapters/src/inbound/jobs/main.ts` with:

```ts
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './WorkerModule.js';
import { createDb, schema } from '../../outbound/storage/db.js';
import { checkSchemaReadiness } from '../../outbound/storage/SchemaReadiness.js';

export async function bootstrap(): Promise<void> {
  const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'];
  if (dbUrl == null || dbUrl === '') {
    console.error(JSON.stringify({
      level: 'fatal',
      message: 'Worker: DATABASE_URL not set',
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
    return;
  }

  const gateDb = createDb(dbUrl);
  const readiness = await checkSchemaReadiness(gateDb, schema);
  if (!readiness.ready) {
    console.error(JSON.stringify({
      level: 'fatal',
      message: 'Worker: schema readiness check failed; refusing to start',
      missing: readiness.missing,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
    return;
  }

  const app = await NestFactory.createApplicationContext(WorkerModule);

  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, () => {
      console.log(`Worker received ${signal}, shutting down...`);
      void app.close().finally(() => {
        process.exit(0);
      });
    });
  }

  console.log('Worker: schema readiness OK; pg-boss starting');
}

if (require.main === module) {
  void bootstrap();
}
```

Notes:
- The `return;` after `process.exit(1)` is required for tests where `process.exit` is mocked and does not actually terminate the process. In production it's a no-op.
- The `if (require.main === module)` guard mirrors the HTTP entry point. CJS-confirmed under the production tsconfig.
- The pre-Nest gate uses a dedicated `gateDb`; this leaves a connection open after the gate passes, which is acceptable (Postgres handles idle connections cheaply, and the alternative — explicit shutdown — pulls postgres-js shutdown semantics into bootstrap for no benefit).

- [ ] **Step 4: Run tests and confirm they pass**

Run: `pnpm --filter @clmm/adapters test src/inbound/jobs/main.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Run full adapter test suite**

Run: `pnpm --filter @clmm/adapters test`
Expected: PASS for everything.

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm --filter @clmm/adapters typecheck`
Expected: exit 0.

Run: `pnpm --filter @clmm/adapters lint`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/inbound/jobs/main.ts \
        packages/adapters/src/inbound/jobs/main.test.ts
git commit -m "feat(adapters): worker startup schema readiness gate

Worker bootstrap runs checkSchemaReadiness against a throwaway db
before NestFactory.createApplicationContext. Missing schema or unset
DATABASE_URL → structured fatal log + process.exit(1). Railway
restartPolicyType=ON_FAILURE retries until the API service's
preDeployCommand migrates the schema.

The gate lives in main.ts (not WorkerLifecycle.onModuleInit) so the
full Nest+pg-boss stack never initializes against a half-migrated DB.

Refs: #58"
```

---

## Task 6: Add `start:api` script

**Files:**
- Modify: `packages/adapters/package.json`

- [ ] **Step 1: Add the script**

Edit `packages/adapters/package.json`. In the `scripts` block, add `start:api` next to `start:worker`:

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.typecheck.json --noEmit",
    "build": "tsc -p tsconfig.json",
    "build:worker": "tsc -p tsconfig.json",
    "start:api": "node dist/inbound/http/main.js",
    "start:worker": "node dist/inbound/jobs/main.js",
    "lint": "eslint src --ext .ts",
    "dev:api": "tsx src/inbound/http/main.ts",
    "dev:worker": "tsx src/inbound/jobs/main.ts",
    "db:migrate": "drizzle-kit migrate",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 2: Verify the build emits the expected file**

Run: `pnpm --filter @clmm/adapters build`
Expected: exit 0, no errors.

Run: `ls packages/adapters/dist/inbound/http/main.js`
Expected: file exists.

- [ ] **Step 3: Smoke-test that `start:api` boots without immediate error**

Run, then `Ctrl+C` after ~3 seconds: `PORT=3099 pnpm --filter @clmm/adapters start:api`
Expected output includes `BFF listening on 0.0.0.0:3099`.

If the process exits 0 immediately (no log line), the CJS guard is broken under the production build — investigate before continuing. (Pre-flight verified CJS output, so this is a sanity check only.)

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/package.json
git commit -m "feat(adapters): add start:api production script

node dist/inbound/http/main.js. Used by Railway preDeployCommand-gated
deploy. Mirrors the existing start:worker convention.

Refs: #58"
```

---

## Task 7: Railway deploy configuration

**Decision point.** Choose Path A (committed config) or Path B (dashboard-only) before doing any work in this task.

**Files (Path A):**
- Create: `packages/adapters/railway.api.toml`
- Create: `packages/adapters/railway.worker.toml`

**Files (Path B):**
- (None — Path B work happens entirely in Task 8 inside the runbook.)

- [ ] **Step 1: Verify Railway dashboard prerequisites**

The implementer must verify (with the user, or via Railway dashboard access) **both** of:

1. The CLMM Railway project has exactly one API service and one worker service (no environment-specific service forks that would conflict with one shared file).
2. Railway is set up to read service-scoped config from this repo. Either:
   - Each service points at this repo and lets a per-service "Config-as-code path" be set in the Railway dashboard, OR
   - Railway picks up a root `railway.toml` and routes by service name (less common).

Record the answer in the upcoming PR description.

If **both** verified → proceed with Step 2 (Path A).
If **either** fails → skip to Step 6 (Path B fallback).

- [ ] **Step 2 (Path A): Create the API config file**

Create `packages/adapters/railway.api.toml`:

```toml
# CLMM API service deploy contract.
#
# Owner of database migrations. preDeployCommand runs drizzle-kit migrate
# before any new API instance serves traffic. /health is schema-aware:
# it returns 503 with the missing-tables list while schema is incomplete,
# so Railway's healthcheck holds traffic from pre-migration pods.
#
# DO NOT hand-edit the corresponding fields in the Railway dashboard.
# This file is the source of truth.

[deploy]
preDeployCommand   = "pnpm --filter @clmm/adapters db:migrate"
startCommand       = "pnpm --filter @clmm/adapters start:api"
healthcheckPath    = "/health"
healthcheckTimeout = 30
restartPolicyType  = "ON_FAILURE"
```

- [ ] **Step 3 (Path A): Create the worker config file**

Create `packages/adapters/railway.worker.toml`:

```toml
# CLMM Worker service deploy contract.
#
# IMPORTANT: Worker MUST NOT run migrations. The API service is the sole
# migration owner (railway.api.toml preDeployCommand). The worker
# bootstrap runs a schema readiness check before any pg-boss listener
# attaches and exits non-zero on missing schema, so a worker deploy
# that races ahead of an API migration will restart-loop until the API
# catches up — never process jobs against a half-migrated DB.
#
# DO NOT hand-edit the corresponding fields in the Railway dashboard.

[deploy]
startCommand      = "pnpm --filter @clmm/adapters start:worker"
restartPolicyType = "ON_FAILURE"
```

- [ ] **Step 4 (Path A): Configure Railway to read these files**

In the Railway dashboard:
- API service → Settings → Config-as-code path → `packages/adapters/railway.api.toml`.
- Worker service → Settings → Config-as-code path → `packages/adapters/railway.worker.toml`.

(This step is performed by the operator/user, not by the implementer's code edits. Capture confirmation in the PR description.)

- [ ] **Step 5 (Path A): Commit**

```bash
git add packages/adapters/railway.api.toml \
        packages/adapters/railway.worker.toml
git commit -m "ops: commit per-service Railway deploy config

API service:    preDeployCommand runs db:migrate before traffic;
                startCommand uses production start:api;
                healthcheckPath=/health (schema-aware).
Worker service: no preDeployCommand (single migration owner = API);
                startCommand uses production start:worker.

Both services use restartPolicyType=ON_FAILURE so a 503-answering API
or a gated-out worker stay in restart/healthcheck loop until the
schema migration lands.

Refs: #58"
```

Skip Step 6 if Path A was taken.

- [ ] **Step 6 (Path B fallback): Document the dashboard settings in the runbook**

If Path A was blocked, Task 8 (the runbook) embeds the dashboard settings as exact field values. There is nothing to commit in this task. The PR description must explicitly state:

> "Path A blocked because <specific reason — e.g., 'CLMM Railway project has separate staging+prod service pairs and committed per-service files would conflict with the per-environment dashboard variant'>. Reverting to Path B until <condition for re-evaluation>."

---

## Task 8: Write the deploy runbook

**Files:**
- Create: `docs/runbooks/railway-deploy.md`

- [ ] **Step 1: Create the runbook**

Create `docs/runbooks/railway-deploy.md` with the following content. **If Path B was taken in Task 7**, replace the "Config source" section with the dashboard-fields version called out below.

```markdown
# Railway Deploy Runbook (CLMM Backend)

Canonical deploy ordering and schema-readiness contract for the CLMM
backend services on Railway.

## Service topology

Two Railway services, both deploying from this repo:

| Service       | Role                          | Owns migrations? |
|---------------|-------------------------------|------------------|
| `clmm-api`    | NestJS + Fastify HTTP server  | **Yes**          |
| `clmm-worker` | pg-boss job runner            | No               |

The API is the sole migration owner. The worker MUST NOT run
migrations and MUST refuse to start against missing schema.

## Config source

**Current path: A (committed config).**  <!-- replace with B if applicable -->

API service config:    `packages/adapters/railway.api.toml`
Worker service config: `packages/adapters/railway.worker.toml`

In the Railway dashboard, each service's "Config-as-code path" points
at its respective file.

### Locked dashboard fields

The following fields are owned by the committed config files. Operators
MUST NOT hand-edit them in the dashboard — changes will either be
ignored on next deploy (when the file overrides) or silently drift
from review.

API service:
- `preDeployCommand`
- `startCommand`
- `healthcheckPath`
- `healthcheckTimeout`
- `restartPolicyType`

Worker service:
- `startCommand`
- `restartPolicyType`

<!--
If Path B (dashboard-only) was taken instead, replace the two sections
above with:

## Config source

**Current path: B (dashboard-only).**

Path A (committed config) is blocked: <reason>. Re-evaluate when
<condition>.

### Dashboard settings — `clmm-api` service

In Railway → clmm-api → Settings → Deploy:

- preDeployCommand    = pnpm --filter @clmm/adapters db:migrate
- startCommand        = pnpm --filter @clmm/adapters start:api
- healthcheckPath     = /health
- healthcheckTimeout  = 30
- restartPolicyType   = ON_FAILURE

### Dashboard settings — `clmm-worker` service

In Railway → clmm-worker → Settings → Deploy:

- preDeployCommand    = (LEAVE EMPTY — worker MUST NOT migrate)
- startCommand        = pnpm --filter @clmm/adapters start:worker
- restartPolicyType   = ON_FAILURE
-->

## Deploy ordering contract

Per merged commit, Railway performs:

```
1. Build code (both services in parallel).
2. clmm-api preDeployCommand runs `pnpm db:migrate`
   - On success: API deploy continues.
   - On failure: API deploy aborts; old API stays serving.
3. clmm-api startCommand boots Nest+Fastify on $PORT.
4. /health is polled.
   - Schema OK → 200 → Railway routes traffic to new pod.
   - Schema missing → 503 → Railway holds traffic; loops until 200.
5. clmm-worker startCommand runs `start:worker`.
   - Schema readiness gate runs BEFORE pg-boss attaches handlers.
   - Schema OK → pg-boss starts; worker is healthy.
   - Schema missing → fatal log + exit 1 → Railway restarts; loops.
```

If clmm-worker deploys before clmm-api migrates (worker is faster, or
API migration is delayed), the worker's gate keeps it in a restart
loop, and no jobs are processed against the half-migrated DB.

## Schema readiness behavior

Both probes derive their required-table list from
`packages/adapters/src/outbound/storage/schema/index.ts` via Drizzle's
`is(value, PgTable)` predicate. **Adding a schema file without
generating and running a corresponding migration WILL fail deploys.
This is intended.**

### API: `GET /health`

```
200 { "status": "ok" }
   schema verified

503 { "status": "not_ready", "missing": ["wallet_challenges", ...] }
   at least one expected table is absent in the DB
```

Railway healthcheck retries until 200. `restartPolicyType=ON_FAILURE`
means a pod that boots and answers 503 stays alive — Railway just
keeps marking it unhealthy until schema lands.

### Worker: bootstrap gate

```
log: Worker: schema readiness OK; pg-boss starting
   schema verified, pg-boss attaches handlers

log (stderr, JSON):
  { "level": "fatal",
    "message": "Worker: schema readiness check failed; refusing to start",
    "missing": [...],
    "timestamp": "..." }
process exits 1
   Railway restarts. Loop continues until schema lands.
```

## Manual post-deploy verification

Replace `$BFF_BASE_URL` with the Railway-assigned API URL, and
`<valid-wallet-address>` with a real Solana wallet that owns at least
one supported position.

```bash
curl -i $BFF_BASE_URL/health
# Expect: HTTP/1.1 200 OK
#         {"status":"ok"}

curl -i -X POST $BFF_BASE_URL/wallets/<valid-wallet-address>/challenge
# Expect: HTTP/1.1 200 OK
#         {"walletId":"...","nonce":"...","expiresAt":...,"message":"..."}
```

If `/health` returns 503, inspect the response body's `missing` list:
those tables exist in the Drizzle schema but not in the DB. Either
the migration didn't run (check Railway preDeployCommand logs) or it
ran against the wrong `DATABASE_URL` (check that the API service's
`DATABASE_URL` env var matches the one used by the migration step).

## Rollback

Drizzle does not auto-down. To revert a bad migration:

1. Write a new forward migration that undoes the change.
2. Commit and push.
3. Railway deploy runs the new forward migration in `preDeployCommand`.

Do **not** roll back via Railway-only redeploy of the prior commit:
the migration journal advances forward-only, and the old code may
expect tables/columns that the new migration removed or renamed.

## Anti-patterns (do not adopt)

These patterns are explicitly rejected. Each lists the failure mode.

- `pnpm db:migrate && node dist/...` as the start command
  - Multiple replicas race the same migration on every deploy/restart.
  - API and worker race each other.
  - Long migrations cause healthcheck loops on every pod restart.
  - Every process restart becomes a schema mutation attempt.

- Worker running `db:migrate` "as a backup"
  - Defeats the single-migration-owner rule.
  - Reintroduces the race the worker gate exists to prevent.

- Hardcoded `REQUIRED_TABLES` allowlist or env var to weaken the gate
  - Reintroduces drift: someone adds a schema, forgets the list,
    deploy looks healthy. Exact bug class this whole runbook prevents.
```

- [ ] **Step 2: Verify the runbook renders cleanly**

Run: `cat docs/runbooks/railway-deploy.md | head -50`
Visually confirm the markdown is well-formed.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/railway-deploy.md
git commit -m "docs: add Railway deploy runbook

Canonical deploy ordering + schema readiness contract for the CLMM
backend services. Documents service topology, locked dashboard fields,
deploy sequence, /health contract, worker gate, manual verification,
rollback procedure, and rejected anti-patterns.

Refs: #58"
```

---

## Task 9: Link the runbook from README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Find the existing Railway-secrets section**

Run: `grep -n "Railway deployment secrets\|Backend-only" README.md`
Expected: a line near 65 mentioning "Railway deployment secrets — DB, RPC, and cross-service credentials".

- [ ] **Step 2: Add a "Deploy" subsection right after that block**

Open `README.md`. Locate the section heading that contains the Railway-secrets line. **After** that section's content (and before the next top-level section), insert:

```markdown
## Deploy

The CLMM backend deploys to Railway as two services: `clmm-api` and
`clmm-worker`. The API service is the sole owner of database
migrations (`pnpm db:migrate` runs as a Railway `preDeployCommand`
before the API serves traffic). Both services refuse to operate
against missing schema: `/health` returns 503 with the missing-tables
list; the worker exits non-zero on bootstrap.

Source of truth: [`docs/runbooks/railway-deploy.md`](docs/runbooks/railway-deploy.md).
```

(If the README has a different section heading style — e.g., `###` vs `##` — match the surrounding style. Don't introduce a new heading depth.)

- [ ] **Step 3: Verify with a quick visual check**

Run: `grep -n "Deploy\|railway-deploy" README.md`
Expected: the new "Deploy" heading and the link to `docs/runbooks/railway-deploy.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): link to Railway deploy runbook

Two-line summary of the migration ownership rule and a link to the
canonical runbook. README points; runbook owns the contract.

Refs: #58"
```

---

## Task 10: Update the release checklist

**Files:**
- Modify: `docs/architecture/release-checklist.md`

- [ ] **Step 1: Append the new section**

Open `docs/architecture/release-checklist.md`. **Append** to the end of the file:

```markdown
## Deploy / Schema Readiness

- [ ] API service Railway config has `preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"`
- [ ] API service Railway config has `startCommand = "pnpm --filter @clmm/adapters start:api"` (not `dev:api`)
- [ ] Worker service Railway config has no `preDeployCommand`
- [ ] `GET /health` returns 503 with `missing` list when any schema table is missing in the target DB (verify in staging by pointing the API at an unmigrated DB)
- [ ] Worker exits non-zero with the structured fatal log when schema is missing (same verification)
- [ ] `wallet_challenges` table exists in production DB after deploy
- [ ] No `READINESS_REQUIRED_TABLES` env var or hardcoded allowlist exists in production code paths
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/release-checklist.md
git commit -m "docs(release-checklist): add deploy/schema-readiness section

Adds the audit checklist for issue #58. Catches the failure mode of
'someone added a schema file but forgot the migration' as a
release-time check, in addition to the runtime gates.

Refs: #58"
```

---

## Task 11: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run typecheck across the workspace**

Run: `pnpm typecheck`
Expected: exit 0 across every package.

- [ ] **Step 2: Run lint across the workspace**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 3: Run all tests across the workspace**

Run: `pnpm test`
Expected: exit 0; no skipped suites; no `.only` left behind.

- [ ] **Step 4: Run boundaries**

Run: `pnpm boundaries`
Expected: exit 0.

- [ ] **Step 5: Build the adapters package end-to-end**

Run: `pnpm --filter @clmm/adapters build`
Expected: exit 0.

Run: `ls packages/adapters/dist/inbound/http/main.js packages/adapters/dist/inbound/jobs/main.js packages/adapters/dist/outbound/storage/SchemaReadiness.js`
Expected: all three files exist.

- [ ] **Step 6: Smoke-test the API gate locally**

In one terminal, point the API at a database that's missing at least
one schema table (or use a fresh empty DB):

```bash
PORT=3099 DATABASE_URL=postgresql://localhost/clmm_empty pnpm --filter @clmm/adapters start:api
```

In another terminal:

```bash
curl -i http://localhost:3099/health
# Expect: HTTP/1.1 503 Service Unavailable
#         {"status":"not_ready","missing":[...]}
```

Then run `pnpm --filter @clmm/adapters db:migrate` against that DB and re-curl:

```bash
curl -i http://localhost:3099/health
# Expect: HTTP/1.1 200 OK
#         {"status":"ok"}
```

If the API process exits 0 immediately after `start:api`, the CJS
guard is broken under the production build — investigate before
opening the PR.

- [ ] **Step 7: Smoke-test the worker gate locally**

Point the worker at the same empty DB:

```bash
DATABASE_URL=postgresql://localhost/clmm_empty pnpm --filter @clmm/adapters start:worker
```

Expected: a single JSON log line on stderr matching:

```json
{"level":"fatal","message":"Worker: schema readiness check failed; refusing to start","missing":[...],"timestamp":"..."}
```

Process exits with code 1.

Then run migrations and retry:

```bash
DATABASE_URL=postgresql://localhost/clmm_empty pnpm --filter @clmm/adapters db:migrate
DATABASE_URL=postgresql://localhost/clmm_empty pnpm --filter @clmm/adapters start:worker
```

Expected: `Worker: schema readiness OK; pg-boss starting`. Worker stays alive (Ctrl+C to stop).

- [ ] **Step 8: Open the PR**

Push the branch and open a pull request. The PR description must include:

- Link to issue #58.
- Path A vs Path B decision and the verification result (which Railway dashboard checks passed).
- A note that frontend `NETWORK_ERROR` error mapping is **not** in this PR and is tracked as a separate follow-up issue (file the follow-up first if it doesn't exist; link it from the PR description).
- Manual verification log: paste the curl outputs from Steps 6–7.

- [ ] **Step 9: File the follow-up issue**

If not already filed, open a new issue in the repo titled approximately:

> Frontend: split NETWORK_ERROR into HTTP_404 / HTTP_500 / MALFORMED_RESPONSE / NETWORK_ERROR

Body should reference issue #58 and quote the "Follow-up client hardening" section of that issue. Link this new issue from the current PR description.

---

## Acceptance — final cross-check against the spec

Before marking the PR ready for review, walk this checklist top to bottom:

- [ ] `start:api` script exists in `packages/adapters/package.json` and runs `node dist/inbound/http/main.js`.
- [ ] `dist/inbound/http/main.js` invokes `bootstrap()` under `node` (CJS guard works).
- [ ] Path A files committed at `packages/adapters/railway.api.toml` and `packages/adapters/railway.worker.toml`, OR Path B fallback documented in PR description with reason.
- [ ] If Path A: API has `preDeployCommand = "pnpm --filter @clmm/adapters db:migrate"`; worker has no `preDeployCommand`.
- [ ] `db.ts` consumes `schema/index.ts`; `schema/index.ts` is the single source of truth for required-table derivation.
- [ ] `SchemaReadiness.ts` exports `checkSchemaReadiness(db, schemaNamespace)`; uses Drizzle's `is(value, PgTable)` + `getTableName`; one round-trip `information_schema.tables` query.
- [ ] `GET /health` returns `503 { status: 'not_ready', missing: [...] }` when any schema table is missing; `200 { status: 'ok' }` otherwise.
- [ ] `DB` token added to `inbound/http/tokens.ts`; `AppModule` provides it via `useValue: db`.
- [ ] Worker `main.ts` runs the gate before `NestFactory.createApplicationContext`; structured fatal log + `process.exit(1)` on missing schema or unset `DATABASE_URL`.
- [ ] No `READINESS_REQUIRED_TABLES` env var or hardcoded allowlist in production code paths.
- [ ] `docs/runbooks/railway-deploy.md` exists and documents service topology, config source, locked dashboard fields, deploy ordering, schema readiness behavior, manual verification, rollback, anti-patterns.
- [ ] `README.md` links to the new runbook from a "Deploy" subsection.
- [ ] `docs/architecture/release-checklist.md` has the new "Deploy / Schema Readiness" section.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries` all green.
- [ ] Manual verification (steps 6–7) captured in PR description.
- [ ] Frontend `NETWORK_ERROR` follow-up issue filed and linked.
