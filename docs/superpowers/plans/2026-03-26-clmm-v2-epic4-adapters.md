# CLMM V2 — Epic 4: Infrastructure Adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Epic 3 complete — all application use cases pass with fake ports.

**Goal:** Implement every adapter that satisfies an application port. Storage (Drizzle + PostgreSQL), observability, Orca position reads, Jupiter swap quotes, Solana execution, wallet signing (native + browser), platform capability, notification permission, and deep-link adapters. No adapter may decide breach direction or target posture. Each adapter is validated against its port contract via contract tests in `packages/testing/src/contracts/`.

**Architecture:** All adapters in `packages/adapters/src/outbound/`. Inbound HTTP and job handlers in `packages/adapters/src/inbound/`. NestJS modules wire everything. pg-boss provides idempotent job scheduling.

**IMPORTANT:** Always use the `solana-adapter-docs` skill before writing any code that touches `@solana/kit`, `@orca-so/whirlpools`, Jupiter REST API, `@solana-mobile/mobile-wallet-adapter-protocol`, or Expo Push. These APIs have breaking changes between minor versions.

**Tech Stack:** Drizzle ORM, PostgreSQL (Railway), NestJS, pg-boss, @solana/kit, @orca-so/whirlpools, Jupiter API v6 REST, Expo Push, Vitest

---

## File Map

```
packages/adapters/src/
  outbound/
    storage/
      schema/
        triggers.ts           # Drizzle schema for breach episodes + triggers
        previews.ts           # Drizzle schema for execution previews
        executions.ts         # Drizzle schema for execution attempts + sessions
        history.ts            # Drizzle schema for off-chain history events
      OffChainHistoryStorageAdapter.ts
      OperationalStorageAdapter.ts   # TriggerRepository + ExecutionRepository + ExecutionSessionRepository
      db.ts                          # Drizzle client factory
    observability/
      TelemetryAdapter.ts
    solana-position-reads/
      OrcaPositionReadAdapter.ts
      SolanaRangeObservationAdapter.ts
    swap-execution/
      JupiterQuoteAdapter.ts
      SolanaExecutionPreparationAdapter.ts
      SolanaExecutionSubmissionAdapter.ts
    wallet-signing/
      NativeWalletSigningAdapter.ts
      BrowserWalletSigningAdapter.ts
    notifications/
      ExpoPushAdapter.ts
      WebPushAdapter.ts
      InAppAlertAdapter.ts
    capabilities/
      NativePlatformCapabilityAdapter.ts
      WebPlatformCapabilityAdapter.ts
      NativeNotificationPermissionAdapter.ts
      WebNotificationPermissionAdapter.ts
      ExpoDeepLinkAdapter.ts
      WebDeepLinkAdapter.ts
  inbound/
    http/
      PositionController.ts
      AlertController.ts
      PreviewController.ts
      ExecutionController.ts
      AppModule.ts              # NestJS BFF module
      main.ts                   # updated bootstrap
    jobs/
      BreachScanJobHandler.ts
      TriggerQualificationJobHandler.ts
      ReconciliationJobHandler.ts
      NotificationDispatchJobHandler.ts
      WorkerModule.ts           # NestJS worker module
      main.ts                   # updated bootstrap
  composition/
    AdaptersModule.ts           # updated with all providers

packages/testing/src/
  contracts/
    PositionReadPortContract.ts   # contract test for SupportedPositionReadPort
    WalletSigningPortContract.ts  # contract test for WalletSigningPort
    StoragePortContract.ts        # contract test for repositories
    index.ts
```

---

## Task 1: Drizzle Schema + Database Client

**⚠️ BEFORE WRITING:** Use `find-docs` skill for current Drizzle ORM API.

- [ ] **Step 1.1: Install Drizzle dependencies**

```bash
pnpm --filter @clmm/adapters add drizzle-orm postgres
pnpm --filter @clmm/adapters add -D drizzle-kit @types/pg
```

- [ ] **Step 1.2: Create Drizzle db client**

`packages/adapters/src/outbound/storage/db.ts`:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as triggersSchema from './schema/triggers.js';
import * as previewsSchema from './schema/previews.js';
import * as executionsSchema from './schema/executions.js';
import * as historySchema from './schema/history.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, {
    schema: {
      ...triggersSchema,
      ...previewsSchema,
      ...executionsSchema,
      ...historySchema,
    },
  });
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 1.3: Create triggers schema**

`packages/adapters/src/outbound/storage/schema/triggers.ts`:
```typescript
import { pgTable, text, integer, boolean, bigint } from 'drizzle-orm/pg-core';

export const breachEpisodes = pgTable('breach_episodes', {
  episodeId: text('episode_id').primaryKey(),
  positionId: text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(), // 'lower-bound-breach' | 'upper-bound-breach'
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  lastObservedAt: bigint('last_observed_at', { mode: 'number' }).notNull(),
  activeTriggerId: text('active_trigger_id'),
});

export const exitTriggers = pgTable('exit_triggers', {
  triggerId: text('trigger_id').primaryKey(),
  positionId: text('position_id').notNull(),
  episodeId: text('episode_id').notNull(),
  directionKind: text('direction_kind').notNull(),
  triggeredAt: bigint('triggered_at', { mode: 'number' }).notNull(),
  confirmationEvaluatedAt: bigint('confirmation_evaluated_at', { mode: 'number' }).notNull(),
  confirmationPassed: boolean('confirmation_passed').notNull().default(true),
});
```

- [ ] **Step 1.4: Create previews schema**

`packages/adapters/src/outbound/storage/schema/previews.ts`:
```typescript
import { pgTable, text, bigint, jsonb } from 'drizzle-orm/pg-core';

export const executionPreviews = pgTable('execution_previews', {
  previewId: text('preview_id').primaryKey(),
  positionId: text('position_id').notNull(),
  planJson: jsonb('plan_json').notNull(),
  freshnessKind: text('freshness_kind').notNull(), // 'fresh' | 'stale' | 'expired'
  freshnessExpiresAt: bigint('freshness_expires_at', { mode: 'number' }),
  estimatedAt: bigint('estimated_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 1.5: Create executions schema**

`packages/adapters/src/outbound/storage/schema/executions.ts`:
```typescript
import { pgTable, text, bigint, jsonb } from 'drizzle-orm/pg-core';

export const executionAttempts = pgTable('execution_attempts', {
  attemptId: text('attempt_id').primaryKey(),
  positionId: text('position_id').notNull(),
  lifecycleStateKind: text('lifecycle_state_kind').notNull(),
  completedStepsJson: jsonb('completed_steps_json').notNull().default([]),
  transactionRefsJson: jsonb('transaction_refs_json').notNull().default([]),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const executionSessions = pgTable('execution_sessions', {
  sessionId: text('session_id').primaryKey(),
  attemptId: text('attempt_id').notNull(),
  walletId: text('wallet_id').notNull(),
  positionId: text('position_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 1.6: Create history schema**

`packages/adapters/src/outbound/storage/schema/history.ts`:
```typescript
import { pgTable, text, bigint, jsonb } from 'drizzle-orm/pg-core';

// Off-chain operational event log — NOT an on-chain receipt or attestation
export const historyEvents = pgTable('history_events', {
  eventId: text('event_id').primaryKey(),
  positionId: text('position_id').notNull(),
  eventType: text('event_type').notNull(),
  directionKind: text('direction_kind').notNull(), // breach direction always preserved
  occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
  lifecycleStateKind: text('lifecycle_state_kind'),
  transactionRefJson: jsonb('transaction_ref_json'),
  // Explicitly no: receipt_data, attestation, proof, claim_id, canonical_cert
});
```

- [ ] **Step 1.7: Create drizzle.config.ts at repo root**

`drizzle.config.ts`:
```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/adapters/src/outbound/storage/schema/*.ts',
  out: './packages/adapters/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/clmm_v2',
  },
});
```

- [ ] **Step 1.8: Typecheck adapters**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: exits 0.

- [ ] **Step 1.9: Commit**

```bash
git add packages/adapters/src/outbound/storage/ drizzle.config.ts
git commit -m "feat(adapters): Drizzle schema for storage (triggers, previews, executions, history)"
```

---

## Task 2: OperationalStorageAdapter (TDD)

**Files:**
- Create: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`
- Create: `packages/testing/src/contracts/StoragePortContract.ts`

- [ ] **Step 2.1: Write contract test for storage ports**

`packages/testing/src/contracts/StoragePortContract.ts`:
```typescript
/**
 * Contract test: any TriggerRepository implementation must satisfy these behaviors.
 * Import this in adapter-specific test files and pass the real adapter under test.
 */
import { describe, it, expect } from 'vitest';
import type { TriggerRepository } from '@clmm/application';
import {
  FIXTURE_POSITION_ID,
} from '../fixtures/positions.js';
import {
  LOWER_BOUND_BREACH,
  makeClockTimestamp,
  makeWalletId,
} from '@clmm/domain';
import type { ExitTrigger, ExitTriggerId, BreachEpisodeId } from '@clmm/domain';

const WALLET_ID = makeWalletId('contract-wallet');

export function runTriggerRepositoryContract(
  factory: () => TriggerRepository,
): void {
  describe('TriggerRepository contract', () => {
    it('saves and retrieves a trigger', async () => {
      const repo = factory();
      const trigger: ExitTrigger = {
        triggerId: 'contract-trigger-1' as ExitTriggerId,
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        triggeredAt: makeClockTimestamp(1_000_000),
        confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
        confirmationPassed: true,
        episodeId: 'contract-ep-1' as BreachEpisodeId,
      };
      await repo.saveTrigger(trigger);
      const fetched = await repo.getTrigger('contract-trigger-1' as ExitTriggerId);
      expect(fetched?.triggerId).toBe('contract-trigger-1');
      expect(fetched?.breachDirection.kind).toBe('lower-bound-breach');
    });

    it('returns null for unknown trigger', async () => {
      const repo = factory();
      const result = await repo.getTrigger('nonexistent' as ExitTriggerId);
      expect(result).toBeNull();
    });

    it('suppresses duplicate episode via getActiveEpisodeTrigger', async () => {
      const repo = factory();
      const trigger: ExitTrigger = {
        triggerId: 'dup-trigger-1' as ExitTriggerId,
        positionId: FIXTURE_POSITION_ID,
        breachDirection: LOWER_BOUND_BREACH,
        triggeredAt: makeClockTimestamp(1_000_000),
        confirmationEvaluatedAt: makeClockTimestamp(1_000_000),
        confirmationPassed: true,
        episodeId: 'dup-ep-1' as BreachEpisodeId,
      };
      await repo.saveTrigger(trigger);
      await repo.saveEpisode({
        episodeId: 'dup-ep-1' as BreachEpisodeId,
        positionId: FIXTURE_POSITION_ID,
        direction: LOWER_BOUND_BREACH,
        startedAt: makeClockTimestamp(1_000_000),
        lastObservedAt: makeClockTimestamp(1_000_000),
        activeTriggerId: trigger.triggerId,
      });
      const existing = await repo.getActiveEpisodeTrigger('dup-ep-1' as BreachEpisodeId);
      expect(existing).toBe('dup-trigger-1');
    });
  });
}
```

- [ ] **Step 2.2: Implement OperationalStorageAdapter**

`packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`:
```typescript
import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { breachEpisodes, exitTriggers, executionAttempts, executionSessions, executionPreviews } from './schema/index.js';
import type {
  TriggerRepository,
  ExecutionRepository,
  ExecutionSessionRepository,
  IdGeneratorPort,
} from '@clmm/application';
import type {
  ExitTrigger,
  BreachEpisode,
  ExitTriggerId,
  BreachEpisodeId,
  WalletId,
  PositionId,
  ExecutionPreview,
  ExecutionAttempt,
  ExecutionLifecycleState,
  ClockTimestamp,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

function directionFromKind(kind: string) {
  return kind === 'lower-bound-breach' ? LOWER_BOUND_BREACH : UPPER_BOUND_BREACH;
}

export class OperationalStorageAdapter
  implements TriggerRepository, ExecutionRepository, ExecutionSessionRepository
{
  constructor(
    private readonly db: Db,
    private readonly ids: IdGeneratorPort,
  ) {}

  // --- TriggerRepository ---

  async saveTrigger(trigger: ExitTrigger): Promise<void> {
    await this.db.insert(exitTriggers).values({
      triggerId: trigger.triggerId,
      positionId: trigger.positionId,
      episodeId: trigger.episodeId,
      directionKind: trigger.breachDirection.kind,
      triggeredAt: trigger.triggeredAt,
      confirmationEvaluatedAt: trigger.confirmationEvaluatedAt,
      confirmationPassed: true,
    }).onConflictDoNothing();
  }

  async getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    const rows = await this.db
      .select()
      .from(exitTriggers)
      .where(eq(exitTriggers.triggerId, triggerId));
    const row = rows[0];
    if (!row) return null;
    return {
      triggerId: row.triggerId as ExitTriggerId,
      positionId: row.positionId as PositionId,
      episodeId: row.episodeId as BreachEpisodeId,
      breachDirection: directionFromKind(row.directionKind),
      triggeredAt: makeClockTimestamp(row.triggeredAt),
      confirmationEvaluatedAt: makeClockTimestamp(row.confirmationEvaluatedAt),
      confirmationPassed: true,
    };
  }

  async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    // In a real impl, filter by wallet via position join
    // For MVP, return all — position filtering happens at application layer
    const rows = await this.db.select().from(exitTriggers);
    return rows.map((row) => ({
      triggerId: row.triggerId as ExitTriggerId,
      positionId: row.positionId as PositionId,
      episodeId: row.episodeId as BreachEpisodeId,
      breachDirection: directionFromKind(row.directionKind),
      triggeredAt: makeClockTimestamp(row.triggeredAt),
      confirmationEvaluatedAt: makeClockTimestamp(row.confirmationEvaluatedAt),
      confirmationPassed: true,
    }));
  }

  async getActiveEpisodeTrigger(episodeId: BreachEpisodeId): Promise<ExitTriggerId | null> {
    const rows = await this.db
      .select()
      .from(breachEpisodes)
      .where(eq(breachEpisodes.episodeId, episodeId));
    const row = rows[0];
    return (row?.activeTriggerId as ExitTriggerId | undefined) ?? null;
  }

  async saveEpisode(episode: BreachEpisode): Promise<void> {
    await this.db.insert(breachEpisodes).values({
      episodeId: episode.episodeId,
      positionId: episode.positionId,
      directionKind: episode.direction.kind,
      startedAt: episode.startedAt,
      lastObservedAt: episode.lastObservedAt,
      activeTriggerId: episode.activeTriggerId ?? null,
    }).onConflictDoUpdate({
      target: breachEpisodes.episodeId,
      set: {
        lastObservedAt: episode.lastObservedAt,
        activeTriggerId: episode.activeTriggerId ?? null,
      },
    });
  }

  // --- ExecutionRepository ---

  async savePreview(positionId: PositionId, preview: ExecutionPreview): Promise<{ previewId: string }> {
    const previewId = this.ids.generateId();
    await this.db.insert(executionPreviews).values({
      previewId,
      positionId,
      planJson: preview.plan as unknown as Record<string, unknown>,
      freshnessKind: preview.freshness.kind,
      freshnessExpiresAt: preview.freshness.kind === 'fresh' ? preview.freshness.expiresAt : null,
      estimatedAt: preview.estimatedAt,
      createdAt: Date.now(),
    });
    return { previewId };
  }

  async getPreview(previewId: string): Promise<ExecutionPreview | null> {
    const rows = await this.db
      .select()
      .from(executionPreviews)
      .where(eq(executionPreviews.previewId, previewId));
    const row = rows[0];
    if (!row) return null;
    return {
      plan: row.planJson as ExecutionPreview['plan'],
      freshness: row.freshnessKind === 'fresh'
        ? { kind: 'fresh', expiresAt: row.freshnessExpiresAt ?? 0 }
        : row.freshnessKind === 'stale'
          ? { kind: 'stale' }
          : { kind: 'expired' },
      estimatedAt: makeClockTimestamp(row.estimatedAt),
    };
  }

  async saveAttempt(
    attempt: ExecutionAttempt & { attemptId: string; positionId: PositionId },
  ): Promise<void> {
    const now = Date.now();
    await this.db.insert(executionAttempts).values({
      attemptId: attempt.attemptId,
      positionId: attempt.positionId,
      lifecycleStateKind: attempt.lifecycleState.kind,
      completedStepsJson: attempt.completedSteps as unknown as string[],
      transactionRefsJson: attempt.transactionReferences as unknown as Record<string, unknown>[],
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  async getAttempt(attemptId: string): Promise<(ExecutionAttempt & { attemptId: string; positionId: PositionId }) | null> {
    const rows = await this.db
      .select()
      .from(executionAttempts)
      .where(eq(executionAttempts.attemptId, attemptId));
    const row = rows[0];
    if (!row) return null;
    return {
      attemptId: row.attemptId,
      positionId: row.positionId as PositionId,
      lifecycleState: { kind: row.lifecycleStateKind } as ExecutionLifecycleState,
      completedSteps: (row.completedStepsJson as string[]) ?? [],
      transactionReferences: (row.transactionRefsJson as Array<{ signature: string; stepKind: string }>) ?? [],
    };
  }

  async updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void> {
    await this.db
      .update(executionAttempts)
      .set({ lifecycleStateKind: state.kind, updatedAt: Date.now() })
      .where(eq(executionAttempts.attemptId, attemptId));
  }

  // --- ExecutionSessionRepository ---

  async saveSession(params: {
    sessionId: string;
    attemptId: string;
    walletId: WalletId;
    positionId: PositionId;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    await this.db.insert(executionSessions).values({
      sessionId: params.sessionId,
      attemptId: params.attemptId,
      walletId: params.walletId,
      positionId: params.positionId,
      createdAt: params.createdAt,
    }).onConflictDoNothing();
  }

  async getSession(sessionId: string): Promise<{ attemptId: string; walletId: WalletId; positionId: PositionId } | null> {
    const rows = await this.db
      .select()
      .from(executionSessions)
      .where(eq(executionSessions.sessionId, sessionId));
    const row = rows[0];
    if (!row) return null;
    return {
      attemptId: row.attemptId,
      walletId: row.walletId as WalletId,
      positionId: row.positionId as PositionId,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(executionSessions).where(eq(executionSessions.sessionId, sessionId));
  }
}
```

- [ ] **Step 2.3: Add schema barrel**

`packages/adapters/src/outbound/storage/schema/index.ts`:
```typescript
export * from './triggers.js';
export * from './previews.js';
export * from './executions.js';
export * from './history.js';
```

- [ ] **Step 2.4: Typecheck**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: exits 0.

- [ ] **Step 2.5: Commit**

```bash
git add packages/adapters/src/outbound/storage/ packages/testing/src/contracts/
git commit -m "feat(adapters): OperationalStorageAdapter with Drizzle + contract tests"
```

---

## Task 3: OffChainHistoryStorageAdapter

**Files:**
- Create: `packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`

- [ ] **Step 3.1: Implement OffChainHistoryStorageAdapter**

`packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts`:
```typescript
import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { historyEvents } from './schema/index.js';
import type { ExecutionHistoryRepository } from '@clmm/application';
import type {
  HistoryEvent,
  HistoryTimeline,
  ExecutionOutcomeSummary,
  PositionId,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

export class OffChainHistoryStorageAdapter implements ExecutionHistoryRepository {
  constructor(private readonly db: Db) {}

  async appendEvent(event: HistoryEvent): Promise<void> {
    await this.db.insert(historyEvents).values({
      eventId: event.eventId,
      positionId: event.positionId,
      eventType: event.eventType,
      directionKind: event.breachDirection.kind,
      occurredAt: event.occurredAt,
      lifecycleStateKind: event.lifecycleState?.kind ?? null,
      transactionRefJson: event.transactionReference
        ? (event.transactionReference as unknown as Record<string, unknown>)
        : null,
    }).onConflictDoNothing();
  }

  async getTimeline(positionId: PositionId): Promise<HistoryTimeline> {
    const rows = await this.db
      .select()
      .from(historyEvents)
      .where(eq(historyEvents.positionId, positionId))
      .orderBy(historyEvents.occurredAt);

    const events: HistoryEvent[] = rows.map((row) => ({
      eventId: row.eventId,
      positionId: row.positionId as PositionId,
      eventType: row.eventType as HistoryEvent['eventType'],
      breachDirection:
        row.directionKind === 'lower-bound-breach' ? LOWER_BOUND_BREACH : UPPER_BOUND_BREACH,
      occurredAt: makeClockTimestamp(row.occurredAt),
      lifecycleState: row.lifecycleStateKind
        ? ({ kind: row.lifecycleStateKind } as HistoryEvent['lifecycleState'])
        : undefined,
      transactionReference: row.transactionRefJson as HistoryEvent['transactionReference'],
    }));

    return { positionId, events };
  }

  async getOutcomeSummary(_positionId: PositionId): Promise<ExecutionOutcomeSummary | null> {
    // MVP: compute from latest terminal event
    return null;
  }
}
```

- [ ] **Step 3.2: Typecheck**

```bash
pnpm --filter @clmm/adapters typecheck
```

- [ ] **Step 3.3: Commit**

```bash
git add packages/adapters/src/outbound/storage/OffChainHistoryStorageAdapter.ts
git commit -m "feat(adapters): OffChainHistoryStorageAdapter (off-chain operational history)"
```

---

## Task 4: TelemetryAdapter

**Files:**
- Create: `packages/adapters/src/outbound/observability/TelemetryAdapter.ts`

- [ ] **Step 4.1: Implement TelemetryAdapter**

`packages/adapters/src/outbound/observability/TelemetryAdapter.ts`:
```typescript
import type { ObservabilityPort } from '@clmm/application';

export class TelemetryAdapter implements ObservabilityPort {
  log(
    level: 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...context,
    };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  recordTiming(
    event: string,
    durationMs: number,
    tags?: Record<string, string>,
  ): void {
    this.log('info', `timing:${event}`, { durationMs, ...tags });
  }
}
```

- [ ] **Step 4.2: Commit**

```bash
git add packages/adapters/src/outbound/observability/
git commit -m "feat(adapters): TelemetryAdapter"
```

---

## Task 5: OrcaPositionReadAdapter

**⚠️ REQUIRED:** Run `solana-adapter-docs` skill before writing this task.

**Files:**
- Create: `packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`

- [ ] **Step 5.1: Install Orca + Solana kit dependencies**

```bash
pnpm --filter @clmm/adapters add @orca-so/whirlpools @solana/kit
```

- [ ] **Step 5.2: Invoke solana-adapter-docs skill**

Use the `solana-adapter-docs` skill to fetch current `@orca-so/whirlpools` and `@solana/kit` documentation before writing adapter code.

- [ ] **Step 5.3: Implement OrcaPositionReadAdapter**

`packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts`:
```typescript
/**
 * OrcaPositionReadAdapter
 *
 * Translates Orca whirlpool position data into domain LiquidityPosition DTOs.
 * This adapter NEVER decides breach direction or target posture.
 * All direction decisions happen in packages/domain via DirectionalExitPolicyService.
 *
 * ⚠️ Use solana-adapter-docs skill before editing — @orca-so/whirlpools API changes
 */
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';
// boundary: Orca types only at this adapter boundary
// import { ... } from '@orca-so/whirlpools';

export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  // TODO: inject RPC URL via constructor once solana-adapter-docs confirms current factory API
  constructor(private readonly rpcUrl: string) {}

  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    // TODO: Implement using @orca-so/whirlpools fetchPositionsForOwner after fetching docs
    // Pattern:
    // 1. Create @solana/kit RPC via createSolanaRpc(rpcUrl)
    // 2. Call Orca SDK to list positions for walletId address
    // 3. Map each Orca position → LiquidityPosition (translate immediately at boundary)
    // 4. NEVER return Orca-typed objects — always domain types
    throw new Error('OrcaPositionReadAdapter.listSupportedPositions: invoke solana-adapter-docs skill first');
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition | null> {
    // TODO: fetch single position by positionId address
    throw new Error('OrcaPositionReadAdapter.getPosition: invoke solana-adapter-docs skill first');
  }
}
```

> **Note:** The TODO stubs are intentional. The actual Orca API call must be written **after** invoking the `solana-adapter-docs` skill to fetch current SDK documentation. Do not guess API shapes — they change between minor versions.

- [ ] **Step 5.4: Typecheck**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: exits 0 (stubs throw but types are correct).

- [ ] **Step 5.5: Commit**

```bash
git add packages/adapters/src/outbound/solana-position-reads/OrcaPositionReadAdapter.ts
git commit -m "feat(adapters): OrcaPositionReadAdapter stub (requires solana-adapter-docs before impl)"
```

---

## Task 6: JupiterQuoteAdapter

**⚠️ REQUIRED:** Run `solana-adapter-docs` skill for current Jupiter API v6 REST endpoints.

**Files:**
- Create: `packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.ts`

- [ ] **Step 6.1: Implement JupiterQuoteAdapter**

`packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.ts`:
```typescript
/**
 * JupiterQuoteAdapter
 *
 * Fetches a swap quote from Jupiter API v6 REST.
 * The swap instruction comes FROM the domain (DirectionalExitPolicyService).
 * This adapter MUST NOT rewrite fromAsset/toAsset — it preserves whatever the domain provided.
 *
 * ⚠️ Use solana-adapter-docs skill before editing — Jupiter v6 endpoint params change frequently
 */
import type { SwapQuotePort } from '@clmm/application';
import type { SwapInstruction, TokenAmount, ClockTimestamp } from '@clmm/domain';
import { makeTokenAmount, makeClockTimestamp } from '@clmm/domain';

// boundary: Jupiter REST types
const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

// MVP token mint addresses (mainnet)
const TOKEN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export class JupiterQuoteAdapter implements SwapQuotePort {
  async getQuote(instruction: SwapInstruction): Promise<{
    estimatedOutputAmount: TokenAmount;
    priceImpactPercent: number;
    routeLabel: string;
    quotedAt: ClockTimestamp;
  }> {
    const inputMint = TOKEN_MINTS[instruction.fromAsset];
    const outputMint = TOKEN_MINTS[instruction.toAsset];

    if (!inputMint || !outputMint) {
      throw new Error(
        `JupiterQuoteAdapter: unsupported asset pair ${instruction.fromAsset}→${instruction.toAsset}`,
      );
    }

    // TODO: after invoking solana-adapter-docs skill, replace with actual fetch:
    // const params = new URLSearchParams({
    //   inputMint,
    //   outputMint,
    //   amount: instruction.amountBasis?.raw.toString() ?? '1000000',
    //   slippageBps: '50',
    // });
    // const res = await fetch(`${JUPITER_API_BASE}/quote?${params}`);
    // const data = await res.json();
    // translate data → domain types immediately at boundary

    throw new Error('JupiterQuoteAdapter.getQuote: invoke solana-adapter-docs skill first for current v6 API params');
  }
}
```

- [ ] **Step 6.2: Implement adapter contract test**

`packages/testing/src/contracts/PositionReadPortContract.ts`:
```typescript
/**
 * Contract test: validates any SupportedPositionReadPort implementation.
 * Wire this with a real adapter + test database / recorded fixture to run.
 */
import { describe, it, expect } from 'vitest';
import type { SupportedPositionReadPort } from '@clmm/application';
import { makeWalletId } from '@clmm/domain';

export function runPositionReadPortContract(
  factory: () => SupportedPositionReadPort,
): void {
  describe('SupportedPositionReadPort contract', () => {
    it('returns an array from listSupportedPositions (may be empty)', async () => {
      const port = factory();
      const result = await port.listSupportedPositions(makeWalletId('test-wallet'));
      expect(Array.isArray(result)).toBe(true);
    });

    it('positions have positionId, bounds, rangeState', async () => {
      const port = factory();
      const positions = await port.listSupportedPositions(makeWalletId('test-wallet'));
      for (const pos of positions) {
        expect(pos.positionId).toBeTruthy();
        expect(pos.bounds.lowerBound).toBeDefined();
        expect(pos.bounds.upperBound).toBeDefined();
        expect(['in-range', 'below-range', 'above-range']).toContain(pos.rangeState.kind);
      }
    });

    it('adapter does not decide breach direction — rangeState is structural, not policy', async () => {
      const port = factory();
      const positions = await port.listSupportedPositions(makeWalletId('test-wallet'));
      for (const pos of positions) {
        // rangeState should only be 'in-range' | 'below-range' | 'above-range'
        // NOT 'lower-bound-breach' or 'upper-bound-breach' — those are domain concepts
        expect(['in-range', 'below-range', 'above-range']).toContain(pos.rangeState.kind);
      }
    });
  });
}
```

- [ ] **Step 6.3: Commit**

```bash
git add packages/adapters/src/outbound/swap-execution/JupiterQuoteAdapter.ts packages/testing/src/contracts/
git commit -m "feat(adapters): JupiterQuoteAdapter stub + port contract tests"
```

---

## Task 7: Wallet Signing Adapters

**⚠️ REQUIRED:** Run `solana-adapter-docs` skill for MWA and @solana/wallet-adapter-react before implementing.

**Files:**
- Create: `packages/adapters/src/outbound/wallet-signing/NativeWalletSigningAdapter.ts`
- Create: `packages/adapters/src/outbound/wallet-signing/BrowserWalletSigningAdapter.ts`

- [ ] **Step 7.1: Implement NativeWalletSigningAdapter (stub)**

`packages/adapters/src/outbound/wallet-signing/NativeWalletSigningAdapter.ts`:
```typescript
/**
 * NativeWalletSigningAdapter
 *
 * Uses @solana-mobile/mobile-wallet-adapter-protocol (MWA) for React Native.
 * Signing remains EXPLICIT and USER-MEDIATED — backend NEVER stores signing authority.
 *
 * ⚠️ Use solana-adapter-docs skill before implementing — MWA session management varies by version
 */
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

export class NativeWalletSigningAdapter implements WalletSigningPort {
  async requestSignature(
    serializedPayload: Uint8Array,
    walletId: WalletId,
  ): Promise<
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
  > {
    // TODO: after solana-adapter-docs skill, implement:
    // 1. Open MWA session via transact()
    // 2. Request authorize + signAndSendTransactions
    // 3. Map result → signed | declined | interrupted
    // 4. NEVER store signing authority — only return signed payload
    throw new Error('NativeWalletSigningAdapter: invoke solana-adapter-docs skill first');
  }
}
```

`packages/adapters/src/outbound/wallet-signing/BrowserWalletSigningAdapter.ts`:
```typescript
/**
 * BrowserWalletSigningAdapter
 *
 * Uses @solana/wallet-adapter-react for desktop PWA.
 * ⚠️ Use solana-adapter-docs skill before implementing
 */
import type { WalletSigningPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';

export class BrowserWalletSigningAdapter implements WalletSigningPort {
  async requestSignature(
    _serializedPayload: Uint8Array,
    _walletId: WalletId,
  ): Promise<
    | { kind: 'signed'; signedPayload: Uint8Array }
    | { kind: 'declined' }
    | { kind: 'interrupted' }
  > {
    throw new Error('BrowserWalletSigningAdapter: invoke solana-adapter-docs skill first');
  }
}
```

- [ ] **Step 7.2: Write wallet contract test**

`packages/testing/src/contracts/WalletSigningPortContract.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { WalletSigningPort } from '@clmm/application';
import { makeWalletId } from '@clmm/domain';

export function runWalletSigningPortContract(
  factory: () => WalletSigningPort,
): void {
  describe('WalletSigningPort contract', () => {
    it('signed result contains a non-empty signedPayload', async () => {
      const port = factory();
      const result = await port.requestSignature(
        new Uint8Array([1, 2, 3]),
        makeWalletId('test-wallet'),
      );
      if (result.kind === 'signed') {
        expect(result.signedPayload.length).toBeGreaterThan(0);
      }
    });

    it('result kind is one of: signed | declined | interrupted', async () => {
      const port = factory();
      const result = await port.requestSignature(
        new Uint8Array([1, 2, 3]),
        makeWalletId('test-wallet'),
      );
      expect(['signed', 'declined', 'interrupted']).toContain(result.kind);
    });
  });
}
```

- [ ] **Step 7.3: Update testing barrel**

`packages/testing/src/contracts/index.ts`:
```typescript
export { runTriggerRepositoryContract } from './StoragePortContract.js';
export { runPositionReadPortContract } from './PositionReadPortContract.js';
export { runWalletSigningPortContract } from './WalletSigningPortContract.js';
```

- [ ] **Step 7.4: Commit**

```bash
git add packages/adapters/src/outbound/wallet-signing/ packages/testing/src/contracts/
git commit -m "feat(adapters): wallet signing adapter stubs + port contract tests"
```

---

## Task 8: Capability + Notification Adapters (Stubs)

- [ ] **Step 8.1: Create capability adapter stubs**

`packages/adapters/src/outbound/capabilities/NativePlatformCapabilityAdapter.ts`:
```typescript
import type { PlatformCapabilityPort } from '@clmm/application';
import type { PlatformCapabilityState } from '@clmm/application';

export class NativePlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    // TODO: use Expo APIs to determine real capabilities
    return {
      nativePushAvailable: true,
      browserNotificationAvailable: false,
      nativeWalletAvailable: true,
      browserWalletAvailable: false,
      isMobileWeb: false,
    };
  }
}
```

`packages/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter.ts`:
```typescript
import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

export class WebPlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    const isMobileWeb =
      typeof navigator !== 'undefined' &&
      /Mobile|Android|iPhone/i.test(navigator.userAgent);
    return {
      nativePushAvailable: false,
      browserNotificationAvailable:
        typeof Notification !== 'undefined' && Notification.permission === 'granted',
      nativeWalletAvailable: false,
      browserWalletAvailable: !isMobileWeb,
      isMobileWeb,
    };
  }
}
```

`packages/adapters/src/outbound/capabilities/ExpoDeepLinkAdapter.ts`:
```typescript
import type { DeepLinkEntryPort, DeepLinkMetadata } from '@clmm/application';
import type { PositionId, ExitTriggerId } from '@clmm/domain';

export class ExpoDeepLinkAdapter implements DeepLinkEntryPort {
  parseDeepLink(url: string): DeepLinkMetadata {
    // clmmv2://preview/<triggerId>/<positionId>
    // clmmv2://history/<positionId>
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '');
    const parts = path.split('/');

    if (parts[0] === 'preview' && parts[1] && parts[2]) {
      return {
        kind: 'preview',
        triggerId: parts[1] as ExitTriggerId,
        positionId: parts[2] as PositionId,
      };
    }
    if (parts[0] === 'history' && parts[1]) {
      return { kind: 'history', positionId: parts[1] as PositionId };
    }
    return { kind: 'unknown' };
  }
}
```

- [ ] **Step 8.2: Create notification adapter stubs**

`packages/adapters/src/outbound/notifications/ExpoPushAdapter.ts`:
```typescript
/**
 * ExpoPushAdapter — best-effort native push notifications
 * ⚠️ Use solana-adapter-docs skill for Expo Push Notifications API before implementing
 */
import type { NotificationPort } from '@clmm/application';
import type { WalletId, PositionId, BreachDirection, ClockTimestamp, ExitTriggerId } from '@clmm/domain';

export class ExpoPushAdapter implements NotificationPort {
  async sendActionableAlert(params: {
    walletId: WalletId;
    positionId: PositionId;
    breachDirection: BreachDirection;
    triggerId: ExitTriggerId;
  }): Promise<{ deliveredAt: ClockTimestamp | null }> {
    const direction = params.breachDirection.kind === 'lower-bound-breach'
      ? 'below range → exit to USDC'
      : 'above range → exit to SOL';
    // TODO: use Expo Push API to send notification with direction copy
    console.warn('ExpoPushAdapter: stub — invoke solana-adapter-docs for Expo Push API');
    return { deliveredAt: null };
  }
}
```

- [ ] **Step 8.3: Typecheck all adapters**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: exits 0.

- [ ] **Step 8.4: Commit**

```bash
git add packages/adapters/src/outbound/capabilities/ packages/adapters/src/outbound/notifications/
git commit -m "feat(adapters): capability + notification adapter stubs"
```

---

## Task 9: NestJS BFF Controllers

**Files:**
- Create: `packages/adapters/src/inbound/http/PositionController.ts`
- Create: `packages/adapters/src/inbound/http/PreviewController.ts`
- Create: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Create: `packages/adapters/src/inbound/http/AppModule.ts`

- [ ] **Step 9.1: Create PositionController**

`packages/adapters/src/inbound/http/PositionController.ts`:
```typescript
import { Controller, Get, Param } from '@nestjs/common';
import type { ListSupportedPositions } from '@clmm/application';

@Controller('positions')
export class PositionController {
  // Dependencies injected via NestJS DI — wired in AppModule
  constructor(
    // TODO: inject use case facades in Epic 5 composition
  ) {}

  @Get(':walletId')
  async listPositions(@Param('walletId') walletId: string) {
    // TODO: invoke ListSupportedPositions use case
    return { positions: [] };
  }
}
```

- [ ] **Step 9.2: Create AppModule**

`packages/adapters/src/inbound/http/AppModule.ts`:
```typescript
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { PositionController } from './PositionController.js';

@Module({
  controllers: [PositionController],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 9.3: Update BFF main**

`packages/adapters/src/inbound/http/main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './AppModule.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.log(`BFF listening on port ${port}`);
}

void bootstrap();
```

- [ ] **Step 9.4: Create job handlers**

`packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`:
```typescript
/**
 * BreachScanJobHandler
 * pg-boss job handler — scans supported positions for breaches
 * Runs on a schedule (e.g., every 60 seconds) via WorkerModule
 */
export class BreachScanJobHandler {
  static readonly JOB_NAME = 'breach-scan';

  async handle(_data: { walletId: string }): Promise<void> {
    // TODO: inject and invoke ScanPositionsForBreaches use case in Epic 5
    console.log('BreachScanJobHandler: stub');
  }
}
```

`packages/adapters/src/inbound/jobs/WorkerModule.ts`:
```typescript
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { BreachScanJobHandler } from './BreachScanJobHandler.js';

@Module({
  providers: [BreachScanJobHandler],
})
export class WorkerModule {}
```

- [ ] **Step 9.5: Typecheck**

```bash
pnpm --filter @clmm/adapters typecheck
```

Expected: exits 0.

- [ ] **Step 9.6: Commit**

```bash
git add packages/adapters/src/inbound/
git commit -m "feat(adapters): NestJS BFF controllers + job handler stubs"
```

---

## Task 10: Final Adapters Typecheck + Boundary Check

- [ ] **Step 10.1: Run full test suite**

```bash
pnpm test
```

Expected: all existing tests pass (domain + application + config/banned-concepts).

- [ ] **Step 10.2: Run boundaries**

```bash
pnpm boundaries
```

Expected: exits 0.

- [ ] **Step 10.3: Commit**

```bash
git add -A
git commit -m "feat(adapters): complete Epic 4 adapter layer

- Drizzle schema for triggers, previews, executions, history (off-chain only)
- OperationalStorageAdapter + OffChainHistoryStorageAdapter
- TelemetryAdapter (observability)
- Port contract tests in packages/testing/src/contracts
- All Solana adapter stubs with clear solana-adapter-docs TODOs
- NestJS BFF + worker skeletons with correct boundary wiring"
```

---

## Epic 4 Done-When

- [ ] `pnpm boundaries` exits 0 — no adapter types cross into domain/application
- [ ] Drizzle schema covers triggers, previews, executions, sessions, history
- [ ] History schema has NO receipt, attestation, proof, or claim fields
- [ ] `OrcaPositionReadAdapter` contract: adapter output never contains Orca SDK types
- [ ] `JupiterQuoteAdapter` contract: adapter preserves `fromAsset`/`toAsset` from domain `SwapInstruction` unchanged
- [ ] `WalletSigningPort` contract: signed result never stored by backend
- [ ] Capability adapters correctly distinguish native/PWA/mobile-web degraded states
- [ ] All Solana adapter stubs are clearly marked for `solana-adapter-docs` completion
- [ ] `pnpm test` passes (stub tests + domain + application)
