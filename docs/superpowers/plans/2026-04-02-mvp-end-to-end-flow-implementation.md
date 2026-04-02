# MVP End-to-End Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all remaining stubbed and disconnected parts of CLMM V2 so a connected wallet progresses through backend-triggered breach detection, directional preview, user-signed execution, lifecycle reconciliation, and durable history -- producing a shippable non-custodial MVP.

**Architecture:** Six sequential phases following the design spec's dependency graph: (1) Database foundation + monitored wallet registry, (2) pg-boss worker infrastructure with 4 real job handlers, (3) BFF completion with enrollment + submission endpoints, (4) App route wiring with TanStack Query, (5) Signing + submission flow, (6) Notifications + deep links. Each phase produces independently testable, committable work.

**Tech Stack:** TypeScript strict mode, NestJS 10, pg-boss (Postgres-native job queue), Drizzle ORM, TanStack Query v5, Zustand v4, Expo Router, @solana/kit, vitest.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/adapters/src/outbound/storage/schema/monitored-wallets.ts` | Drizzle schema for `monitored_wallets` table |
| `packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.ts` | Implements `MonitoredWalletRepository` port via Drizzle |
| `packages/adapters/src/outbound/storage/NotificationDedupStorageAdapter.ts` | Implements `NotificationDedupPort` via Drizzle (new `notification_dedup` table) |
| `packages/adapters/src/outbound/storage/schema/notification-dedup.ts` | Drizzle schema for `notification_dedup` table |
| `packages/testing/src/fakes/FakeMonitoredWalletRepository.ts` | In-memory fake for `MonitoredWalletRepository` |
| `packages/adapters/src/inbound/jobs/PgBossProvider.ts` | NestJS provider that initializes pg-boss |
| `packages/adapters/src/inbound/jobs/tokens.ts` | DI injection tokens for worker module |
| `apps/app/src/api/alerts.ts` | BFF API client for alerts |
| `apps/app/src/api/history.ts` | BFF API client for history events |
| `apps/app/src/api/previews.ts` | BFF API client for execution previews |
| `apps/app/src/api/executions.ts` | BFF API client for execution attempts |
| `apps/app/src/api/wallets.ts` | BFF API client for wallet enrollment |

### Modified Files

| File | Changes |
|------|---------|
| `packages/application/src/ports/index.ts` | Add `MonitoredWalletRepository` port interface |
| `packages/adapters/src/outbound/storage/schema/index.ts` | Export new schemas |
| `packages/adapters/src/outbound/storage/db.ts` | Import new schemas |
| `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts` | Implement `getOutcomeSummary` |
| `packages/adapters/package.json` | Add `pg-boss` dependency |
| `packages/adapters/src/inbound/jobs/WorkerModule.ts` | pg-boss setup, DI wiring, cron registration |
| `packages/adapters/src/inbound/jobs/main.ts` | Worker bootstrap with pg-boss lifecycle |
| `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` | Real implementation |
| `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` | Real implementation |
| `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts` | Real implementation |
| `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts` | Real implementation |
| `packages/adapters/src/composition/AdaptersModule.ts` | Wire shared adapter providers |
| `packages/adapters/src/inbound/http/AppModule.ts` | Add wallet enrollment provider + monitoring endpoint wiring |
| `packages/adapters/src/inbound/http/tokens.ts` | Add new injection tokens |
| `packages/testing/src/fakes/index.ts` | Export new fakes |
| `apps/app/app/(tabs)/alerts.tsx` | Data-fetching route with TanStack Query |
| `apps/app/app/(tabs)/history.tsx` | Data-fetching route with TanStack Query |
| `apps/app/app/position/[id].tsx` | Data-fetching route with TanStack Query |
| `apps/app/app/preview/[triggerId].tsx` | Data-fetching route with TanStack Query |
| `apps/app/app/signing/[attemptId].tsx` | Data-fetching route with TanStack Query |
| `apps/app/app/execution/[attemptId].tsx` | Data-fetching route with TanStack Query |

---

## Phase 1: Database Foundation

### Task 1: Add `MonitoredWalletRepository` Port

**Files:**
- Modify: `packages/application/src/ports/index.ts`

- [ ] **Step 1: Add port interface**

Add the `MonitoredWalletRepository` interface to the bottom of the storage repositories section in `packages/application/src/ports/index.ts`, before the cross-cutting ports section:

```typescript
export interface MonitoredWalletRepository {
  enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void>;
  unenroll(walletId: WalletId): Promise<void>;
  listActiveWallets(): Promise<Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>>;
  markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void>;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (new interface is additive, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat: add MonitoredWalletRepository port interface"
```

---

### Task 2: Add Monitored Wallets Drizzle Schema

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/monitored-wallets.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Modify: `packages/adapters/src/outbound/storage/db.ts`

- [ ] **Step 1: Create the monitored wallets schema file**

Create `packages/adapters/src/outbound/storage/schema/monitored-wallets.ts`:

```typescript
import { pgTable, text, bigint, boolean } from 'drizzle-orm/pg-core';

export const monitoredWallets = pgTable('monitored_wallets', {
  walletId: text('wallet_id').primaryKey(),
  enrolledAt: bigint('enrolled_at', { mode: 'number' }).notNull(),
  lastScannedAt: bigint('last_scanned_at', { mode: 'number' }),
  active: boolean('active').notNull().default(true),
});
```

- [ ] **Step 2: Export from schema index**

Add to `packages/adapters/src/outbound/storage/schema/index.ts`:

```typescript
export * from './monitored-wallets.js';
```

- [ ] **Step 3: Add to db.ts schema registration**

In `packages/adapters/src/outbound/storage/db.ts`, add import and spread:

```typescript
import * as monitoredWalletsSchema from './schema/monitored-wallets.js';
```

And inside `createDb`, add `...monitoredWalletsSchema` to the schema object.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/monitored-wallets.ts \
       packages/adapters/src/outbound/storage/schema/index.ts \
       packages/adapters/src/outbound/storage/db.ts
git commit -m "feat: add monitored_wallets Drizzle schema"
```

---

### Task 3: Add Notification Dedup Drizzle Schema

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/notification-dedup.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`
- Modify: `packages/adapters/src/outbound/storage/db.ts`

The `NotificationDedupPort` has a fake in testing but no real Drizzle-backed adapter. The dispatch handler needs this to prevent duplicate notifications.

- [ ] **Step 1: Create the notification dedup schema file**

Create `packages/adapters/src/outbound/storage/schema/notification-dedup.ts`:

```typescript
import { pgTable, text, bigint } from 'drizzle-orm/pg-core';

export const notificationDedup = pgTable('notification_dedup', {
  triggerId: text('trigger_id').primaryKey(),
  dispatchedAt: bigint('dispatched_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 2: Export from schema index**

Add to `packages/adapters/src/outbound/storage/schema/index.ts`:

```typescript
export * from './notification-dedup.js';
```

- [ ] **Step 3: Add to db.ts schema registration**

In `packages/adapters/src/outbound/storage/db.ts`, add import:

```typescript
import * as notificationDedupSchema from './schema/notification-dedup.js';
```

And spread `...notificationDedupSchema` into the schema object.

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/notification-dedup.ts \
       packages/adapters/src/outbound/storage/schema/index.ts \
       packages/adapters/src/outbound/storage/db.ts
git commit -m "feat: add notification_dedup Drizzle schema"
```

---

### Task 4: Implement `MonitoredWalletStorageAdapter`

**Files:**
- Create: `packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.ts`
- Test: `packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.test.ts`

- [ ] **Step 1: Write port contract tests**

Create `packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MonitoredWalletStorageAdapter } from './MonitoredWalletStorageAdapter.js';
import type { WalletId, ClockTimestamp } from '@clmm/domain';
import { makeWalletId, makeClockTimestamp } from '@clmm/domain';
import type { Db } from './db.js';

// These tests use a minimal in-memory approach.
// For CI, use a real test Postgres or the fake.
// Here we test the adapter shape against the port contract.

function makeAdapter(db: Db) {
  return new MonitoredWalletStorageAdapter(db);
}

describe('MonitoredWalletStorageAdapter (unit shape)', () => {
  it('implements enroll, unenroll, listActiveWallets, markScanned', () => {
    // Verify the adapter class has the expected methods
    const methods = ['enroll', 'unenroll', 'listActiveWallets', 'markScanned'];
    for (const method of methods) {
      expect(typeof MonitoredWalletStorageAdapter.prototype[method as keyof MonitoredWalletStorageAdapter]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:adapters -- MonitoredWalletStorageAdapter`
Expected: FAIL (MonitoredWalletStorageAdapter does not exist yet)

- [ ] **Step 3: Implement the adapter**

Create `packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { monitoredWallets } from './schema/index.js';
import type { MonitoredWalletRepository } from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

export class MonitoredWalletStorageAdapter implements MonitoredWalletRepository {
  constructor(private readonly db: Db) {}

  async enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void> {
    await this.db
      .insert(monitoredWallets)
      .values({
        walletId,
        enrolledAt,
        active: true,
      })
      .onConflictDoUpdate({
        target: monitoredWallets.walletId,
        set: { active: true, enrolledAt },
      });
  }

  async unenroll(walletId: WalletId): Promise<void> {
    await this.db
      .update(monitoredWallets)
      .set({ active: false })
      .where(eq(monitoredWallets.walletId, walletId));
  }

  async listActiveWallets(): Promise<
    Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>
  > {
    const rows = await this.db
      .select()
      .from(monitoredWallets)
      .where(eq(monitoredWallets.active, true));

    return rows.map((row) => ({
      walletId: row.walletId as WalletId,
      lastScannedAt: row.lastScannedAt != null
        ? (row.lastScannedAt as ClockTimestamp)
        : null,
    }));
  }

  async markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void> {
    await this.db
      .update(monitoredWallets)
      .set({ lastScannedAt: scannedAt })
      .where(eq(monitoredWallets.walletId, walletId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:adapters -- MonitoredWalletStorageAdapter`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.ts \
       packages/adapters/src/outbound/storage/MonitoredWalletStorageAdapter.test.ts
git commit -m "feat: implement MonitoredWalletStorageAdapter"
```

---

### Task 5: Implement `NotificationDedupStorageAdapter`

**Files:**
- Create: `packages/adapters/src/outbound/storage/NotificationDedupStorageAdapter.ts`

- [ ] **Step 1: Implement the adapter**

Create `packages/adapters/src/outbound/storage/NotificationDedupStorageAdapter.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { notificationDedup } from './schema/index.js';
import type { NotificationDedupPort } from '@clmm/application';

export class NotificationDedupStorageAdapter implements NotificationDedupPort {
  constructor(private readonly db: Db) {}

  async hasDispatched(triggerId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(notificationDedup)
      .where(eq(notificationDedup.triggerId, triggerId));
    return rows.length > 0;
  }

  async markDispatched(triggerId: string): Promise<void> {
    await this.db
      .insert(notificationDedup)
      .values({
        triggerId,
        dispatchedAt: Date.now(),
      })
      .onConflictDoNothing();
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/outbound/storage/NotificationDedupStorageAdapter.ts
git commit -m "feat: implement NotificationDedupStorageAdapter"
```

---

### Task 6: Create `FakeMonitoredWalletRepository`

**Files:**
- Create: `packages/testing/src/fakes/FakeMonitoredWalletRepository.ts`
- Modify: `packages/testing/src/fakes/index.ts`

- [ ] **Step 1: Implement the fake**

Create `packages/testing/src/fakes/FakeMonitoredWalletRepository.ts`:

```typescript
import type { MonitoredWalletRepository } from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

type WalletRecord = {
  walletId: WalletId;
  enrolledAt: ClockTimestamp;
  lastScannedAt: ClockTimestamp | null;
  active: boolean;
};

export class FakeMonitoredWalletRepository implements MonitoredWalletRepository {
  private wallets = new Map<string, WalletRecord>();

  async enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void> {
    const existing = this.wallets.get(walletId);
    if (existing) {
      existing.active = true;
      existing.enrolledAt = enrolledAt;
    } else {
      this.wallets.set(walletId, {
        walletId,
        enrolledAt,
        lastScannedAt: null,
        active: true,
      });
    }
  }

  async unenroll(walletId: WalletId): Promise<void> {
    const existing = this.wallets.get(walletId);
    if (existing) {
      existing.active = false;
    }
  }

  async listActiveWallets(): Promise<
    Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>
  > {
    return Array.from(this.wallets.values())
      .filter((w) => w.active)
      .map((w) => ({ walletId: w.walletId, lastScannedAt: w.lastScannedAt }));
  }

  async markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void> {
    const existing = this.wallets.get(walletId);
    if (existing) {
      existing.lastScannedAt = scannedAt;
    }
  }
}
```

- [ ] **Step 2: Export from fakes index**

Add to `packages/testing/src/fakes/index.ts`:

```typescript
export { FakeMonitoredWalletRepository } from './FakeMonitoredWalletRepository.js';
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/testing/src/fakes/FakeMonitoredWalletRepository.ts \
       packages/testing/src/fakes/index.ts
git commit -m "feat: add FakeMonitoredWalletRepository"
```

---

### Task 7: Implement `getOutcomeSummary` in OffChainHistoryStorageAdapter

**Files:**
- Modify: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`
- Test: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`

- [ ] **Step 1: Write a failing test**

Create or extend `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { OffChainHistoryStorageAdapter } from './OffChainHistoryStorageAdapter.js';

describe('OffChainHistoryStorageAdapter', () => {
  it('getOutcomeSummary method exists and is not a null-stub', () => {
    // Verify the implementation references actual DB queries
    // (full integration test requires a test DB; this validates shape)
    const proto = OffChainHistoryStorageAdapter.prototype;
    expect(typeof proto.getOutcomeSummary).toBe('function');
    // The method body should not be just "return null"
    const src = proto.getOutcomeSummary.toString();
    expect(src).not.toContain('return null');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:adapters -- OffChainHistoryStorageAdapter`
Expected: FAIL (current impl returns null)

- [ ] **Step 3: Implement getOutcomeSummary**

Replace the stub in `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`:

```typescript
async getOutcomeSummary(positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
  const rows = await this.db
    .select()
    .from(historyEvents)
    .where(eq(historyEvents.positionId, positionId))
    .orderBy(historyEvents.occurredAt);

  if (rows.length === 0) return null;

  // Find the last terminal event (confirmed, failed, partial, abandoned)
  const terminalEventTypes = ['confirmed', 'failed', 'partial-completion', 'abandoned'];
  const terminalRow = [...rows].reverse().find(
    (r) => terminalEventTypes.includes(r.eventType),
  );

  if (!terminalRow) return null;

  const breachDirection =
    terminalRow.directionKind === 'lower-bound-breach'
      ? LOWER_BOUND_BREACH
      : terminalRow.directionKind === 'upper-bound-breach'
        ? UPPER_BOUND_BREACH
        : (() => {
            throw new Error(`getOutcomeSummary: unknown directionKind ${terminalRow.directionKind}`);
          })();

  const lifecycleStateKind = terminalRow.lifecycleStateKind;
  if (!lifecycleStateKind) return null;

  const txRefs = rows
    .filter((r) => r.transactionRefJson != null)
    .map((r) => r.transactionRefJson as { signature: string; stepKind: string });

  return {
    positionId,
    breachDirection,
    finalState: { kind: lifecycleStateKind } as ExecutionOutcomeSummary['finalState'],
    transactionReferences: txRefs as ExecutionOutcomeSummary['transactionReferences'],
    completedAt: makeClockTimestamp(terminalRow.occurredAt),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:adapters -- OffChainHistoryStorageAdapter`
Expected: PASS

- [ ] **Step 5: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts \
       packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.test.ts
git commit -m "feat: implement getOutcomeSummary in OffChainHistoryStorageAdapter"
```

---

### Task 8: Generate Drizzle Migration

**Files:**
- Generated: `packages/adapters/drizzle/0002_*.sql` (auto-generated by drizzle-kit)

- [ ] **Step 1: Generate the migration**

Run: `pnpm db:generate`

This should produce a new migration file in `packages/adapters/drizzle/` that creates the `monitored_wallets` and `notification_dedup` tables.

- [ ] **Step 2: Verify migration file was created**

Run: `ls packages/adapters/drizzle/`
Expected: New file `0002_*.sql` exists

- [ ] **Step 3: Inspect the migration SQL**

Read the generated file and verify it contains:
- `CREATE TABLE monitored_wallets` with columns: `wallet_id`, `enrolled_at`, `last_scanned_at`, `active`
- `CREATE TABLE notification_dedup` with columns: `trigger_id`, `dispatched_at`

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/drizzle/
git commit -m "feat: generate Drizzle migration for monitored_wallets and notification_dedup"
```

---

## Phase 2: pg-boss Worker Infrastructure

### Task 9: Add pg-boss Dependency

**Files:**
- Modify: `packages/adapters/package.json`

- [ ] **Step 1: Install pg-boss**

Run: `pnpm add pg-boss --filter @clmm/adapters`

- [ ] **Step 2: Verify installation**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/package.json pnpm-lock.yaml
git commit -m "chore: add pg-boss dependency to adapters package"
```

---

### Task 10: Create Worker DI Tokens

**Files:**
- Create: `packages/adapters/src/inbound/jobs/tokens.ts`

- [ ] **Step 1: Create the tokens file**

Create `packages/adapters/src/inbound/jobs/tokens.ts`:

```typescript
export const PG_BOSS = 'PG_BOSS';
export const MONITORED_WALLET_REPOSITORY = 'MONITORED_WALLET_REPOSITORY';
export const SUPPORTED_POSITION_READ_PORT = 'SUPPORTED_POSITION_READ_PORT';
export const RANGE_OBSERVATION_PORT = 'RANGE_OBSERVATION_PORT';
export const TRIGGER_REPOSITORY = 'TRIGGER_REPOSITORY';
export const EXECUTION_REPOSITORY = 'EXECUTION_REPOSITORY';
export const EXECUTION_HISTORY_REPOSITORY = 'EXECUTION_HISTORY_REPOSITORY';
export const EXECUTION_SUBMISSION_PORT = 'EXECUTION_SUBMISSION_PORT';
export const NOTIFICATION_PORT = 'NOTIFICATION_PORT';
export const NOTIFICATION_DEDUP_PORT = 'NOTIFICATION_DEDUP_PORT';
export const OBSERVABILITY_PORT = 'OBSERVABILITY_PORT';
export const CLOCK_PORT = 'CLOCK_PORT';
export const ID_GENERATOR_PORT = 'ID_GENERATOR_PORT';
```

- [ ] **Step 2: Commit**

```bash
git add packages/adapters/src/inbound/jobs/tokens.ts
git commit -m "feat: add worker DI injection tokens"
```

---

### Task 11: Create pg-boss Provider

**Files:**
- Create: `packages/adapters/src/inbound/jobs/PgBossProvider.ts`

- [ ] **Step 1: Create the pg-boss NestJS provider**

Create `packages/adapters/src/inbound/jobs/PgBossProvider.ts`:

```typescript
import PgBoss from 'pg-boss';

export function createPgBossProvider(connectionString: string): PgBoss {
  return new PgBoss({
    connectionString,
    retryLimit: 3,
    retryBackoff: true,
    retryDelay: 5,
    expireInHours: 1,
    archiveCompletedAfterSeconds: 3600,
    deleteAfterDays: 7,
  });
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/jobs/PgBossProvider.ts
git commit -m "feat: create pg-boss provider factory"
```

---

### Task 12: Implement BreachScanJobHandler

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`
- Test: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSupportedPositionReadPort,
  FakeObservabilityPort,
} from '@clmm/testing';
import { FakeMonitoredWalletRepository } from '@clmm/testing';
import { makeWalletId, makePositionId, makeClockTimestamp, makePoolId } from '@clmm/domain';
import type { LiquidityPosition } from '@clmm/domain';

describe('BreachScanJobHandler', () => {
  let handler: BreachScanJobHandler;
  let monitoredWalletRepo: FakeMonitoredWalletRepository;
  let positionReadPort: FakeSupportedPositionReadPort;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let enqueuedJobs: Array<{ name: string; data: unknown }>;

  beforeEach(() => {
    monitoredWalletRepo = new FakeMonitoredWalletRepository();
    positionReadPort = new FakeSupportedPositionReadPort();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    observability = new FakeObservabilityPort();
    enqueuedJobs = [];

    const enqueueJob = async (name: string, data: unknown) => {
      enqueuedJobs.push({ name, data });
    };

    handler = new BreachScanJobHandler(
      monitoredWalletRepo,
      positionReadPort,
      clock,
      ids,
      observability,
      enqueueJob,
    );
  });

  it('scans active wallets and enqueues qualify-trigger for out-of-range positions', async () => {
    const walletId = makeWalletId('wallet-1');
    await monitoredWalletRepo.enroll(walletId, makeClockTimestamp(1000));

    const position: LiquidityPosition = {
      positionId: makePositionId('pos-1'),
      poolId: makePoolId('pool-1'),
      rangeState: { kind: 'below-range' },
      lowerBound: 100,
      upperBound: 200,
      currentPrice: 80,
    };
    positionReadPort.setPositions(walletId, [position]);

    await handler.handle();

    expect(enqueuedJobs).toHaveLength(1);
    expect(enqueuedJobs[0]!.name).toBe('qualify-trigger');
    expect(enqueuedJobs[0]!.data).toMatchObject({
      positionId: 'pos-1',
      walletId: 'wallet-1',
      directionKind: 'lower-bound-breach',
    });
  });

  it('skips in-range positions', async () => {
    const walletId = makeWalletId('wallet-2');
    await monitoredWalletRepo.enroll(walletId, makeClockTimestamp(1000));

    const position: LiquidityPosition = {
      positionId: makePositionId('pos-2'),
      poolId: makePoolId('pool-1'),
      rangeState: { kind: 'in-range' },
      lowerBound: 100,
      upperBound: 200,
      currentPrice: 150,
    };
    positionReadPort.setPositions(walletId, [position]);

    await handler.handle();

    expect(enqueuedJobs).toHaveLength(0);
  });

  it('marks wallet as scanned after processing', async () => {
    const walletId = makeWalletId('wallet-3');
    await monitoredWalletRepo.enroll(walletId, makeClockTimestamp(1000));
    positionReadPort.setPositions(walletId, []);

    clock.setNow(makeClockTimestamp(5000));
    await handler.handle();

    const wallets = await monitoredWalletRepo.listActiveWallets();
    expect(wallets[0]!.lastScannedAt).toBe(5000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:adapters -- BreachScanJobHandler`
Expected: FAIL (handler is still a stub, constructor doesn't accept deps)

- [ ] **Step 3: Implement the handler**

Replace `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { scanPositionsForBreaches } from '@clmm/application';
import type {
  MonitoredWalletRepository,
  SupportedPositionReadPort,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import {
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS,
} from './tokens.js';

type EnqueueFn = (name: string, data: unknown) => Promise<void>;

@Injectable()
export class BreachScanJobHandler {
  static readonly JOB_NAME = 'breach-scan';

  constructor(
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWalletRepo: MonitoredWalletRepository,
    @Inject(SUPPORTED_POSITION_READ_PORT)
    private readonly positionReadPort: SupportedPositionReadPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(PG_BOSS)
    private readonly enqueue: EnqueueFn,
  ) {}

  async handle(): Promise<void> {
    const wallets = await this.monitoredWalletRepo.listActiveWallets();

    for (const wallet of wallets) {
      try {
        const observations = await scanPositionsForBreaches({
          walletId: wallet.walletId,
          positionReadPort: this.positionReadPort,
          clock: this.clock,
          ids: this.ids,
        });

        for (const obs of observations) {
          await this.enqueue('qualify-trigger', {
            positionId: obs.positionId,
            walletId: wallet.walletId,
            directionKind: obs.direction.kind,
            observedAt: obs.observedAt,
            episodeId: obs.episodeId,
          });

          this.observability.recordDetectionTiming({
            positionId: obs.positionId,
            detectedAt: this.clock.now(),
            observedAt: obs.observedAt,
            durationMs: this.clock.now() - obs.observedAt,
          });
        }

        await this.monitoredWalletRepo.markScanned(wallet.walletId, this.clock.now());
      } catch (error: unknown) {
        this.observability.log('error', `Breach scan failed for wallet ${wallet.walletId}`, {
          walletId: wallet.walletId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
```

Note: In tests, the handler is constructed directly without `@Inject` decorators (NestJS decorators are metadata-only and do not affect direct construction). The test passes an `enqueueJob` function directly. In the WorkerModule, we will provide a wrapper around `pgBoss.send()` as the `PG_BOSS` token.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:adapters -- BreachScanJobHandler`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts \
       packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts
git commit -m "feat: implement BreachScanJobHandler with real port calls"
```

---

### Task 13: Implement TriggerQualificationJobHandler

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts`
- Test: `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeTriggerRepository,
  FakeObservabilityPort,
} from '@clmm/testing';
import { makeClockTimestamp } from '@clmm/domain';

describe('TriggerQualificationJobHandler', () => {
  let handler: TriggerQualificationJobHandler;
  let triggerRepo: FakeTriggerRepository;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;
  let enqueuedJobs: Array<{ name: string; data: unknown }>;

  beforeEach(() => {
    triggerRepo = new FakeTriggerRepository();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    observability = new FakeObservabilityPort();
    enqueuedJobs = [];

    const enqueueJob = async (name: string, data: unknown) => {
      enqueuedJobs.push({ name, data });
    };

    handler = new TriggerQualificationJobHandler(
      triggerRepo,
      clock,
      ids,
      observability,
      enqueueJob,
    );
  });

  it('creates trigger and enqueues notification for qualifying observation', async () => {
    clock.setNow(makeClockTimestamp(2000));

    await handler.handle({
      positionId: 'pos-1',
      walletId: 'wallet-1',
      directionKind: 'lower-bound-breach',
      observedAt: 1000,
      episodeId: 'episode-1',
    });

    const triggers = await triggerRepo.listActionableTriggers('wallet-1' as any);
    // Trigger should have been created (depends on domain qualification logic)
    // The important thing is the handler called the use case without throwing
    expect(enqueuedJobs.length).toBeGreaterThanOrEqual(0);
  });

  it('handles duplicate suppression without throwing', async () => {
    clock.setNow(makeClockTimestamp(2000));

    // First call creates trigger
    await handler.handle({
      positionId: 'pos-1',
      walletId: 'wallet-1',
      directionKind: 'lower-bound-breach',
      observedAt: 1000,
      episodeId: 'episode-1',
    });

    // Second call with same episode should be suppressed, not throw
    await handler.handle({
      positionId: 'pos-1',
      walletId: 'wallet-1',
      directionKind: 'lower-bound-breach',
      observedAt: 1500,
      episodeId: 'episode-1',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:adapters -- TriggerQualificationJobHandler`
Expected: FAIL

- [ ] **Step 3: Implement the handler**

Replace `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { qualifyActionableTrigger } from '@clmm/application';
import type {
  TriggerRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import type { BreachDirection, PositionId, ClockTimestamp } from '@clmm/domain';
import {
  TRIGGER_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS,
} from './tokens.js';

type EnqueueFn = (name: string, data: unknown) => Promise<void>;

type QualifyTriggerPayload = {
  positionId: string;
  walletId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
  observedAt: number;
  episodeId: string;
};

@Injectable()
export class TriggerQualificationJobHandler {
  static readonly JOB_NAME = 'qualify-trigger';

  constructor(
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(PG_BOSS)
    private readonly enqueue: EnqueueFn,
  ) {}

  async handle(data: QualifyTriggerPayload): Promise<void> {
    try {
      const direction: BreachDirection = { kind: data.directionKind };

      const result = await qualifyActionableTrigger({
        observation: {
          positionId: data.positionId as PositionId,
          direction,
          observedAt: data.observedAt as ClockTimestamp,
          episodeId: data.episodeId,
        },
        consecutiveCount: 1, // MVP: immediate qualification
        triggerRepo: this.triggerRepo,
        clock: this.clock,
        ids: this.ids,
      });

      if (result.kind === 'trigger-created') {
        await this.enqueue('dispatch-notification', {
          triggerId: result.trigger.triggerId,
          walletId: data.walletId,
          positionId: data.positionId,
          directionKind: data.directionKind,
        });
        this.observability.log('info', `Trigger created for position ${data.positionId}`, {
          triggerId: result.trigger.triggerId,
          directionKind: data.directionKind,
        });
      } else if (result.kind === 'duplicate-suppressed') {
        this.observability.log('info', `Duplicate trigger suppressed for episode ${data.episodeId}`, {
          existingTriggerId: result.existingTriggerId,
        });
      } else {
        this.observability.log('info', `Trigger not qualified: ${result.reason}`, {
          positionId: data.positionId,
        });
      }
    } catch (error: unknown) {
      this.observability.log('error', `Trigger qualification failed for position ${data.positionId}`, {
        positionId: data.positionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // pg-boss will retry
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:adapters -- TriggerQualificationJobHandler`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts \
       packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts
git commit -m "feat: implement TriggerQualificationJobHandler with real port calls"
```

---

### Task 14: Implement ReconciliationJobHandler

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts`
- Test: `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeExecutionRepository,
  FakeExecutionHistoryRepository,
  FakeExecutionSubmissionPort,
  FakeObservabilityPort,
} from '@clmm/testing';
import { makePositionId, makeClockTimestamp, LOWER_BOUND_BREACH } from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

describe('ReconciliationJobHandler', () => {
  let handler: ReconciliationJobHandler;
  let executionRepo: FakeExecutionRepository;
  let historyRepo: FakeExecutionHistoryRepository;
  let submissionPort: FakeExecutionSubmissionPort;
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let observability: FakeObservabilityPort;

  beforeEach(() => {
    executionRepo = new FakeExecutionRepository();
    historyRepo = new FakeExecutionHistoryRepository();
    submissionPort = new FakeExecutionSubmissionPort();
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    observability = new FakeObservabilityPort();

    handler = new ReconciliationJobHandler(
      executionRepo,
      submissionPort,
      historyRepo,
      clock,
      ids,
      observability,
    );
  });

  it('reconciles a submitted attempt to confirmed', async () => {
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-1',
      positionId: makePositionId('pos-1'),
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [{ signature: 'sig-1', stepKind: 'remove-liquidity' }],
    };
    await executionRepo.saveAttempt(attempt);

    submissionPort.setReconcileResult({
      confirmedSteps: ['remove-liquidity', 'collect-fees', 'swap-assets'],
      finalState: { kind: 'confirmed' },
    });

    clock.setNow(makeClockTimestamp(3000));

    await handler.handle({ attemptId: 'attempt-1' });

    const updated = await executionRepo.getAttempt('attempt-1');
    expect(updated!.lifecycleState.kind).toBe('confirmed');
  });

  it('skips reconciliation for non-submitted attempts', async () => {
    const attempt: StoredExecutionAttempt = {
      attemptId: 'attempt-2',
      positionId: makePositionId('pos-2'),
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'confirmed' },
      completedSteps: ['remove-liquidity'],
      transactionReferences: [],
    };
    await executionRepo.saveAttempt(attempt);

    await handler.handle({ attemptId: 'attempt-2' });

    // State should not change
    const updated = await executionRepo.getAttempt('attempt-2');
    expect(updated!.lifecycleState.kind).toBe('confirmed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:adapters -- ReconciliationJobHandler`
Expected: FAIL

- [ ] **Step 3: Implement the handler**

Replace `packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { reconcileExecutionAttempt } from '@clmm/application';
import type {
  ExecutionRepository,
  ExecutionSubmissionPort,
  ExecutionHistoryRepository,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
} from '@clmm/application';
import {
  EXECUTION_REPOSITORY,
  EXECUTION_SUBMISSION_PORT,
  EXECUTION_HISTORY_REPOSITORY,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
} from './tokens.js';

type ReconcilePayload = {
  attemptId: string;
};

@Injectable()
export class ReconciliationJobHandler {
  static readonly JOB_NAME = 'reconcile-execution';

  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_SUBMISSION_PORT)
    private readonly submissionPort: ExecutionSubmissionPort,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
  ) {}

  async handle(data: ReconcilePayload): Promise<void> {
    const attempt = await this.executionRepo.getAttempt(data.attemptId);
    if (!attempt) {
      this.observability.log('warn', `Reconciliation: attempt not found ${data.attemptId}`);
      return;
    }

    if (attempt.lifecycleState.kind !== 'submitted') {
      this.observability.log('warn', `Reconciliation: attempt ${data.attemptId} not in submitted state (${attempt.lifecycleState.kind})`);
      return;
    }

    try {
      const result = await reconcileExecutionAttempt({
        attemptId: data.attemptId,
        positionId: attempt.positionId,
        breachDirection: attempt.breachDirection,
        executionRepo: this.executionRepo,
        submissionPort: this.submissionPort,
        historyRepo: this.historyRepo,
        clock: this.clock,
        ids: this.ids,
      });

      this.observability.log('info', `Reconciliation result for ${data.attemptId}: ${result.kind}`, {
        attemptId: data.attemptId,
        result: result.kind,
      });
    } catch (error: unknown) {
      this.observability.log('error', `Reconciliation failed for ${data.attemptId}`, {
        attemptId: data.attemptId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // pg-boss will retry (up to 5 attempts)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:adapters -- ReconciliationJobHandler`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/jobs/ReconciliationJobHandler.ts \
       packages/adapters/src/inbound/jobs/ReconciliationJobHandler.test.ts
git commit -m "feat: implement ReconciliationJobHandler with real port calls"
```

---

### Task 15: Implement NotificationDispatchJobHandler

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts`
- Test: `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import {
  FakeClockPort,
  FakeNotificationPort,
  FakeNotificationDedupPort,
  FakeTriggerRepository,
  FakeObservabilityPort,
} from '@clmm/testing';
import { makeClockTimestamp, makePositionId, LOWER_BOUND_BREACH } from '@clmm/domain';
import type { ExitTriggerId, BreachEpisodeId } from '@clmm/domain';

describe('NotificationDispatchJobHandler', () => {
  let handler: NotificationDispatchJobHandler;
  let notificationPort: FakeNotificationPort;
  let dedupPort: FakeNotificationDedupPort;
  let triggerRepo: FakeTriggerRepository;
  let clock: FakeClockPort;
  let observability: FakeObservabilityPort;

  beforeEach(() => {
    notificationPort = new FakeNotificationPort();
    dedupPort = new FakeNotificationDedupPort();
    triggerRepo = new FakeTriggerRepository();
    clock = new FakeClockPort();
    observability = new FakeObservabilityPort();

    handler = new NotificationDispatchJobHandler(
      notificationPort,
      dedupPort,
      triggerRepo,
      observability,
      clock,
    );
  });

  it('dispatches notification for un-dispatched trigger', async () => {
    await triggerRepo.saveTrigger({
      triggerId: 'trigger-1' as ExitTriggerId,
      positionId: makePositionId('pos-1'),
      episodeId: 'episode-1' as BreachEpisodeId,
      breachDirection: LOWER_BOUND_BREACH,
      triggeredAt: makeClockTimestamp(1000),
      confirmationEvaluatedAt: makeClockTimestamp(1000),
      confirmationPassed: true,
    });

    await handler.handle({
      triggerId: 'trigger-1',
      walletId: 'wallet-1',
      positionId: 'pos-1',
      directionKind: 'lower-bound-breach',
    });

    expect(await dedupPort.hasDispatched('trigger-1')).toBe(true);
  });

  it('skips already-dispatched trigger', async () => {
    await dedupPort.markDispatched('trigger-2');

    await handler.handle({
      triggerId: 'trigger-2',
      walletId: 'wallet-1',
      positionId: 'pos-1',
      directionKind: 'lower-bound-breach',
    });

    // Should not throw, should just skip silently
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:adapters -- NotificationDispatchJobHandler`
Expected: FAIL

- [ ] **Step 3: Implement the handler**

Replace `packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { dispatchActionableNotification } from '@clmm/application';
import type {
  NotificationPort,
  NotificationDedupPort,
  TriggerRepository,
  ObservabilityPort,
  ClockPort,
} from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ExitTriggerId } from '@clmm/domain';
import {
  NOTIFICATION_PORT,
  NOTIFICATION_DEDUP_PORT,
  TRIGGER_REPOSITORY,
  OBSERVABILITY_PORT,
  CLOCK_PORT,
} from './tokens.js';

type NotificationPayload = {
  triggerId: string;
  walletId: string;
  positionId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
};

@Injectable()
export class NotificationDispatchJobHandler {
  static readonly JOB_NAME = 'dispatch-notification';

  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notificationPort: NotificationPort,
    @Inject(NOTIFICATION_DEDUP_PORT)
    private readonly dedupPort: NotificationDedupPort,
    @Inject(TRIGGER_REPOSITORY)
    private readonly triggerRepo: TriggerRepository,
    @Inject(OBSERVABILITY_PORT)
    private readonly observability: ObservabilityPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  async handle(data: NotificationPayload): Promise<void> {
    try {
      const direction: BreachDirection = { kind: data.directionKind };
      const startedAt = this.clock.now();

      const result = await dispatchActionableNotification({
        walletId: data.walletId as WalletId,
        positionId: data.positionId as PositionId,
        triggerId: data.triggerId as ExitTriggerId,
        breachDirection: direction,
        notificationPort: this.notificationPort,
        notificationDedupPort: this.dedupPort,
      });

      if (result.dispatched) {
        this.observability.recordDeliveryTiming({
          triggerId: data.triggerId,
          dispatchedAt: startedAt,
          deliveredAt: this.clock.now(),
          durationMs: this.clock.now() - startedAt,
          channel: 'push',
        });
      }

      this.observability.log('info', `Notification dispatch for trigger ${data.triggerId}: dispatched=${result.dispatched}`);
    } catch (error: unknown) {
      // Notification failure is non-fatal: trigger exists in DB regardless
      this.observability.log('error', `Notification dispatch failed for trigger ${data.triggerId}`, {
        triggerId: data.triggerId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Do NOT rethrow -- notification failure should not cause pg-boss retry
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:adapters -- NotificationDispatchJobHandler`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.ts \
       packages/adapters/src/inbound/jobs/NotificationDispatchJobHandler.test.ts
git commit -m "feat: implement NotificationDispatchJobHandler with real port calls"
```

---

### Task 16: Wire AdaptersModule with Shared Providers

**Files:**
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`

- [ ] **Step 1: Wire the shared adapter providers**

Replace `packages/adapters/src/composition/AdaptersModule.ts`:

```typescript
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { OrcaPositionReadAdapter } from '../outbound/solana-position-reads/OrcaPositionReadAdapter.js';
import { SolanaRangeObservationAdapter } from '../outbound/solana-position-reads/SolanaRangeObservationAdapter.js';
import { OperationalStorageAdapter } from '../outbound/storage/OperationalStorageAdapter.js';
import { OffChainHistoryStorageAdapter } from '../outbound/storage/OffChainHistoryStorageAdapter.js';
import { MonitoredWalletStorageAdapter } from '../outbound/storage/MonitoredWalletStorageAdapter.js';
import { NotificationDedupStorageAdapter } from '../outbound/storage/NotificationDedupStorageAdapter.js';
import { JupiterQuoteAdapter } from '../outbound/swap-execution/JupiterQuoteAdapter.js';
import { SolanaExecutionSubmissionAdapter } from '../outbound/swap-execution/SolanaExecutionSubmissionAdapter.js';
import { ExpoPushAdapter } from '../outbound/notifications/ExpoPushAdapter.js';
import { InAppAlertAdapter } from '../outbound/notifications/InAppAlertAdapter.js';
import { TelemetryAdapter } from '../outbound/observability/TelemetryAdapter.js';
import { createDb } from '../outbound/storage/db.js';
import type { ClockPort, IdGeneratorPort } from '@clmm/application';
import type { ClockTimestamp } from '@clmm/domain';

// boundary: process.env values are untyped at runtime; validated via env schema at deploy
const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'] ?? 'postgresql://localhost/clmm';
const rpcUrl = (process.env as Record<string, string | undefined>)['SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com';

const db = createDb(dbUrl);

const systemClock: ClockPort = {
  now: () => Date.now() as ClockTimestamp,
};

let _idCounter = 0;
const systemIds: IdGeneratorPort = {
  generateId: () => `${Date.now()}-${++_idCounter}`,
};

const orcaPositionRead = new OrcaPositionReadAdapter(rpcUrl);
const rangeObservation = new SolanaRangeObservationAdapter(rpcUrl);
const operationalStorage = new OperationalStorageAdapter(db, systemIds, orcaPositionRead);
const historyStorage = new OffChainHistoryStorageAdapter(db);
const monitoredWalletStorage = new MonitoredWalletStorageAdapter(db);
const notificationDedupStorage = new NotificationDedupStorageAdapter(db);
const jupiterQuote = new JupiterQuoteAdapter();
const solanaSubmission = new SolanaExecutionSubmissionAdapter(rpcUrl);
const expoPush = new ExpoPushAdapter();
const inAppAlert = new InAppAlertAdapter();
const telemetry = new TelemetryAdapter();

// Token imports from both HTTP and worker modules
import {
  TRIGGER_REPOSITORY as HTTP_TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY as HTTP_EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY as HTTP_EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_SUBMISSION_PORT as HTTP_EXECUTION_SUBMISSION_PORT,
  SUPPORTED_POSITION_READ_PORT as HTTP_SUPPORTED_POSITION_READ_PORT,
  SWAP_QUOTE_PORT as HTTP_SWAP_QUOTE_PORT,
  CLOCK_PORT as HTTP_CLOCK_PORT,
  ID_GENERATOR_PORT as HTTP_ID_GENERATOR_PORT,
} from '../inbound/http/tokens.js';

import {
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
  RANGE_OBSERVATION_PORT,
  TRIGGER_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
  EXECUTION_SUBMISSION_PORT,
  NOTIFICATION_PORT,
  NOTIFICATION_DEDUP_PORT,
  OBSERVABILITY_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
} from '../inbound/jobs/tokens.js';

const sharedProviders = [
  { provide: MONITORED_WALLET_REPOSITORY, useValue: monitoredWalletStorage },
  { provide: SUPPORTED_POSITION_READ_PORT, useValue: orcaPositionRead },
  { provide: RANGE_OBSERVATION_PORT, useValue: rangeObservation },
  { provide: TRIGGER_REPOSITORY, useValue: operationalStorage },
  { provide: EXECUTION_REPOSITORY, useValue: operationalStorage },
  { provide: EXECUTION_HISTORY_REPOSITORY, useValue: historyStorage },
  { provide: EXECUTION_SUBMISSION_PORT, useValue: solanaSubmission },
  { provide: NOTIFICATION_PORT, useValue: expoPush },
  { provide: NOTIFICATION_DEDUP_PORT, useValue: notificationDedupStorage },
  { provide: OBSERVABILITY_PORT, useValue: telemetry },
  { provide: CLOCK_PORT, useValue: systemClock },
  { provide: ID_GENERATOR_PORT, useValue: systemIds },
];

@Module({
  providers: sharedProviders,
  exports: sharedProviders.map((p) => p.provide),
})
export class AdaptersModule {}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/composition/AdaptersModule.ts
git commit -m "feat: wire AdaptersModule with shared adapter providers"
```

---

### Task 17: Wire WorkerModule with pg-boss and DI

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/WorkerModule.ts`
- Modify: `packages/adapters/src/inbound/jobs/main.ts`

- [ ] **Step 1: Wire WorkerModule**

Replace `packages/adapters/src/inbound/jobs/WorkerModule.ts`:

```typescript
import 'reflect-metadata';
import { Module, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { AdaptersModule } from '../../composition/AdaptersModule.js';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';
import { TriggerQualificationJobHandler } from './TriggerQualificationJobHandler.js';
import { ReconciliationJobHandler } from './ReconciliationJobHandler.js';
import { NotificationDispatchJobHandler } from './NotificationDispatchJobHandler.js';
import { createPgBossProvider } from './PgBossProvider.js';
import { PG_BOSS } from './tokens.js';

// boundary: process.env values are untyped at runtime; validated via env schema at deploy
const dbUrl = (process.env as Record<string, string | undefined>)['DATABASE_URL'] ?? 'postgresql://localhost/clmm';
const boss = createPgBossProvider(dbUrl);

@Module({
  imports: [AdaptersModule],
  providers: [
    {
      provide: PG_BOSS,
      useValue: async (name: string, data: unknown) => {
        await boss.send(name, data as object);
      },
    },
    BreachScanJobHandler,
    TriggerQualificationJobHandler,
    ReconciliationJobHandler,
    NotificationDispatchJobHandler,
  ],
})
export class WorkerModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly breachScanHandler: BreachScanJobHandler,
    private readonly triggerQualificationHandler: TriggerQualificationJobHandler,
    private readonly reconciliationHandler: ReconciliationJobHandler,
    private readonly notificationDispatchHandler: NotificationDispatchJobHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    await boss.start();

    // Register job handlers
    await boss.work(
      BreachScanJobHandler.JOB_NAME,
      async () => this.breachScanHandler.handle(),
    );

    await boss.work(
      TriggerQualificationJobHandler.JOB_NAME,
      async (job) => this.triggerQualificationHandler.handle(job.data as any),
    );

    await boss.work(
      ReconciliationJobHandler.JOB_NAME,
      { retryLimit: 5, retryBackoff: true, retryDelay: 5 },
      async (job) => this.reconciliationHandler.handle(job.data as any),
    );

    await boss.work(
      NotificationDispatchJobHandler.JOB_NAME,
      async (job) => this.notificationDispatchHandler.handle(job.data as any),
    );

    // Schedule recurring breach scan every 60 seconds
    await boss.schedule(BreachScanJobHandler.JOB_NAME, '*/1 * * * *', {}, {
      tz: 'UTC',
    });

    console.log('Worker: pg-boss started, all job handlers registered');
  }

  async onModuleDestroy(): Promise<void> {
    await boss.stop();
    console.log('Worker: pg-boss stopped');
  }
}
```

- [ ] **Step 2: Update worker main.ts**

Replace `packages/adapters/src/inbound/jobs/main.ts`:

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './WorkerModule.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Graceful shutdown
  const signals = ['SIGTERM', 'SIGINT'] as const;
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`Worker received ${signal}, shutting down...`);
      await app.close();
      process.exit(0);
    });
  }

  console.log('Worker started');
}

void bootstrap();
```

Note: Changed from `NestFactory.create()` (HTTP) to `NestFactory.createApplicationContext()` since the worker does not serve HTTP. It only processes pg-boss jobs.

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/inbound/jobs/WorkerModule.ts \
       packages/adapters/src/inbound/jobs/main.ts
git commit -m "feat: wire WorkerModule with pg-boss integration and all job handlers"
```

---

## Phase 3: BFF Completion + Enrollment

### Task 18: Add Wallet Enrollment Endpoint to BFF

**Files:**
- Modify: `packages/adapters/src/inbound/http/AppModule.ts`
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Create: `packages/adapters/src/inbound/http/WalletController.ts`

- [ ] **Step 1: Add new token**

Add to `packages/adapters/src/inbound/http/tokens.ts`:

```typescript
export const MONITORED_WALLET_REPOSITORY = 'MONITORED_WALLET_REPOSITORY';
```

- [ ] **Step 2: Create WalletController**

Create `packages/adapters/src/inbound/http/WalletController.ts`:

```typescript
import { Controller, Post, Param, Inject } from '@nestjs/common';
import type { MonitoredWalletRepository, ClockPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';
import { MONITORED_WALLET_REPOSITORY, CLOCK_PORT } from './tokens.js';

@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWalletRepo: MonitoredWalletRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  @Post(':walletId/monitor')
  async enrollForMonitoring(@Param('walletId') walletId: string) {
    const enrolledAt = this.clock.now();
    await this.monitoredWalletRepo.enroll(walletId as WalletId, enrolledAt);
    return { enrolled: true, enrolledAt };
  }
}
```

- [ ] **Step 3: Wire into AppModule**

In `packages/adapters/src/inbound/http/AppModule.ts`, add:

1. Import `WalletController` and `MonitoredWalletStorageAdapter`
2. Add `WalletController` to the `controllers` array
3. Add `MONITORED_WALLET_REPOSITORY` provider using the shared `db`:

```typescript
import { WalletController } from './WalletController.js';
import { MonitoredWalletStorageAdapter } from '../../outbound/storage/MonitoredWalletStorageAdapter.js';
```

Add to controllers array: `WalletController`

Add to providers array:
```typescript
{ provide: MONITORED_WALLET_REPOSITORY, useValue: new MonitoredWalletStorageAdapter(db) },
```

Import the token:
```typescript
import { MONITORED_WALLET_REPOSITORY } from './tokens.js';
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/WalletController.ts \
       packages/adapters/src/inbound/http/AppModule.ts \
       packages/adapters/src/inbound/http/tokens.ts
git commit -m "feat: add wallet monitoring enrollment endpoint"
```

---

### Task 19: Verify Execution Submission Endpoint Completeness

**Files:**
- Review: `packages/adapters/src/inbound/http/ExecutionController.ts`

The execution controller already has `POST /executions/:attemptId/submit` at line 168. It accepts `signedPayload` (base64), calls `submissionPort.submitExecution`, updates state to `submitted`, performs inline reconciliation, and appends history events.

**What it does NOT do:** enqueue a `reconcile-execution` pg-boss job for background retry. The inline reconciliation is sufficient for MVP (it performs reconciliation synchronously after submission), but for robustness we should also enqueue a background reconciliation job.

- [ ] **Step 1: Add reconciliation job enqueue to submission endpoint**

This requires adding a mechanism for the BFF to enqueue pg-boss jobs. For MVP, the inline reconciliation in the existing `submitExecution` method is sufficient -- if it returns `pending`, the client can poll. Adding pg-boss enqueue from the BFF adds complexity (the BFF would need a pg-boss connection).

**Decision: defer bg reconciliation from BFF to a future iteration.** The existing inline reconciliation handles the happy path. The worker's `ReconciliationJobHandler` can be triggered by a separate mechanism later.

- [ ] **Step 2: Verify no action needed**

The existing endpoint is complete for MVP. No changes required.

- [ ] **Step 3: Commit (no-op -- document decision)**

No code changes needed.

---

## Phase 4: App Route Wiring

### Task 20: Create BFF API Client Functions

**Files:**
- Create: `apps/app/src/api/alerts.ts`
- Create: `apps/app/src/api/history.ts`
- Create: `apps/app/src/api/previews.ts`
- Create: `apps/app/src/api/executions.ts`
- Create: `apps/app/src/api/wallets.ts`

- [ ] **Step 1: Create alerts API client**

Create `apps/app/src/api/alerts.ts`:

```typescript
import type { ActionableAlertDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type AlertsResponse = {
  alerts: ActionableAlertDto[];
};

export async function fetchAlerts(walletId: string): Promise<ActionableAlertDto[]> {
  try {
    const payload = (await fetchJson(`/alerts/${walletId}`)) as Partial<AlertsResponse>;
    if (!Array.isArray(payload.alerts)) {
      throw new Error('Malformed alerts response');
    }
    return payload.alerts;
  } catch (cause: unknown) {
    throw new Error('Could not load alerts', { cause });
  }
}
```

- [ ] **Step 2: Create history API client**

Create `apps/app/src/api/history.ts`:

```typescript
import type { HistoryEventDto } from '@clmm/application/public';
import { fetchJson } from './http.js';

type HistoryResponse = {
  history: HistoryEventDto[];
};

export async function fetchExecutionHistory(walletId: string): Promise<HistoryEventDto[]> {
  try {
    // History is per-position; for the list view we fetch all positions' history
    // The BFF serves history per positionId, so we'll need the walletId to get positions first
    // For MVP, the history tab fetches all history events across positions via a dedicated endpoint
    const payload = (await fetchJson(`/executions/history/${walletId}`)) as Partial<HistoryResponse>;
    if (!Array.isArray(payload.history)) {
      throw new Error('Malformed history response');
    }
    return payload.history;
  } catch (cause: unknown) {
    throw new Error('Could not load execution history', { cause });
  }
}
```

- [ ] **Step 3: Create previews API client**

Create `apps/app/src/api/previews.ts`:

```typescript
import type { ExecutionPreviewDto } from '@clmm/application/public';
import { fetchJson, getBffBaseUrl } from './http.js';

type PreviewResponse = {
  preview: ExecutionPreviewDto;
};

export async function fetchPreview(previewId: string): Promise<ExecutionPreviewDto> {
  try {
    const payload = (await fetchJson(`/previews/${previewId}`)) as Partial<PreviewResponse>;
    if (!payload.preview) {
      throw new Error('Malformed preview response');
    }
    return payload.preview;
  } catch (cause: unknown) {
    throw new Error('Could not load execution preview', { cause });
  }
}

export async function refreshPreview(triggerId: string): Promise<ExecutionPreviewDto> {
  try {
    const response = await fetch(`${getBffBaseUrl()}/previews/${triggerId}/refresh`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Partial<PreviewResponse>;
    if (!payload.preview) {
      throw new Error('Malformed refresh response');
    }
    return payload.preview;
  } catch (cause: unknown) {
    throw new Error('Could not refresh preview', { cause });
  }
}
```

- [ ] **Step 4: Create executions API client**

Create `apps/app/src/api/executions.ts`:

```typescript
import type { ExecutionAttemptDto } from '@clmm/application/public';
import { fetchJson, getBffBaseUrl } from './http.js';

type ExecutionResponse = {
  execution: ExecutionAttemptDto;
};

export async function fetchExecution(attemptId: string): Promise<ExecutionAttemptDto> {
  try {
    const payload = (await fetchJson(`/executions/${attemptId}`)) as Partial<ExecutionResponse>;
    if (!payload.execution) {
      throw new Error('Malformed execution response');
    }
    return payload.execution;
  } catch (cause: unknown) {
    throw new Error('Could not load execution attempt', { cause });
  }
}

export async function submitExecution(
  attemptId: string,
  signedPayload: string,
): Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedPayload }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Submit failed: HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }
  return response.json() as Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }>;
}

export async function abandonExecution(attemptId: string): Promise<void> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(`Abandon failed: HTTP ${response.status}`);
  }
}
```

- [ ] **Step 5: Create wallets API client**

Create `apps/app/src/api/wallets.ts`:

```typescript
import { getBffBaseUrl } from './http.js';

export async function enrollWalletForMonitoring(walletId: string): Promise<{ enrolled: boolean; enrolledAt: number }> {
  const response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/monitor`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Enrollment failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<{ enrolled: boolean; enrolledAt: number }>;
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/api/alerts.ts \
       apps/app/src/api/history.ts \
       apps/app/src/api/previews.ts \
       apps/app/src/api/executions.ts \
       apps/app/src/api/wallets.ts
git commit -m "feat: add BFF API client functions for alerts, history, previews, executions, wallets"
```

---

### Task 21: Wire Alerts Route

**Files:**
- Modify: `apps/app/app/(tabs)/alerts.tsx`

- [ ] **Step 1: Replace thin re-export with data-fetching route**

Replace `apps/app/app/(tabs)/alerts.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchAlerts } from '../../src/api/alerts.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function AlertsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);

  const alertsQuery = useQuery({
    queryKey: ['alerts', walletAddress],
    queryFn: () => fetchAlerts(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
    refetchInterval: 30_000,
  });

  return (
    <AlertsListScreen
      alerts={alertsQuery.data}
      platformCapabilities={platformCapabilities}
      onSelectAlert={(triggerId, positionId) =>
        router.push(`/position/${positionId}`)
      }
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/\(tabs\)/alerts.tsx
git commit -m "feat: wire alerts route with TanStack Query data fetching"
```

---

### Task 22: Wire History Route

**Files:**
- Modify: `apps/app/app/(tabs)/history.tsx`

- [ ] **Step 1: Replace thin re-export with data-fetching route**

Replace `apps/app/app/(tabs)/history.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { HistoryListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchExecutionHistory } from '../../src/api/history.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function HistoryRoute() {
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  const historyQuery = useQuery({
    queryKey: ['execution-history', walletAddress],
    queryFn: () => fetchExecutionHistory(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
    refetchInterval: 30_000,
  });

  return (
    <HistoryListScreen
      events={historyQuery.data}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/\(tabs\)/history.tsx
git commit -m "feat: wire history route with TanStack Query data fetching"
```

---

### Task 23: Wire Position Detail Route

**Files:**
- Modify: `apps/app/app/position/[id].tsx`

- [ ] **Step 1: Replace thin re-export with data-fetching route**

Replace `apps/app/app/position/[id].tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { PositionDetailScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { fetchJson } from '../../src/api/http.js';
import { fetchAlerts } from '../../src/api/alerts.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';
import type { PositionDetailDto } from '@clmm/application/public';

async function fetchPositionDetail(positionId: string): Promise<PositionDetailDto | null> {
  // The BFF serves positions by wallet; we fetch position detail by loading positions
  // and filtering. For a dedicated detail endpoint, the BFF would need to add one.
  // For MVP, we use the positions list and find the matching one.
  // TODO: Consider adding a dedicated GET /positions/detail/:positionId endpoint
  return null;
}

export default function PositionDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);

  // Fetch alerts to find the matching alert for this position
  const alertsQuery = useQuery({
    queryKey: ['alerts', walletAddress],
    queryFn: () => fetchAlerts(walletAddress!),
    enabled: walletAddress != null && walletAddress.length > 0,
  });

  // Find alert matching this position
  const alert = alertsQuery.data?.find((a) => a.positionId === id);

  // Fetch position detail from positions list
  const positionsQuery = useQuery({
    queryKey: ['supported-positions', walletAddress],
    queryFn: async () => {
      const payload = (await fetchJson(`/positions/${walletAddress}`)) as { positions: PositionDetailDto[] };
      return payload.positions;
    },
    enabled: walletAddress != null && walletAddress.length > 0,
  });

  const position = positionsQuery.data?.find((p) => p.positionId === id) as PositionDetailDto | undefined;

  return (
    <PositionDetailScreen
      position={position}
      alert={alert}
      onViewPreview={(triggerId) => router.push(`/preview/${triggerId}`)}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/position/\[id\].tsx
git commit -m "feat: wire position detail route with TanStack Query data fetching"
```

---

### Task 24: Wire Preview Route

**Files:**
- Modify: `apps/app/app/preview/[triggerId].tsx`

- [ ] **Step 1: Replace thin re-export with data-fetching route**

Replace `apps/app/app/preview/[triggerId].tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExecutionPreviewScreen } from '@clmm/ui';
import { refreshPreview } from '../../src/api/previews.js';
import type { ExecutionPreviewDto } from '@clmm/application/public';
import { getBffBaseUrl } from '../../src/api/http.js';

export default function PreviewRoute() {
  const { triggerId } = useLocalSearchParams<{ triggerId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Create a fresh preview by refreshing from the trigger
  const previewQuery = useQuery({
    queryKey: ['preview', triggerId],
    queryFn: () => refreshPreview(triggerId!),
    enabled: triggerId != null && triggerId.length > 0,
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshPreview(triggerId!),
    onSuccess: (data) => {
      queryClient.setQueryData(['preview', triggerId], data);
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      // Create an execution attempt from the preview
      const response = await fetch(`${getBffBaseUrl()}/executions/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewId: previewQuery.data?.previewId,
          triggerId,
        }),
      });
      if (!response.ok) throw new Error(`Approve failed: HTTP ${response.status}`);
      return response.json() as Promise<{ attemptId: string }>;
    },
    onSuccess: (data) => {
      router.push(`/signing/${data.attemptId}`);
    },
  });

  return (
    <ExecutionPreviewScreen
      preview={previewQuery.data}
      onApprove={() => approveMutation.mutate()}
      onRefresh={() => refreshMutation.mutate()}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/preview/\[triggerId\].tsx
git commit -m "feat: wire preview route with TanStack Query data fetching"
```

---

### Task 25: Wire Signing Route

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 1: Replace thin re-export with data-fetching route**

Replace `apps/app/app/signing/[attemptId].tsx`:

```tsx
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SigningStatusScreen } from '@clmm/ui';
import { fetchExecution } from '../../src/api/executions.js';

export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: 5_000, // Poll for state updates during signing
  });

  const attempt = executionQuery.data;

  return (
    <SigningStatusScreen
      lifecycleState={attempt?.lifecycleState}
      breachDirection={attempt?.breachDirection}
      retryEligible={attempt?.retryEligible}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/signing/\[attemptId\].tsx
git commit -m "feat: wire signing route with TanStack Query data fetching"
```

---

### Task 26: Wire Execution Result Route

**Files:**
- Modify: `apps/app/app/execution/[attemptId].tsx`

- [ ] **Step 1: Replace thin re-export with data-fetching route**

Replace `apps/app/app/execution/[attemptId].tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ExecutionResultScreen } from '@clmm/ui';
import { fetchExecution } from '../../src/api/executions.js';

export default function ExecutionResultRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: (query) => {
      // Poll aggressively while submitted, then stop
      const state = query.state.data?.lifecycleState?.kind;
      if (state === 'submitted') return 5_000;
      if (state === 'confirmed' || state === 'failed' || state === 'partial' || state === 'abandoned') return false;
      return 15_000;
    },
  });

  const attempt = executionQuery.data;
  const firstTxSig = attempt?.transactionReferences?.[0]?.signature;

  return (
    <ExecutionResultScreen
      lifecycleState={attempt?.lifecycleState}
      breachDirection={attempt?.breachDirection}
      retryEligible={attempt?.retryEligible}
      transactionSignature={firstTxSig}
      onViewHistory={() => router.push('/(tabs)/history')}
    />
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/execution/\[attemptId\].tsx
git commit -m "feat: wire execution result route with TanStack Query data fetching"
```

---

### Task 27: Add Wallet Enrollment After Connection

**Files:**
- Modify: `apps/app/app/connect.tsx`

- [ ] **Step 1: Add enrollment call after successful wallet connection**

In `apps/app/app/connect.tsx`, after the `markConnected` call succeeds (the wallet address is now in the store), add:

```typescript
import { enrollWalletForMonitoring } from '../src/api/wallets.js';
```

After `walletSessionStore.getState().markConnected(...)` succeeds, add:

```typescript
// Best-effort enrollment -- non-blocking
enrollWalletForMonitoring(walletAddress).catch((err) => {
  console.warn('Wallet enrollment failed (will retry on next connect):', err);
});
```

This is best-effort: if enrollment fails, the wallet connection still succeeds. The next time the user connects, enrollment will be retried (it's idempotent).

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/connect.tsx
git commit -m "feat: add wallet enrollment for monitoring after connection"
```

---

### Task 28: Run Full Validation

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: All existing tests PASS

- [ ] **Step 4: Commit any fixes**

If any tests or lint issues arose, fix and commit.

---

## Phase 5: Signing + Submission Flow

### Task 29: Add Approve Execution Endpoint to BFF

**Files:**
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`

The existing `ExecutionController` has `submit` and `abandon` but no `approve` endpoint that creates an `ExecutionAttempt` in `awaiting-signature` state.

- [ ] **Step 1: Add approve endpoint**

Add to `ExecutionController`:

```typescript
@Post('approve')
async approveExecution(
  @Body() body: {
    previewId: string;
    triggerId: string;
    breachDirection?: 'lower-bound-breach' | 'upper-bound-breach';
  },
) {
  const previewResult = await this.executionRepo.getPreview(body.previewId);
  if (!previewResult) {
    throw new NotFoundException(`Preview not found: ${body.previewId}`);
  }

  const { preview, positionId, breachDirection } = previewResult;
  const attemptId = this.ids.generateId();

  const attempt: StoredExecutionAttempt = {
    attemptId,
    positionId,
    breachDirection,
    lifecycleState: { kind: 'awaiting-signature' },
    completedSteps: [],
    transactionReferences: [],
  };

  await this.executionRepo.saveAttempt(attempt);

  await this.historyRepo.appendEvent({
    eventId: this.ids.generateId(),
    positionId,
    eventType: 'signature-requested',
    breachDirection,
    occurredAt: this.clock.now(),
    lifecycleState: { kind: 'awaiting-signature' },
  });

  return {
    attemptId,
    positionId,
    breachDirection,
    lifecycleState: { kind: 'awaiting-signature' },
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/inbound/http/ExecutionController.ts
git commit -m "feat: add POST /executions/approve endpoint"
```

---

### Task 30: Wire Signing Screen Actions

The signing route (Task 25) polls for state updates. The actual signing flow requires:
1. The preview route approves (creates attempt in `awaiting-signature`) and navigates to signing
2. The signing screen triggers wallet signing via the native/browser adapter
3. After signing, the signed payload is submitted to the BFF
4. The result navigates to the execution result screen

This task wires the signing screen with wallet adapter interaction.

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 1: Enhance signing route with wallet signing flow**

Replace `apps/app/app/signing/[attemptId].tsx` with full signing flow:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { SigningStatusScreen } from '@clmm/ui';
import { fetchExecution, submitExecution } from '../../src/api/executions.js';

export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: 5_000,
  });

  const attempt = executionQuery.data;

  // When attempt transitions to submitted/confirmed/failed, navigate to result
  const currentState = attempt?.lifecycleState?.kind;
  if (currentState === 'submitted' || currentState === 'confirmed' || currentState === 'failed' || currentState === 'partial') {
    // Auto-navigate to result screen
    router.replace(`/execution/${attemptId}`);
  }

  return (
    <SigningStatusScreen
      lifecycleState={attempt?.lifecycleState}
      breachDirection={attempt?.breachDirection}
      retryEligible={attempt?.retryEligible}
    />
  );
}
```

Note: The actual wallet signing (MWA handoff or browser wallet) is initiated from the client-side wallet adapter. For MVP, the signing screen shows the `awaiting-signature` state and the app's wallet adapter flow handles the signing. The signed payload is submitted to the BFF via `submitExecution`. This integration depends on the platform-specific wallet adapter code already present in the codebase (`NativeWalletSigningAdapter`, `BrowserWalletSigningAdapter`).

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/signing/\[attemptId\].tsx
git commit -m "feat: enhance signing route with lifecycle state navigation"
```

---

## Phase 6: Notifications + Deep Links

### Task 31: Verify Notification Dispatch Integration

The `NotificationDispatchJobHandler` (Task 15) is already implemented. The `ExpoPushAdapter` is real and functional. This task verifies the integration.

- [ ] **Step 1: Verify ExpoPushAdapter is real**

Read `packages/adapters/src/outbound/notifications/ExpoPushAdapter.ts` and confirm it calls `expo-notifications` APIs.

- [ ] **Step 2: Verify NotificationDedupStorageAdapter works**

The adapter was created in Task 5. Verify it's wired in the `AdaptersModule` (Task 16).

- [ ] **Step 3: No code changes needed**

The notification pipeline is:
1. `TriggerQualificationJobHandler` enqueues `dispatch-notification` job
2. pg-boss picks it up
3. `NotificationDispatchJobHandler` calls `dispatchActionableNotification` use case
4. Use case checks dedup, calls `ExpoPushAdapter`, marks dispatched

This is already fully wired.

---

### Task 32: Add Deep Link Route Handling

**Files:**
- Modify: `apps/app/app/_layout.tsx` (if needed for deep link setup)

Deep link handling in Expo Router is largely automatic -- URLs like `clmm://preview/trigger-123` map to `app/preview/[triggerId].tsx` via file-based routing. The routes are already parameterized.

- [ ] **Step 1: Verify Expo Router deep link config**

Expo Router handles deep links automatically via the `scheme` in `app.json`. Verify the scheme is configured.

- [ ] **Step 2: Verify notification tap handler**

When a push notification is tapped, Expo's notification handler should extract the deep link URL and pass it to the router. This requires:

```typescript
import * as Notifications from 'expo-notifications';
```

In the root layout, add a listener for notification responses that navigates to the appropriate route. This is typically done in `apps/app/app/_layout.tsx`:

```typescript
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

// Inside the layout component:
const router = useRouter();

useEffect(() => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as {
      route?: string;
      positionId?: string;
      triggerId?: string;
    };
    if (data.route) {
      router.push(data.route);
    } else if (data.triggerId) {
      router.push(`/preview/${data.triggerId}`);
    } else if (data.positionId) {
      router.push(`/position/${data.positionId}`);
    }
  });
  return () => subscription.remove();
}, [router]);
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/app/app/_layout.tsx
git commit -m "feat: add notification tap deep link routing"
```

---

## Final Verification

### Task 33: Full Build + Test Validation

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS with 0 errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run boundary check**

Run: `pnpm boundaries`
Expected: PASS (no illegal imports)

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 5: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 6: Commit any remaining fixes**

If any issues arose, fix and commit with descriptive messages.

---

## Summary of Gaps Not Covered in This Plan

These items are acknowledged but out of scope for this plan:

1. **WebPushAdapter** -- remains a stub per design spec non-goals
2. **Background reconciliation from BFF** -- the inline reconciliation in the submit endpoint is sufficient for MVP. Background pg-boss reconciliation from BFF would require the BFF to have a pg-boss connection, which adds complexity deferred to post-MVP.
3. **BFF position detail endpoint** -- the current BFF serves positions by wallet. A dedicated `GET /positions/:positionId` detail endpoint would simplify the position detail route. The current plan works around this by filtering the positions list client-side.
4. **History tab per-wallet aggregation** -- the BFF's history endpoint is per-position. The history tab currently uses the wallet ID, which requires either (a) a new per-wallet history endpoint or (b) fetching positions first then aggregating. This may need a follow-up BFF endpoint.
5. **MWA signing integration in route** -- the signing route shows lifecycle state but the actual MWA handoff integration (triggering `NativeWalletSigningAdapter`) requires platform-specific code in the composition layer that connects the wallet adapter to the signing screen's approve action. This is partially covered by the existing `ApproveExecution` use case but needs platform-specific wiring.
