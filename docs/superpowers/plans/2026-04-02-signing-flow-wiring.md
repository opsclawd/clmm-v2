# Signing Flow Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the complete client-to-server signing flow so that the `/signing/:attemptId` page prompts the user's browser wallet and submits the signed transaction via a prepare → sign → submit sequence.

**Architecture:** Three-endpoint split (approve → prepare → submit). The new `POST /executions/:attemptId/prepare` endpoint reconstructs the execution plan from the stored preview, calls `ExecutionPreparationPort`, and returns an unsigned payload. The client decodes, signs via Phantom, and submits with payload versioning. A `prepared_payloads` table stores the freshest payload per attempt.

**Tech Stack:** NestJS, Drizzle ORM (PostgreSQL), Vitest, React Native (Expo Router), TanStack Query, Zustand, Phantom browser wallet

**Spec:** `docs/superpowers/specs/2026-04-02-signing-flow-wiring-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/adapters/src/outbound/storage/schema/prepared-payloads.ts` | Drizzle schema for `prepared_payloads` table |
| `packages/adapters/drizzle/0003_signing_flow_wiring.sql` | Migration: `prepared_payloads` table + `preview_id` column on `execution_attempts` |

### Modified Files (Server)
| File | Change |
|------|--------|
| `packages/application/src/ports/index.ts` | Add `previewId` to `StoredExecutionAttempt`; add `savePreparedPayload` + `getPreparedPayload` to `ExecutionRepository` |
| `packages/application/src/dto/index.ts` | Add `PreparedPayloadDto` type |
| `packages/adapters/src/outbound/storage/schema/executions.ts` | Add `previewId` column to `executionAttempts` |
| `packages/adapters/src/outbound/storage/schema/index.ts` | Re-export prepared-payloads schema |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | Implement `savePreparedPayload`, `getPreparedPayload`; persist/load `previewId` on attempts |
| `packages/adapters/src/inbound/http/tokens.ts` | Add `EXECUTION_PREPARATION_PORT` token |
| `packages/adapters/src/inbound/http/ExecutionController.ts` | Add `prepare` endpoint; enhance `submit` with payload version validation |
| `packages/adapters/src/composition/AdaptersModule.ts` | Wire `EXECUTION_PREPARATION_PORT` to `SolanaExecutionPreparationAdapter` |
| `packages/adapters/src/inbound/jobs/tokens.ts` | Add `EXECUTION_PREPARATION_PORT` token (job-side mirror) |

### Modified Files (Client)
| File | Change |
|------|--------|
| `apps/app/src/platform/browserWallet.ts` | Add `signTransaction` to `BrowserWalletProvider`; add `signTransactionWithBrowserWallet` function |
| `apps/app/src/api/executions.ts` | Add `prepareExecution` function; update `submitExecution` to accept `payloadVersion` |
| `apps/app/app/signing/[attemptId].tsx` | Rewrite: signing orchestration, conditional polling, state management |
| `packages/ui/src/screens/SigningStatusScreen.tsx` | Add sign button, progress states, error display |

### Modified Files (Testing)
| File | Change |
|------|--------|
| `packages/testing/src/fakes/FakeExecutionRepository.ts` | Add `previewId` handling, `savePreparedPayload`, `getPreparedPayload` |
| `packages/adapters/src/inbound/http/ExecutionController.test.ts` | Add tests for prepare endpoint, submit version validation |

---

## Task 1: Extend `StoredExecutionAttempt` with `previewId`

**Files:**
- Modify: `packages/application/src/ports/index.ts:146-150`
- Test: `packages/adapters/src/inbound/http/ExecutionController.test.ts`

- [ ] **Step 1: Add `previewId` to `StoredExecutionAttempt` type**

In `packages/application/src/ports/index.ts`, update the type:

```typescript
export type StoredExecutionAttempt = ExecutionAttempt & {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  previewId?: string;
};
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: All existing tests PASS (previewId is optional, so no breakage)

- [ ] **Step 3: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat: add previewId to StoredExecutionAttempt type"
```

---

## Task 2: Add `PreparedPayloadDto` to DTOs

**Files:**
- Modify: `packages/application/src/dto/index.ts`

- [ ] **Step 1: Add the DTO type**

Append to `packages/application/src/dto/index.ts` after the `ExecutionAttemptDto` type (after line 59):

```typescript
export type PreparedPayloadDto = {
  unsignedPayloadBase64: string;
  payloadVersion: string;
  expiresAt: number;
  requiresSignature: true;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/application/src/dto/index.ts
git commit -m "feat: add PreparedPayloadDto type"
```

---

## Task 3: Add prepared payload repository methods to `ExecutionRepository` port

**Files:**
- Modify: `packages/application/src/ports/index.ts:152-158`

- [ ] **Step 1: Add the methods to the interface**

In `packages/application/src/ports/index.ts`, extend `ExecutionRepository`:

```typescript
export interface ExecutionRepository {
  savePreview(positionId: PositionId, preview: ExecutionPreview, breachDirection: BreachDirection): Promise<{ previewId: string }>;
  getPreview(previewId: string): Promise<{ preview: ExecutionPreview; positionId: PositionId; breachDirection: BreachDirection } | null>;
  saveAttempt(attempt: StoredExecutionAttempt): Promise<void>;
  getAttempt(attemptId: string): Promise<StoredExecutionAttempt | null>;
  updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void>;
  savePreparedPayload(params: {
    payloadId: string;
    attemptId: string;
    unsignedPayload: Uint8Array;
    payloadVersion: string;
    expiresAt: ClockTimestamp;
    createdAt: ClockTimestamp;
  }): Promise<void>;
  getPreparedPayload(attemptId: string): Promise<{
    payloadVersion: string;
    unsignedPayload: Uint8Array;
    expiresAt: ClockTimestamp;
  } | null>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/application/src/ports/index.ts
git commit -m "feat: add savePreparedPayload and getPreparedPayload to ExecutionRepository"
```

---

## Task 4: Update `FakeExecutionRepository` with new methods

**Files:**
- Modify: `packages/testing/src/fakes/FakeExecutionRepository.ts`

- [ ] **Step 1: Write a failing test to verify the fake compiles against the interface**

This is verified by TypeScript compilation. Run:
`npx tsc --noEmit -p packages/testing/tsconfig.json`
Expected: FAIL — `FakeExecutionRepository` is missing `savePreparedPayload` and `getPreparedPayload`

- [ ] **Step 2: Implement the fake methods**

Update `packages/testing/src/fakes/FakeExecutionRepository.ts`:

```typescript
import type { ExecutionRepository } from '@clmm/application';
import type {
  BreachDirection,
  ClockTimestamp,
  ExecutionPreview,
  ExecutionLifecycleState,
  PositionId,
} from '@clmm/domain';
import type { StoredExecutionAttempt } from '@clmm/application';

type StoredPreview = {
  preview: ExecutionPreview;
  positionId: PositionId;
  breachDirection: BreachDirection;
};

type StoredPreparedPayload = {
  payloadVersion: string;
  unsignedPayload: Uint8Array;
  expiresAt: ClockTimestamp;
};

export class FakeExecutionRepository implements ExecutionRepository {
  readonly previews = new Map<string, StoredPreview>();
  readonly attempts = new Map<string, StoredExecutionAttempt>();
  readonly preparedPayloads = new Map<string, StoredPreparedPayload>();
  private _previewCounter = 0;

  async savePreview(positionId: PositionId, preview: ExecutionPreview, breachDirection: BreachDirection): Promise<{ previewId: string }> {
    const previewId = `preview-${++this._previewCounter}`;
    this.previews.set(previewId, { preview, positionId, breachDirection });
    return { previewId };
  }

  async getPreview(previewId: string): Promise<StoredPreview | null> {
    return this.previews.get(previewId) ?? null;
  }

  async saveAttempt(attempt: StoredExecutionAttempt): Promise<void> {
    this.attempts.set(attempt.attemptId, attempt);
  }

  async getAttempt(attemptId: string): Promise<StoredExecutionAttempt | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async updateAttemptState(attemptId: string, state: ExecutionLifecycleState): Promise<void> {
    const existing = this.attempts.get(attemptId);
    if (existing) {
      this.attempts.set(attemptId, { ...existing, lifecycleState: state });
    }
  }

  async savePreparedPayload(params: {
    payloadId: string;
    attemptId: string;
    unsignedPayload: Uint8Array;
    payloadVersion: string;
    expiresAt: ClockTimestamp;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    this.preparedPayloads.set(params.attemptId, {
      payloadVersion: params.payloadVersion,
      unsignedPayload: params.unsignedPayload,
      expiresAt: params.expiresAt,
    });
  }

  async getPreparedPayload(attemptId: string): Promise<StoredPreparedPayload | null> {
    return this.preparedPayloads.get(attemptId) ?? null;
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation passes**

Run: `npx tsc --noEmit -p packages/testing/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Run existing tests**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/testing/src/fakes/FakeExecutionRepository.ts
git commit -m "feat: add prepared payload methods to FakeExecutionRepository"
```

---

## Task 5: Add Drizzle schema for `prepared_payloads` table and `preview_id` column

**Files:**
- Create: `packages/adapters/src/outbound/storage/schema/prepared-payloads.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/executions.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/index.ts`

- [ ] **Step 1: Create `prepared-payloads.ts` schema file**

Create `packages/adapters/src/outbound/storage/schema/prepared-payloads.ts`:

```typescript
import { pgTable, text, bigint, customType } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const preparedPayloads = pgTable('prepared_payloads', {
  payloadId: text('payload_id').primaryKey(),
  attemptId: text('attempt_id').notNull().unique(),
  unsignedPayload: bytea('unsigned_payload').notNull(),
  payloadVersion: text('payload_version').notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 2: Add `previewId` column to `executionAttempts` schema**

In `packages/adapters/src/outbound/storage/schema/executions.ts`, add the `previewId` column:

```typescript
import { sql } from 'drizzle-orm';
import { pgTable, text, bigint, jsonb, check } from 'drizzle-orm/pg-core';

export const executionAttempts = pgTable('execution_attempts', {
  attemptId: text('attempt_id').primaryKey(),
  positionId: text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(),
  lifecycleStateKind: text('lifecycle_state_kind').notNull(),
  completedStepsJson: jsonb('completed_steps_json').notNull().default([]),
  transactionRefsJson: jsonb('transaction_refs_json').notNull().default([]),
  previewId: text('preview_id'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
}, (table) => [
  check(
    'execution_attempts_direction_kind_check',
    sql`${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')`,
  ),
]);

export const executionSessions = pgTable('execution_sessions', {
  sessionId: text('session_id').primaryKey(),
  attemptId: text('attempt_id').notNull(),
  walletId: text('wallet_id').notNull(),
  positionId: text('position_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
```

- [ ] **Step 3: Export `prepared-payloads` from schema index**

In `packages/adapters/src/outbound/storage/schema/index.ts`, add:

```typescript
export * from './prepared-payloads.js';
```

- [ ] **Step 4: Generate the Drizzle migration**

Run: `npx drizzle-kit generate`

This will create a new migration SQL file in `packages/adapters/drizzle/`. Verify the generated SQL creates:
1. `prepared_payloads` table with all columns
2. `ALTER TABLE execution_attempts ADD COLUMN preview_id text`

If Drizzle generates a migration with a random name, rename it to `0003_signing_flow_wiring.sql` for clarity.

- [ ] **Step 5: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p packages/adapters/tsconfig.json`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/prepared-payloads.ts
git add packages/adapters/src/outbound/storage/schema/executions.ts
git add packages/adapters/src/outbound/storage/schema/index.ts
git add packages/adapters/drizzle/
git commit -m "feat: add prepared_payloads table and preview_id column to execution_attempts"
```

---

## Task 6: Implement storage adapter for prepared payloads and `previewId`

**Files:**
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`

- [ ] **Step 1: Write a failing test for `savePreparedPayload` and `getPreparedPayload`**

This task adds real DB methods. The compile-time contract is already enforced by the interface. Since the `OperationalStorageAdapter` tests run against a real database and the controller tests use fakes, we verify correctness via controller-level integration tests in Task 9. For now, ensure compilation passes.

Add the import for `preparedPayloads` to the import line in `OperationalStorageAdapter.ts` (line 3):

```typescript
import { breachEpisodes, exitTriggers, executionAttempts, executionSessions, executionPreviews, preparedPayloads } from './schema/index.js';
```

- [ ] **Step 2: Implement `savePreparedPayload`**

Add after `updateAttemptState` method (after line 218):

```typescript
  async savePreparedPayload(params: {
    payloadId: string;
    attemptId: string;
    unsignedPayload: Uint8Array;
    payloadVersion: string;
    expiresAt: ClockTimestamp;
    createdAt: ClockTimestamp;
  }): Promise<void> {
    await this.db.insert(preparedPayloads).values({
      payloadId: params.payloadId,
      attemptId: params.attemptId,
      unsignedPayload: Buffer.from(params.unsignedPayload),
      payloadVersion: params.payloadVersion,
      expiresAt: params.expiresAt,
      createdAt: params.createdAt,
    }).onConflictDoUpdate({
      target: preparedPayloads.attemptId,
      set: {
        payloadId: params.payloadId,
        unsignedPayload: Buffer.from(params.unsignedPayload),
        payloadVersion: params.payloadVersion,
        expiresAt: params.expiresAt,
        createdAt: params.createdAt,
      },
    });
  }
```

- [ ] **Step 3: Implement `getPreparedPayload`**

Add after `savePreparedPayload`:

```typescript
  async getPreparedPayload(attemptId: string): Promise<{
    payloadVersion: string;
    unsignedPayload: Uint8Array;
    expiresAt: ClockTimestamp;
  } | null> {
    const rows = await this.db
      .select()
      .from(preparedPayloads)
      .where(eq(preparedPayloads.attemptId, attemptId));
    const [row] = rows;
    if (!row) return null;
    return {
      payloadVersion: row.payloadVersion,
      unsignedPayload: new Uint8Array(row.unsignedPayload),
      expiresAt: makeClockTimestamp(row.expiresAt),
    };
  }
```

- [ ] **Step 4: Update `saveAttempt` to persist `previewId`**

In the `saveAttempt` method, update the `values` and `set` objects to include `previewId`:

In the `.values({...})` call (around line 174), add:
```typescript
      previewId: attempt.previewId ?? null,
```

In the `.onConflictDoUpdate({ set: {...} })` call (around line 186), add:
```typescript
        previewId: attempt.previewId ?? null,
```

- [ ] **Step 5: Update `getAttempt` to load `previewId`**

In the return object of `getAttempt` (around line 202), add:

```typescript
      ...(row.previewId ? { previewId: row.previewId } : {}),
```

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p packages/adapters/tsconfig.json`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts
git commit -m "feat: implement prepared payload storage and previewId persistence"
```

---

## Task 7: Add `EXECUTION_PREPARATION_PORT` DI token and wire adapter

**Files:**
- Modify: `packages/adapters/src/inbound/http/tokens.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`

- [ ] **Step 1: Add the token to HTTP tokens**

In `packages/adapters/src/inbound/http/tokens.ts`, add:

```typescript
export const EXECUTION_PREPARATION_PORT = 'EXECUTION_PREPARATION_PORT';
```

- [ ] **Step 2: Add the token to job tokens**

In `packages/adapters/src/inbound/jobs/tokens.ts`, add:

```typescript
export const EXECUTION_PREPARATION_PORT = 'EXECUTION_PREPARATION_PORT';
```

- [ ] **Step 3: Wire the adapter in `AdaptersModule`**

In `packages/adapters/src/composition/AdaptersModule.ts`:

Add import for the adapter (after line 10):
```typescript
import { SolanaExecutionPreparationAdapter } from '../outbound/swap-execution/SolanaExecutionPreparationAdapter.js';
```

Add import of the new token (update the import from `'../inbound/jobs/tokens.js'` around line 30 to include `EXECUTION_PREPARATION_PORT`).

Instantiate the adapter (after line 54, near `solanaSubmission`):
```typescript
const solanaPreparation = new SolanaExecutionPreparationAdapter(rpcUrl);
```

Note: Check the `SolanaExecutionPreparationAdapter` constructor signature — it may require additional parameters beyond `rpcUrl`. Pass them as needed.

Add the provider to `sharedProviders` array (after the `EXECUTION_SUBMISSION_PORT` entry):
```typescript
  { provide: EXECUTION_PREPARATION_PORT, useValue: solanaPreparation },
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p packages/adapters/tsconfig.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/http/tokens.ts
git add packages/adapters/src/inbound/jobs/tokens.ts
git add packages/adapters/src/composition/AdaptersModule.ts
git commit -m "feat: wire EXECUTION_PREPARATION_PORT in DI container"
```

---

## Task 8: Store `previewId` on attempt during approve

**Files:**
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts:134-176`
- Test: `packages/adapters/src/inbound/http/ExecutionController.test.ts`

- [ ] **Step 1: Write a failing test**

Add to `ExecutionController.test.ts`:

```typescript
  it('stores previewId on the attempt during approve', async () => {
    const { previewId } = await executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        plan: { steps: [], postExitPosture: { kind: 'exit-to-usdc' }, swapInstruction: null as never },
        freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
        estimatedAt: 1_000_000 as ClockTimestamp,
      },
      LOWER_BOUND_BREACH,
    );

    const result = await controller.approveExecution({
      previewId,
      triggerId: 'trigger-1',
    });

    const attempt = await executionRepo.getAttempt(result.attemptId);
    expect(attempt?.previewId).toBe(previewId);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts -t "stores previewId"`
Expected: FAIL — `attempt.previewId` is `undefined`

- [ ] **Step 3: Update approve endpoint to set `previewId`**

In `ExecutionController.ts`, update the `approveExecution` method. Change the `attempt` object (around line 150-157) to include `previewId`:

```typescript
    const attempt: StoredExecutionAttempt = {
      attemptId,
      positionId,
      breachDirection,
      previewId: body.previewId,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts -t "stores previewId"`
Expected: PASS

- [ ] **Step 5: Run all existing tests**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/src/inbound/http/ExecutionController.ts
git add packages/adapters/src/inbound/http/ExecutionController.test.ts
git commit -m "feat: store previewId on attempt during approve"
```

---

## Task 9: Add `POST /executions/:attemptId/prepare` endpoint

**Files:**
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts`
- Test: `packages/adapters/src/inbound/http/ExecutionController.test.ts`

This is the core server-side task. The endpoint:
1. Loads the attempt (404 if missing)
2. Validates state is `awaiting-signature` (409 if not)
3. Loads the linked preview via `previewId`
4. Applies `applyDirectionalExitPolicy` + `buildExecutionPlan` for the plan
5. Calls `ExecutionPreparationPort.prepareExecution()`
6. Generates `payloadVersion`, calculates `expiresAt`
7. Stores in `prepared_payloads` via `savePreparedPayload`
8. Returns `PreparedPayloadDto`

- [ ] **Step 1: Write failing test — happy path**

In `ExecutionController.test.ts`, add a `RecordingPreparationPort` fake at the top (alongside `RecordingSubmissionPort`):

```typescript
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId } from '@clmm/domain';

class RecordingPreparationPort implements ExecutionPreparationPort {
  prepareCalls: Array<{ plan: ExecutionPlan; walletId: WalletId; positionId: PositionId }> = [];
  serializedPayload = new Uint8Array([10, 20, 30]);
  preparedAt = makeClockTimestamp(1_000_000);

  async prepareExecution(params: {
    plan: ExecutionPlan;
    walletId: WalletId;
    positionId: PositionId;
  }): Promise<{ serializedPayload: Uint8Array; preparedAt: ClockTimestamp }> {
    this.prepareCalls.push(params);
    return {
      serializedPayload: this.serializedPayload,
      preparedAt: this.preparedAt,
    };
  }
}
```

Update the `beforeEach` to create a `RecordingPreparationPort` and pass it to the controller. The controller constructor needs a new parameter — this will fail to compile until we update the controller. Add a variable:

```typescript
  let preparationPort: RecordingPreparationPort;
```

In `beforeEach`, add:
```typescript
    preparationPort = new RecordingPreparationPort();
```

And update the controller constructor call to include the preparation port (this will be wired in step 3).

Add the test:

```typescript
  it('prepare returns unsigned payload with version and expiry', async () => {
    const { previewId } = await executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        plan: { steps: [], postExitPosture: { kind: 'exit-to-usdc' }, swapInstruction: null as never },
        freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
        estimatedAt: 1_000_000 as ClockTimestamp,
      },
      LOWER_BOUND_BREACH,
    );

    const approveResult = await controller.approveExecution({
      previewId,
      triggerId: 'trigger-1',
    });

    const result = await controller.prepareExecution(approveResult.attemptId, {
      walletId: 'wallet-1',
    });

    expect(result.requiresSignature).toBe(true);
    expect(result.payloadVersion).toBeDefined();
    expect(result.expiresAt).toBeGreaterThan(0);
    expect(result.unsignedPayloadBase64).toBeDefined();
    // Verify preparation port was called
    expect(preparationPort.prepareCalls).toHaveLength(1);
    expect(preparationPort.prepareCalls[0]?.walletId).toBe('wallet-1');
    expect(preparationPort.prepareCalls[0]?.positionId).toBe(FIXTURE_POSITION_ID);
  });
```

- [ ] **Step 2: Write failing test — attempt not found (404)**

```typescript
  it('prepare rejects with 404 when attempt does not exist', async () => {
    await expect(
      controller.prepareExecution('nonexistent', { walletId: 'wallet-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
```

Add `NotFoundException` to the imports from `@nestjs/common`.

- [ ] **Step 3: Write failing test — wrong state (409)**

```typescript
  it('prepare rejects with 409 when attempt is not in awaiting-signature state', async () => {
    await saveAttempt({
      attemptId: 'attempt-submitted',
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'submitted' },
      completedSteps: [],
      transactionReferences: [],
    });

    await expect(
      controller.prepareExecution('attempt-submitted', { walletId: 'wallet-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
```

- [ ] **Step 4: Run tests to confirm they fail**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: FAIL — `controller.prepareExecution` is not a function

- [ ] **Step 5: Implement the prepare endpoint**

In `ExecutionController.ts`:

Add imports at the top:
```typescript
import {
  GoneException,
} from '@nestjs/common';
import type {
  ExecutionPreparationPort,
  PreparedPayloadDto,
} from '@clmm/application';
import { buildExecutionPlan } from '@clmm/domain';
import { EXECUTION_PREPARATION_PORT } from './tokens.js';
```

Note: `buildExecutionPlan` is from `packages/domain/src/execution/ExecutionPlanFactory.ts`. Verify the exact import path and function name. It may be re-exported from `@clmm/domain`.

Update the constructor to inject `ExecutionPreparationPort`:

```typescript
  constructor(
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
    @Inject(EXECUTION_SUBMISSION_PORT)
    private readonly submissionPort: ExecutionSubmissionPort,
    @Inject(EXECUTION_PREPARATION_PORT)
    private readonly preparationPort: ExecutionPreparationPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
    @Inject(ID_GENERATOR_PORT)
    private readonly ids: IdGeneratorPort,
  ) {}
```

Add the endpoint method (before the `submitExecution` method):

```typescript
  @Post(':attemptId/prepare')
  async prepareExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: { walletId: string },
  ): Promise<PreparedPayloadDto> {
    const attempt = await this.executionRepo.getAttempt(attemptId);
    if (!attempt) throw new NotFoundException(`Attempt not found: ${attemptId}`);
    if (attempt.lifecycleState.kind !== 'awaiting-signature') {
      throw new ConflictException(
        `Attempt ${attemptId} cannot be prepared from state ${attempt.lifecycleState.kind}`,
      );
    }

    if (!attempt.previewId) {
      throw new ConflictException(`Attempt ${attemptId} has no linked preview`);
    }

    const previewResult = await this.executionRepo.getPreview(attempt.previewId);
    if (!previewResult) {
      throw new NotFoundException(`Preview not found: ${attempt.previewId}`);
    }

    const plan = buildExecutionPlan(attempt.breachDirection);

    const { serializedPayload, preparedAt } = await this.preparationPort.prepareExecution({
      plan,
      walletId: body.walletId as WalletId,
      positionId: attempt.positionId,
    });

    const payloadVersion = this.ids.generateId();
    const expiresAt = (preparedAt + 90_000) as ClockTimestamp;

    await this.executionRepo.savePreparedPayload({
      payloadId: this.ids.generateId(),
      attemptId,
      unsignedPayload: serializedPayload,
      payloadVersion,
      expiresAt,
      createdAt: this.clock.now(),
    });

    const unsignedPayloadBase64 = Buffer.from(serializedPayload).toString('base64');

    return {
      unsignedPayloadBase64,
      payloadVersion,
      expiresAt,
      requiresSignature: true,
    };
  }
```

Also add `WalletId` to the `@clmm/domain` imports at the top of the file.

Update the constructor call in the test to include the preparation port. The test `beforeEach` controller instantiation becomes:

```typescript
    controller = new ExecutionController(
      executionRepo as unknown as ExecutionRepository,
      historyRepo as unknown as ExecutionHistoryRepository,
      submissionPort,
      preparationPort,
      new FakeClockPort(),
      new FakeIdGeneratorPort('exec-http'),
    );
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: All tests PASS (including the 3 new prepare tests)

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/inbound/http/ExecutionController.ts
git add packages/adapters/src/inbound/http/ExecutionController.test.ts
git commit -m "feat: add POST /executions/:attemptId/prepare endpoint"
```

---

## Task 10: Enhance submit endpoint with payload version validation

**Files:**
- Modify: `packages/adapters/src/inbound/http/ExecutionController.ts:212-279`
- Test: `packages/adapters/src/inbound/http/ExecutionController.test.ts`

- [ ] **Step 1: Write failing test — version mismatch (409)**

```typescript
  it('submit rejects with 409 when payloadVersion does not match prepared version', async () => {
    const { previewId } = await executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        plan: { steps: [], postExitPosture: { kind: 'exit-to-usdc' }, swapInstruction: null as never },
        freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
        estimatedAt: 1_000_000 as ClockTimestamp,
      },
      LOWER_BOUND_BREACH,
    );

    const approveResult = await controller.approveExecution({ previewId, triggerId: 'trigger-1' });
    await controller.prepareExecution(approveResult.attemptId, { walletId: 'wallet-1' });

    const signedPayload = Buffer.from([1, 2, 3]).toString('base64');
    await expect(
      controller.submitExecution(approveResult.attemptId, {
        signedPayload,
        payloadVersion: 'wrong-version',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
```

- [ ] **Step 2: Write failing test — expired payload (410)**

```typescript
  it('submit rejects with 410 when prepared payload has expired', async () => {
    const { previewId } = await executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        plan: { steps: [], postExitPosture: { kind: 'exit-to-usdc' }, swapInstruction: null as never },
        freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
        estimatedAt: 1_000_000 as ClockTimestamp,
      },
      LOWER_BOUND_BREACH,
    );

    const approveResult = await controller.approveExecution({ previewId, triggerId: 'trigger-1' });
    const prepareResult = await controller.prepareExecution(approveResult.attemptId, { walletId: 'wallet-1' });

    // Manually expire the payload by overwriting with an expired timestamp
    await executionRepo.savePreparedPayload({
      payloadId: 'expired-payload',
      attemptId: approveResult.attemptId,
      unsignedPayload: new Uint8Array([1]),
      payloadVersion: prepareResult.payloadVersion,
      expiresAt: 0 as ClockTimestamp, // already expired
      createdAt: 0 as ClockTimestamp,
    });

    const signedPayload = Buffer.from([1, 2, 3]).toString('base64');
    await expect(
      controller.submitExecution(approveResult.attemptId, {
        signedPayload,
        payloadVersion: prepareResult.payloadVersion,
      }),
    ).rejects.toBeInstanceOf(GoneException);
  });
```

Add `GoneException` to the imports from `@nestjs/common` in the test file.

- [ ] **Step 3: Write failing test — submit succeeds with correct version**

```typescript
  it('submit succeeds when payloadVersion matches and payload is not expired', async () => {
    const { previewId } = await executionRepo.savePreview(
      FIXTURE_POSITION_ID,
      {
        plan: { steps: [], postExitPosture: { kind: 'exit-to-usdc' }, swapInstruction: null as never },
        freshness: { kind: 'fresh', expiresAt: Date.now() + 60_000 },
        estimatedAt: 1_000_000 as ClockTimestamp,
      },
      LOWER_BOUND_BREACH,
    );

    const approveResult = await controller.approveExecution({ previewId, triggerId: 'trigger-1' });
    const prepareResult = await controller.prepareExecution(approveResult.attemptId, { walletId: 'wallet-1' });

    const signedPayload = Buffer.from([1, 2, 3]).toString('base64');
    const result = await controller.submitExecution(approveResult.attemptId, {
      signedPayload,
      payloadVersion: prepareResult.payloadVersion,
    });

    expect(result.result).toBe('confirmed');
  });
```

- [ ] **Step 4: Run tests to confirm they fail**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: FAIL — submit doesn't check payloadVersion yet

- [ ] **Step 5: Implement version validation in submit**

Update the `submitExecution` method's body type:

```typescript
  @Post(':attemptId/submit')
  async submitExecution(
    @Param('attemptId') attemptId: string,
    @Body() body: {
      signedPayload: string;
      payloadVersion?: string;
      breachDirection?: 'lower-bound-breach' | 'upper-bound-breach';
    },
  ) {
```

After the state check (after line 223), add version validation:

```typescript
    if (body.payloadVersion) {
      const prepared = await this.executionRepo.getPreparedPayload(attemptId);
      if (!prepared) {
        throw new ConflictException(`No prepared payload found for attempt ${attemptId}`);
      }
      if (prepared.payloadVersion !== body.payloadVersion) {
        throw new ConflictException(
          `Payload version mismatch: expected ${prepared.payloadVersion}, got ${body.payloadVersion}`,
        );
      }
      if (prepared.expiresAt <= this.clock.now()) {
        throw new GoneException(`Prepared payload for attempt ${attemptId} has expired`);
      }
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run packages/adapters/src/inbound/http/ExecutionController.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/inbound/http/ExecutionController.ts
git add packages/adapters/src/inbound/http/ExecutionController.test.ts
git commit -m "feat: add payload version validation to submit endpoint"
```

---

## Task 11: Extend `BrowserWalletProvider` with `signTransaction`

**Files:**
- Modify: `apps/app/src/platform/browserWallet.ts`

- [ ] **Step 1: Add `signTransaction` to the type and add helper function**

In `apps/app/src/platform/browserWallet.ts`:

Update `BrowserWalletProvider` type (lines 5-10):

```typescript
export type BrowserWalletProvider = {
  isPhantom?: boolean;
  publicKey?: BrowserWalletPublicKey | null;
  connect(): Promise<{ publicKey?: BrowserWalletPublicKey | null } | null | undefined>;
  disconnect?(): Promise<void>;
  signTransaction?(transaction: Uint8Array): Promise<Uint8Array>;
};
```

Add the helper function at the end of the file:

```typescript
export async function signTransactionWithBrowserWallet(
  browserWindow: BrowserWalletWindow | undefined,
  serializedTransaction: Uint8Array,
): Promise<Uint8Array> {
  const provider = getInjectedBrowserProvider(browserWindow);
  if (!provider) throw new Error('No supported browser wallet detected');
  if (!provider.signTransaction) throw new Error('Wallet does not support transaction signing');
  return provider.signTransaction(serializedTransaction);
}
```

Note per the design spec: Phantom's actual `signTransaction()` may accept a `Transaction` object rather than raw `Uint8Array`. During implementation, check `@solana-adapter-docs` skill for the exact Phantom injected provider API. The adapter may need to deserialize bytes into a `Transaction` before passing to Phantom. This does not affect the function signature — the implementation detail is encapsulated within this helper.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/platform/browserWallet.ts
git commit -m "feat: add signTransaction to BrowserWalletProvider type"
```

---

## Task 12: Add `prepareExecution` client API and update `submitExecution`

**Files:**
- Modify: `apps/app/src/api/executions.ts`

- [ ] **Step 1: Add `PrepareResponse` type and `prepareExecution` function**

In `apps/app/src/api/executions.ts`, add after the imports:

```typescript
export type PrepareResponse = {
  unsignedPayloadBase64: string;
  payloadVersion: string;
  expiresAt: number;
  requiresSignature: true;
};

export async function prepareExecution(
  attemptId: string,
  walletId: string,
): Promise<PrepareResponse> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletId }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Prepare failed: HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }
  return response.json() as Promise<PrepareResponse>;
}
```

- [ ] **Step 2: Update `submitExecution` to accept `payloadVersion`**

```typescript
export async function submitExecution(
  attemptId: string,
  signedPayload: string,
  payloadVersion?: string,
): Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }> {
  const response = await fetch(`${getBffBaseUrl()}/executions/${attemptId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedPayload, ...(payloadVersion ? { payloadVersion } : {}) }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Submit failed: HTTP ${response.status}${text ? `: ${text}` : ''}`);
  }
  return response.json() as Promise<{ result: 'confirmed' | 'failed' | 'partial' | 'pending' }>;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/api/executions.ts
git commit -m "feat: add prepareExecution client API and payloadVersion to submitExecution"
```

---

## Task 13: Update `SigningStatusScreen` with signing UI

**Files:**
- Modify: `packages/ui/src/screens/SigningStatusScreen.tsx`

- [ ] **Step 1: Update props and add signing state UI**

Replace the full contents of `packages/ui/src/screens/SigningStatusScreen.tsx`:

```typescript
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import type { ExecutionLifecycleState, BreachDirection } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildExecutionStateViewModel } from '../view-models/ExecutionStateViewModel.js';
import { ExecutionStateCard } from '../components/ExecutionStateCard.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';

type SigningState = 'idle' | 'preparing' | 'signing' | 'submitting' | 'error';

type Props = {
  lifecycleState?: ExecutionLifecycleState;
  breachDirection?: BreachDirection;
  retryEligible?: boolean;
  signingState: SigningState;
  signingError?: string;
  onSignAndExecute: () => void;
  walletConnected: boolean;
};

const signingProgressLabels: Record<Exclude<SigningState, 'idle' | 'error'>, string> = {
  preparing: 'Preparing transaction...',
  signing: 'Waiting for wallet approval...',
  submitting: 'Submitting transaction...',
};

export function SigningStatusScreen({
  lifecycleState,
  breachDirection,
  retryEligible,
  signingState,
  signingError,
  onSignAndExecute,
  walletConnected,
}: Props) {
  if (!lifecycleState) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Text style={{ color: colors.text, fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold }}>
          Signing Status
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading signing status...
        </Text>
      </View>
    );
  }

  const viewModel = buildExecutionStateViewModel(lifecycleState, retryEligible ?? false);
  const showSignButton =
    signingState === 'idle' &&
    lifecycleState.kind === 'awaiting-signature' &&
    walletConnected;
  const showProgress =
    signingState === 'preparing' ||
    signingState === 'signing' ||
    signingState === 'submitting';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
        marginBottom: 16,
      }}>
        Signing Status
      </Text>

      {breachDirection ? (
        <View style={{ marginBottom: 16 }}>
          <DirectionalPolicyCard direction={breachDirection} />
        </View>
      ) : null}

      <ExecutionStateCard viewModel={viewModel} />

      {!walletConnected && lifecycleState.kind === 'awaiting-signature' ? (
        <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 8 }}>
          <Text style={{ color: colors.textSecondary }}>
            No wallet connected. Connect your wallet to sign the transaction.
          </Text>
        </View>
      ) : null}

      {showSignButton ? (
        <Pressable
          onPress={onSignAndExecute}
          style={{
            marginTop: 16,
            backgroundColor: colors.primary,
            paddingVertical: 14,
            paddingHorizontal: 24,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{
            color: colors.textOnPrimary,
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.bold,
          }}>
            Sign & Execute
          </Text>
        </Pressable>
      ) : null}

      {showProgress ? (
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary }}>
            {signingProgressLabels[signingState]}
          </Text>
        </View>
      ) : null}

      {signingState === 'error' ? (
        <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.errorBackground, borderRadius: 8 }}>
          <Text style={{ color: colors.error, marginBottom: 8 }}>
            {signingError ?? 'Signing failed'}
          </Text>
          <Pressable
            onPress={onSignAndExecute}
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 6,
              alignItems: 'center',
            }}
          >
            <Text style={{
              color: colors.textOnPrimary,
              fontWeight: typography.fontWeight.bold,
            }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
```

Note: `colors.primary`, `colors.textOnPrimary`, `colors.errorBackground`, `colors.error`, `colors.surfaceSecondary` — verify these exist in the design system. If some are missing (e.g., `errorBackground`, `textOnPrimary`, `surfaceSecondary`), use existing color tokens or add the missing ones to the design system. Check `packages/ui/src/design-system/index.ts` for available tokens.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p packages/ui/tsconfig.json`
Expected: PASS (fix any missing color tokens if needed)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/screens/SigningStatusScreen.tsx
git commit -m "feat: add signing state UI to SigningStatusScreen"
```

---

## Task 14: Rewrite signing route with signing orchestration

**Files:**
- Modify: `apps/app/app/signing/[attemptId].tsx`

- [ ] **Step 1: Rewrite the signing route**

Replace the full contents of `apps/app/app/signing/[attemptId].tsx`:

```typescript
import { useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand';
import { SigningStatusScreen } from '@clmm/ui';
import { fetchExecution, prepareExecution, submitExecution } from '../../src/api/executions.js';
import { signTransactionWithBrowserWallet } from '../../src/platform/browserWallet.js';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

type SigningState = 'idle' | 'preparing' | 'signing' | 'submitting' | 'error';

export default function SigningRoute() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (s) => s.walletAddress);

  const [signingState, setSigningState] = useState<SigningState>('idle');
  const [signingError, setSigningError] = useState<string | undefined>();

  const executionQuery = useQuery({
    queryKey: ['execution', attemptId],
    queryFn: () => fetchExecution(attemptId!),
    enabled: attemptId != null && attemptId.length > 0,
    refetchInterval: (query) => {
      const state = query.state.data?.lifecycleState?.kind;
      if (state === 'submitted') return 5_000;
      return false;
    },
  });

  const attempt = executionQuery.data;
  const currentState = attempt?.lifecycleState?.kind;

  useEffect(() => {
    if (
      currentState === 'confirmed' ||
      currentState === 'failed' ||
      currentState === 'partial'
    ) {
      router.replace(`/execution/${attemptId}`);
    }
  }, [currentState, attemptId, router]);

  async function handleSignAndExecute() {
    if (!attemptId || !walletAddress) return;

    try {
      setSigningState('preparing');
      setSigningError(undefined);

      const prepared = await prepareExecution(attemptId, walletAddress);

      setSigningState('signing');
      const unsignedBytes = Uint8Array.from(
        atob(prepared.unsignedPayloadBase64),
        (c) => c.charCodeAt(0),
      );
      const signedBytes = await signTransactionWithBrowserWallet(
        typeof window !== 'undefined' ? (window as never) : undefined,
        unsignedBytes,
      );
      const signedBase64 = btoa(String.fromCharCode(...signedBytes));

      setSigningState('submitting');
      await submitExecution(attemptId, signedBase64, prepared.payloadVersion);

      setSigningState('idle');
      await executionQuery.refetch();
    } catch (err) {
      setSigningState('error');
      setSigningError(err instanceof Error ? err.message : 'Signing failed');
    }
  }

  return (
    <SigningStatusScreen
      {...(attempt?.lifecycleState ? { lifecycleState: attempt.lifecycleState } : {})}
      {...(attempt?.breachDirection ? { breachDirection: attempt.breachDirection } : {})}
      {...(attempt?.retryEligible != null ? { retryEligible: attempt.retryEligible } : {})}
      signingState={signingState}
      signingError={signingError}
      onSignAndExecute={handleSignAndExecute}
      walletConnected={walletAddress != null}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit -p apps/app/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/app/app/signing/[attemptId].tsx
git commit -m "feat: rewrite signing route with prepare-sign-submit orchestration"
```

---

## Task 15: Run full test suite and fix any issues

**Files:** All modified files

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript compilation for all packages**

Run: `npx tsc --build`
Expected: PASS

- [ ] **Step 3: Fix any issues found**

If tests or compilation fail, investigate root causes and fix. Common issues to watch for:
- Missing `ClockTimestamp` import for new methods (cast `number as ClockTimestamp`)
- `buildExecutionPlan` may not be exported from `@clmm/domain` — check the barrel file and add the export if needed
- Design system color tokens that don't exist — substitute with available colors
- `SolanaExecutionPreparationAdapter` constructor may need more than just `rpcUrl` — check the constructor and pass required params

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve compilation and test issues from signing flow wiring"
```

---

## Summary of Endpoints After Implementation

| Method | Route | Status |
|--------|-------|--------|
| `POST` | `/executions/approve` | Existing — now stores `previewId` on attempt |
| `POST` | `/executions/:attemptId/prepare` | **NEW** — returns unsigned payload |
| `POST` | `/executions/:attemptId/submit` | Enhanced — validates `payloadVersion` |
| `GET` | `/executions/:attemptId` | Unchanged |
| `POST` | `/executions/:attemptId/abandon` | Unchanged |
