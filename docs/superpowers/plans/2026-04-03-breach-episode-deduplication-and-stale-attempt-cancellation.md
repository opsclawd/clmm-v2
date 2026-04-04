# Design Plan: Breach Episode Deduplication & Stale Attempt Cancellation

**Date:** 2026-04-03
**Spec:** `docs/superpowers/specs/2026-04-03-breach-episode-deduplication-and-stale-attempt-cancellation.md`
**Status:** Draft

---

## Problem Recap

Three defects in the breach detection pipeline:

1. `consecutiveCount` is hardcoded to `3` — threshold check always passes, every observation qualifies immediately.
2. `episodeId` is regenerated on every scan — duplicate suppression never fires, a new trigger fires every minute the position stays out of range.
3. No abandonment path — stale `awaiting-signature` attempts are never cancelled when the position recovers or reverses.

---

## Design Decisions

### 1. Episode state lives in the database, not in the job payload

The stable `episodeId` and accumulated `consecutiveCount` must survive worker restarts. They are written to the `breach_episodes` table at scan time, before any trigger is created. The qualify step reads from this table rather than trusting the job payload count.

### 2. `processBreachScan` replaces `scanPositionsForBreaches`

The existing `scanPositionsForBreaches` function is stateless — it does not touch episode state. A new application use case `processBreachScan` wraps position reading with episode lookup and upsert. `scanPositionsForBreaches` is deleted.

### 3. Episode upsert at scan time, trigger linkage at qualify time

- **Scan step:** create or update the episode record (increment `consecutiveCount`, update `lastObservedAt`). Episode has no `activeTriggerId` yet.
- **Qualify step:** if threshold met and no existing trigger, create trigger and update episode to set `activeTriggerId`. Duplicate suppression works because `episodeId` is now stable.

### 4. Abandonment is inline, not queued

Calling `RecordExecutionAbandonment` is a lightweight DB write. It does not need pg-boss retry semantics. The scan handler calls it directly for each stale attempt found, before enqueuing qualify-trigger jobs.

### 5. Direction reversal closes the old episode and starts a fresh one

When a position flips from `below-range` to `above-range` (or vice versa), the active episode for the old direction is closed (`closedAt` set) and a new episode for the new direction is started at `consecutiveCount: 1`. This means the new direction goes through the full 3-scan confirmation window before firing a trigger.

---

## Architecture

### Scan pipeline — before

```
BreachScanJobHandler
  → scanPositionsForBreaches()        [stateless, generates new episodeId each run]
  → enqueue qualify-trigger (with hardcoded consecutiveCount: 3)
  → TriggerQualificationJobHandler
      → qualifyActionableTrigger()
          → getActiveEpisodeTrigger(episodeId)  [never finds match — new id each run]
          → qualifyTrigger()                    [always passes — count hardcoded]
          → saveTrigger()
          → saveEpisode()                       [episode only written after trigger]
```

### Scan pipeline — after

```
BreachScanJobHandler
  → listSupportedPositions()
  → processBreachScan()               [stateful: reads + upserts episodes, finds stale attempts]
      returns { qualifiableObservations[], attemptsToAbandon[] }
  → RecordExecutionAbandonment()      [inline, for each stale attempt]
  → enqueue qualify-trigger           [with real consecutiveCount from episode record]
  → TriggerQualificationJobHandler
      → qualifyActionableTrigger()
          → getActiveEpisodeTrigger(episodeId)  [now finds match — stable id]
          → qualifyTrigger()                    [gates on real count]
          → saveTrigger()
          → saveEpisode()                       [updates episode to link activeTriggerId]
```

---

## Changes by Layer

### Domain — `packages/domain/src/triggers/index.ts`

Add `consecutiveCount` and `closedAt` to `BreachEpisode`:

```typescript
export type BreachEpisode = {
  readonly episodeId: BreachEpisodeId;
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly consecutiveCount: number;        // NEW — accumulated scan count
  readonly startedAt: ClockTimestamp;
  readonly lastObservedAt: ClockTimestamp;
  readonly activeTriggerId: ExitTriggerId | null;
  readonly closedAt: ClockTimestamp | null; // NEW — set when episode ends
};
```

No changes to `qualifyTrigger` — it already gates on `consecutiveOutOfRangeCount` correctly. The fix is that it now receives a real value instead of a hardcoded `3`.

---

### Application ports — `packages/application/src/ports/index.ts`

**Extend `TriggerRepository`:**

```typescript
export interface TriggerRepository {
  // ... existing methods unchanged ...

  // NEW: find the open episode for a position regardless of direction
  getActiveEpisodeForPosition(positionId: PositionId): Promise<BreachEpisode | null>;
}
```

`saveEpisode` already exists and is reused for both create and update (upsert by `episodeId`).

**Extend `ExecutionRepository`:**

```typescript
export interface ExecutionRepository {
  // ... existing methods unchanged ...

  // NEW: find an awaiting-signature attempt for a position
  getAwaitingSignatureAttemptForPosition(positionId: PositionId): Promise<StoredExecutionAttempt | null>;
}
```

---

### New application use case — `processBreachScan`

**File:** `packages/application/src/use-cases/triggers/ProcessBreachScan.ts`

```typescript
export type QualifiableObservation = {
  positionId: PositionId;
  walletId: WalletId;
  direction: BreachDirection;
  episodeId: string;
  consecutiveCount: number;
  observedAt: ClockTimestamp;
};

export type ProcessBreachScanResult = {
  qualifiableObservations: QualifiableObservation[];
  attemptsToAbandon: string[]; // attemptIds
};

export async function processBreachScan(params: {
  walletId: WalletId;
  positions: LiquidityPosition[];
  triggerRepo: TriggerRepository;
  executionRepo: ExecutionRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<ProcessBreachScanResult>
```

**Logic per position:**

```
activeEpisode = triggerRepo.getActiveEpisodeForPosition(positionId)

if position is in-range:
  if activeEpisode exists:
    close it (saveEpisode with closedAt = now)
  staleAttempt = executionRepo.getAwaitingSignatureAttemptForPosition(positionId)
  if staleAttempt exists:
    add staleAttempt.attemptId to attemptsToAbandon

if position is out-of-range (direction D):
  if activeEpisode exists AND activeEpisode.direction === D:
    updatedEpisode = { ...activeEpisode, consecutiveCount: + 1, lastObservedAt: now }
    saveEpisode(updatedEpisode)
  else if activeEpisode exists AND activeEpisode.direction !== D:
    // direction reversal
    close old episode (saveEpisode with closedAt = now)
    staleAttempt = executionRepo.getAwaitingSignatureAttemptForPosition(positionId)
    if staleAttempt exists: add to attemptsToAbandon
    create new episode (consecutiveCount: 1, no activeTriggerId)
    saveEpisode(newEpisode)
  else:
    // first observation
    create new episode (consecutiveCount: 1, no activeTriggerId)
    saveEpisode(newEpisode)

  add to qualifiableObservations (with episode.consecutiveCount)
```

---

### Updated application use case — `qualifyActionableTrigger`

**File:** `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts`

The `QualifyTriggerPayload` type gains `consecutiveCount`:

```typescript
type QualifyTriggerPayload = {
  positionId: string;
  walletId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
  observedAt: number;
  episodeId: string;
  consecutiveCount: number; // NEW — passed from processBreachScan result
};
```

Pass `consecutiveCount` from the payload into `qualifyTrigger` instead of the hardcoded `consecutiveCount: 3`:

```typescript
const domainResult = qualifyTrigger({
  ...
  consecutiveOutOfRangeCount: data.consecutiveCount, // was: hardcoded 3
  ...
});
```

When the trigger is created, update the episode to link `activeTriggerId`:

```typescript
await triggerRepo.saveEpisode({
  ...episode,
  activeTriggerId: domainResult.trigger.triggerId,
});
```

---

### Updated adapter — `BreachScanJobHandler`

**File:** `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`

Replace `scanPositionsForBreaches` with `processBreachScan`. Add `executionRepo` injection. Call `RecordExecutionAbandonment` inline for each stale attempt.

```typescript
const positions = await this.positionReadPort.listSupportedPositions(wallet.walletId);

const { qualifiableObservations, attemptsToAbandon } = await processBreachScan({
  walletId: wallet.walletId,
  positions,
  triggerRepo: this.triggerRepo,
  executionRepo: this.executionRepo,
  clock: this.clock,
  ids: this.ids,
});

for (const attemptId of attemptsToAbandon) {
  await recordExecutionAbandonment({
    attemptId,
    executionRepo: this.executionRepo,
    clock: this.clock,
  });
}

for (const obs of qualifiableObservations) {
  await this.enqueue('qualify-trigger', {
    positionId: obs.positionId,
    walletId: obs.walletId,
    directionKind: obs.direction.kind,
    observedAt: obs.observedAt,
    episodeId: obs.episodeId,
    consecutiveCount: obs.consecutiveCount, // NEW
  });
}
```

New injected dependency: `EXECUTION_REPOSITORY` token.

---

### Storage — `OperationalStorageAdapter`

**File:** `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`

Implement two new repository methods:

**`getActiveEpisodeForPosition(positionId)`**
```sql
SELECT * FROM breach_episodes
WHERE position_id = $1
  AND closed_at IS NULL
LIMIT 1
```

**`getAwaitingSignatureAttemptForPosition(positionId)`**
```sql
SELECT * FROM execution_attempts
WHERE position_id = $1
  AND lifecycle_state = 'awaiting-signature'
ORDER BY created_at DESC
LIMIT 1
```

**Existing `saveEpisode`** — update to upsert on `episode_id` with all fields including `consecutive_count` and `closed_at`.

---

### Schema migration

**File:** new migration in `packages/adapters/src/outbound/storage/schema/`

```sql
-- Add consecutive_count and closed_at to breach_episodes
ALTER TABLE breach_episodes
  ADD COLUMN consecutive_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN closed_at BIGINT;

-- Index for the new getActiveEpisodeForPosition query
CREATE INDEX idx_breach_episodes_active_position
  ON breach_episodes (position_id)
  WHERE closed_at IS NULL;

-- Index for getAwaitingSignatureAttemptForPosition
CREATE INDEX idx_execution_attempts_awaiting_position
  ON execution_attempts (position_id)
  WHERE lifecycle_state = 'awaiting-signature';
```

---

### Fakes — `packages/testing/src/fakes/`

- `FakeTriggerRepository` — implement `getActiveEpisodeForPosition`; update `saveEpisode` to handle `consecutiveCount` and `closedAt`
- `FakeExecutionRepository` — implement `getAwaitingSignatureAttemptForPosition`

---

## Files Changed

| File | Change |
|------|--------|
| `packages/domain/src/triggers/index.ts` | Add `consecutiveCount`, `closedAt` to `BreachEpisode` |
| `packages/application/src/ports/index.ts` | Add `getActiveEpisodeForPosition` to `TriggerRepository`; add `getAwaitingSignatureAttemptForPosition` to `ExecutionRepository` |
| `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts` | **Delete** |
| `packages/application/src/use-cases/triggers/ProcessBreachScan.ts` | **New** |
| `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts` | Accept `consecutiveCount` from payload; update episode with `activeTriggerId` on trigger creation |
| `packages/application/src/index.ts` | Export `processBreachScan`, remove `scanPositionsForBreaches` |
| `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` | Use `processBreachScan`; inject `executionRepo`; call `recordExecutionAbandonment` inline |
| `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` | Forward `consecutiveCount` from job payload |
| `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | Implement `getActiveEpisodeForPosition`, `getAwaitingSignatureAttemptForPosition`; update `saveEpisode` upsert |
| `packages/adapters/src/outbound/storage/schema/breach-episodes.ts` | Add `consecutiveCount`, `closedAt` columns |
| New migration file | `ALTER TABLE breach_episodes ADD COLUMN ...` + indexes |
| `packages/testing/src/fakes/FakeTriggerRepository.ts` | Implement new method, update saveEpisode |
| `packages/testing/src/fakes/FakeExecutionRepository.ts` | Implement new method |

---

## What Is Not Changing

- `qualifyTrigger` domain function — threshold logic is already correct
- `TriggerQualificationJobHandler` job wiring — only the payload shape changes
- `RecordExecutionAbandonment` use case — called as-is, no changes needed
- The signing page (`/signing/:attemptId`) — already routes to the result page on `abandoned` state
- Notification dispatch — unchanged; still fires once per trigger, now correctly deduplicated
