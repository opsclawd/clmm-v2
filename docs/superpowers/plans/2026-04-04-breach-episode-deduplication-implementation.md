# Breach Episode Deduplication & Stale Attempt Cancellation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three structural defects in the breach detection pipeline: make episode IDs stable across scans, accumulate real consecutive counts, and abandon stale execution attempts when conditions change.

**Architecture:** Introduce persisted breach episode lifecycle as the source of truth. A dedicated `BreachEpisodeRepository` port provides atomic state-transition methods (`recordInRange`, `recordOutOfRange`) that enforce the unique-open-episode-per-position invariant. Qualification uses the episode's `trigger_id` as the single dedup authority. Abandonment is inline in the scan handler, targeted by episode ID. Trigger finalization is the sole atomic trigger persistence path for this feature.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM (Postgres), NestJS DI, pg-boss job queues.

**Spec:** `docs/superpowers/specs/2026-04-04-breach-episode-deduplication-design.md`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `packages/application/src/ports/BreachEpisodeRepository.ts` | New port: `EpisodeTransition` union + `BreachEpisodeRepository` interface |
| Create | `packages/testing/src/fakes/FakeBreachEpisodeRepository.ts` | In-memory fake implementing `BreachEpisodeRepository` |
| Modify | `packages/testing/src/fakes/index.ts` | Re-export new fake |
| Modify | `packages/testing/src/fixtures/triggers.ts` | Add episode fixtures for new schema shape |
| Modify | `packages/domain/src/triggers/index.ts` | Update `BreachEpisode` type to match new schema (add `status`, `consecutiveCount`, `triggerId`, `closedAt`, `closeReason`) |
| Modify | `packages/domain/src/index.ts` | Replace `qualifyTrigger` export with `evaluateConfirmationThreshold` and `buildExitTrigger` |
| Modify | `packages/domain/src/triggers/TriggerQualificationService.ts` | Refactor domain qualification into threshold evaluation + trigger builder |
| Modify | `packages/domain/src/triggers/TriggerQualificationService.test.ts` | Rewrite tests for threshold evaluation and trigger building |
| Modify | `packages/application/src/ports/index.ts` | Add `episodeId` to `StoredExecutionAttempt`; export new port; remove `getActiveEpisodeTrigger`, `saveEpisode`, and `saveTrigger` from `TriggerRepository` |
| Modify | `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts` | Replace stateless scan with episode-transition-based scan; emit observations + abandonments |
| Modify | `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts` | Rewrite tests for new stateful scan behavior |
| Modify | `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts` | Use threshold-only domain logic + episode-authoritative dedup; call `finalizeQualification` only |
| Modify | `packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts` | Update tests for new qualification flow |
| Modify | `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` | Process abandonments inline; pass `consecutiveCount` in qualify-trigger payload; warn on integrity violations |
| Modify | `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts` | Add tests for abandonment dispatch, warning path, and new payload shape |
| Modify | `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` | Read `consecutiveCount` from payload instead of hardcoding `3`; inject `BreachEpisodeRepository` |
| Modify | `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts` | Update tests |
| Modify | `packages/adapters/src/outbound/storage/schema/triggers.ts` | Add `status`, `consecutive_count`, `closed_at`, `close_reason` columns; rename `active_trigger_id` → `trigger_id`; add unique partial index, check constraint, and episode FK if consistent with schema conventions |
| Modify | `packages/adapters/src/outbound/storage/schema/executions.ts` | Add `episode_id` column to `execution_attempts`; add FK if consistent with schema conventions |
| Modify | `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts` | Implement `BreachEpisodeRepository` + `finalizeQualification`; write/read `episodeId` on attempts; add `listAwaitingSignatureAttemptsByEpisode` |
| Modify | `packages/adapters/src/inbound/jobs/tokens.ts` | Add `BREACH_EPISODE_REPOSITORY` token |
| Modify | `packages/adapters/src/composition/AdaptersModule.ts` | Wire `BREACH_EPISODE_REPOSITORY` provider |
| Modify | `packages/application/src/index.ts` | Export new port |
| Modify | `packages/application/src/use-cases/execution/RequestWalletSignature.ts` | Require `episodeId` for trigger-derived attempt creation and persist it |
| Modify | `packages/testing/src/fakes/FakeTriggerRepository.ts` | Remove `saveTrigger`, `getActiveEpisodeTrigger`, `saveEpisode` |
| Modify | `packages/testing/src/fakes/FakeExecutionRepository.ts` | Add `listAwaitingSignatureAttemptsByEpisode` |

---

## Task 1: Domain Type Updates

**Files:**
- Modify: `packages/domain/src/triggers/index.ts:10-17`
- Modify: `packages/testing/src/fixtures/triggers.ts`

- [ ] **Step 1: Update `BreachEpisode` type**

The current `BreachEpisode` type is missing fields for the new lifecycle model. Update it:

```typescript
export type BreachEpisodeStatus = 'open' | 'closed';
export type EpisodeCloseReason = 'position-recovered' | 'direction-reversed';

export type BreachEpisode = {
  readonly episodeId: BreachEpisodeId;
  readonly positionId: PositionId;
  readonly direction: BreachDirection;
  readonly status: BreachEpisodeStatus;
  readonly startedAt: ClockTimestamp;
  readonly lastObservedAt: ClockTimestamp;
  readonly consecutiveCount: number;
  readonly triggerId: ExitTriggerId | null;
  readonly closedAt: ClockTimestamp | null;
  readonly closeReason: EpisodeCloseReason | null;
};
```

Remove the old `activeTriggerId` field.

- [ ] **Step 2: Run domain type check**

Run: `cd packages/domain && npx tsc --noEmit`

Expected: Compilation errors in downstream consumers referencing `activeTriggerId` and missing new fields. This is expected — fix consumers in later tasks.

- [ ] **Step 3: Update trigger fixtures**

Modify `packages/testing/src/fixtures/triggers.ts` — update `FIXTURE_LOWER_BREACH_EPISODE` to match the new shape:

```typescript
export const FIXTURE_LOWER_BREACH_EPISODE: BreachEpisode = {
  episodeId: FIXTURE_BREACH_EPISODE_ID,
  positionId: FIXTURE_POSITION_ID,
  direction: LOWER_BOUND_BREACH,
  status: 'open',
  startedAt: makeClockTimestamp(900_000),
  lastObservedAt: makeClockTimestamp(1_000_000),
  consecutiveCount: 3,
  triggerId: FIXTURE_EXIT_TRIGGER_ID,
  closedAt: null,
  closeReason: null,
};
```

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/triggers/index.ts packages/testing/src/fixtures/triggers.ts
git commit -m "refactor: update BreachEpisode type for persisted lifecycle model"
```

---

## Task 2: BreachEpisodeRepository Port + Port Surface Cleanup

**Files:**
- Create: `packages/application/src/ports/BreachEpisodeRepository.ts`
- Modify: `packages/application/src/ports/index.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Create the port file**

Create `packages/application/src/ports/BreachEpisodeRepository.ts`:

```typescript
import type {
  PositionId,
  BreachDirection,
  BreachEpisodeId,
  ClockTimestamp,
  BreachEpisode,
  ExitTrigger,
  ExitTriggerId,
} from '@clmm/domain';

export type EpisodeTransition =
  | { readonly kind: 'no-op' }
  | {
      readonly kind: 'episode-closed-recovered';
      readonly closedEpisodeId: BreachEpisodeId;
      readonly direction: BreachDirection;
    }
  | {
      readonly kind: 'episode-started';
      readonly episodeId: BreachEpisodeId;
      readonly direction: BreachDirection;
      readonly consecutiveCount: number;
    }
  | {
      readonly kind: 'episode-continued';
      readonly episodeId: BreachEpisodeId;
      readonly direction: BreachDirection;
      readonly consecutiveCount: number;
    }
  | {
      readonly kind: 'episode-reversed';
      readonly closedEpisodeId: BreachEpisodeId;
      readonly oldDirection: BreachDirection;
      readonly newEpisodeId: BreachEpisodeId;
      readonly newDirection: BreachDirection;
      readonly consecutiveCount: number;
    };

export type FinalizationResult =
  | { readonly kind: 'qualified'; readonly triggerId: ExitTriggerId }
  | { readonly kind: 'duplicate-suppressed'; readonly existingTriggerId: ExitTriggerId };

export interface BreachEpisodeRepository {
  recordInRange(positionId: PositionId, observedAt: ClockTimestamp): Promise<EpisodeTransition>;
  recordOutOfRange(positionId: PositionId, direction: BreachDirection, observedAt: ClockTimestamp): Promise<EpisodeTransition>;
  getOpenEpisode(positionId: PositionId): Promise<BreachEpisode | null>;
  finalizeQualification(episodeId: BreachEpisodeId, trigger: ExitTrigger): Promise<FinalizationResult>;
}
```

- [ ] **Step 2: Export from ports barrel**

Add to `packages/application/src/ports/index.ts`:

```typescript
export type {
  EpisodeTransition,
  FinalizationResult,
  BreachEpisodeRepository,
} from './BreachEpisodeRepository.js';
```

- [ ] **Step 3: Remove stale methods from `TriggerRepository`**

`TriggerRepository` should no longer participate in qualification writes. Remove `saveTrigger`, `getActiveEpisodeTrigger`, and `saveEpisode`.

Use this interface:

```typescript
export interface TriggerRepository {
  getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null>;
  listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]>;
  deleteTrigger(triggerId: ExitTriggerId): Promise<void>;
}
```

- [ ] **Step 4: Add `episodeId` to `StoredExecutionAttempt`**

In `packages/application/src/ports/index.ts`, add `episodeId` to `StoredExecutionAttempt`:

```typescript
export type StoredExecutionAttempt = ExecutionAttempt & {
  attemptId: string;
  positionId: PositionId;
  breachDirection: BreachDirection;
  previewId?: string;
  episodeId?: BreachEpisodeId;
};
```

`episodeId` is optional only for legacy/manual execution paths that predate this feature. For any trigger-derived execution attempt, `episodeId` MUST be provided.

- [ ] **Step 5: Add `listAwaitingSignatureAttemptsByEpisode` to `ExecutionRepository`**

In `packages/application/src/ports/index.ts`, add:

```typescript
listAwaitingSignatureAttemptsByEpisode(
  episodeId: BreachEpisodeId,
): Promise<StoredExecutionAttempt[]>;
```

- [ ] **Step 6: Export from application barrel**

Add to `packages/application/src/index.ts`:

```typescript
export * from './ports/BreachEpisodeRepository.js';
```

- [ ] **Step 7: Run type check**

Run: `cd packages/application && npx tsc --noEmit`

Expected: Errors in consumers of removed `TriggerRepository` methods. Expected — fix them in later tasks.

- [ ] **Step 8: Commit**

```bash
git add packages/application/src/ports/BreachEpisodeRepository.ts packages/application/src/ports/index.ts packages/application/src/index.ts
git commit -m "feat: add BreachEpisodeRepository port and remove stale trigger write surface"
```

---

## Task 3: FakeBreachEpisodeRepository + Fake Port Updates

**Files:**
- Create: `packages/testing/src/fakes/FakeBreachEpisodeRepository.ts`
- Modify: `packages/testing/src/fakes/FakeTriggerRepository.ts`
- Modify: `packages/testing/src/fakes/FakeExecutionRepository.ts`
- Modify: `packages/testing/src/fakes/index.ts`

- [ ] **Step 1: Create `FakeBreachEpisodeRepository`**

Create `packages/testing/src/fakes/FakeBreachEpisodeRepository.ts`:

```typescript
import type {
  BreachEpisodeRepository,
  EpisodeTransition,
  FinalizationResult,
} from '@clmm/application';
import type {
  PositionId,
  BreachDirection,
  BreachEpisodeId,
  ClockTimestamp,
  BreachEpisode,
  ExitTrigger,
} from '@clmm/domain';

let _fakeEpisodeCounter = 0;

export class FakeBreachEpisodeRepository implements BreachEpisodeRepository {
  readonly episodes = new Map<string, BreachEpisode>();

  private getOpenEpisodeForPosition(positionId: PositionId): BreachEpisode | null {
    for (const ep of this.episodes.values()) {
      if (ep.positionId === positionId && ep.status === 'open') return ep;
    }
    return null;
  }

  async getOpenEpisode(positionId: PositionId): Promise<BreachEpisode | null> {
    return this.getOpenEpisodeForPosition(positionId);
  }

  async recordInRange(
    positionId: PositionId,
    observedAt: ClockTimestamp,
  ): Promise<EpisodeTransition> {
    const open = this.getOpenEpisodeForPosition(positionId);
    if (!open) return { kind: 'no-op' };

    const closed: BreachEpisode = {
      ...open,
      status: 'closed',
      closedAt: observedAt,
      closeReason: 'position-recovered',
    };
    this.episodes.set(open.episodeId, closed);

    return {
      kind: 'episode-closed-recovered',
      closedEpisodeId: open.episodeId,
      direction: open.direction,
    };
  }

  async recordOutOfRange(
    positionId: PositionId,
    direction: BreachDirection,
    observedAt: ClockTimestamp,
  ): Promise<EpisodeTransition> {
    const open = this.getOpenEpisodeForPosition(positionId);

    if (!open) {
      const episodeId = `fake-episode-${++_fakeEpisodeCounter}` as BreachEpisodeId;
      const episode: BreachEpisode = {
        episodeId,
        positionId,
        direction,
        status: 'open',
        startedAt: observedAt,
        lastObservedAt: observedAt,
        consecutiveCount: 1,
        triggerId: null,
        closedAt: null,
        closeReason: null,
      };
      this.episodes.set(episodeId, episode);
      return { kind: 'episode-started', episodeId, direction, consecutiveCount: 1 };
    }

    if (open.direction.kind === direction.kind) {
      if (observedAt <= open.lastObservedAt) {
        return {
          kind: 'episode-continued',
          episodeId: open.episodeId,
          direction: open.direction,
          consecutiveCount: open.consecutiveCount,
        };
      }

      const updated: BreachEpisode = {
        ...open,
        lastObservedAt: observedAt,
        consecutiveCount: open.consecutiveCount + 1,
      };
      this.episodes.set(open.episodeId, updated);

      return {
        kind: 'episode-continued',
        episodeId: open.episodeId,
        direction: open.direction,
        consecutiveCount: updated.consecutiveCount,
      };
    }

    const closed: BreachEpisode = {
      ...open,
      status: 'closed',
      closedAt: observedAt,
      closeReason: 'direction-reversed',
    };
    this.episodes.set(open.episodeId, closed);

    const newEpisodeId = `fake-episode-${++_fakeEpisodeCounter}` as BreachEpisodeId;
    const newEpisode: BreachEpisode = {
      episodeId: newEpisodeId,
      positionId,
      direction,
      status: 'open',
      startedAt: observedAt,
      lastObservedAt: observedAt,
      consecutiveCount: 1,
      triggerId: null,
      closedAt: null,
      closeReason: null,
    };
    this.episodes.set(newEpisodeId, newEpisode);

    return {
      kind: 'episode-reversed',
      closedEpisodeId: open.episodeId,
      oldDirection: open.direction,
      newEpisodeId,
      newDirection: direction,
      consecutiveCount: 1,
    };
  }

  async finalizeQualification(
    episodeId: BreachEpisodeId,
    trigger: ExitTrigger,
  ): Promise<FinalizationResult> {
    const episode = this.episodes.get(episodeId);
    if (!episode) throw new Error(`finalizeQualification: episode ${episodeId} not found`);
    if (episode.triggerId) {
      return { kind: 'duplicate-suppressed', existingTriggerId: episode.triggerId };
    }
    this.episodes.set(episodeId, { ...episode, triggerId: trigger.triggerId });
    return { kind: 'qualified', triggerId: trigger.triggerId };
  }

  static resetCounter(): void {
    _fakeEpisodeCounter = 0;
  }
}
```

- [ ] **Step 2: Update `FakeTriggerRepository`**

Remove `saveTrigger`, `getActiveEpisodeTrigger`, `saveEpisode`, `episodes`, and `episodeTriggerMap`.

Use:

```typescript
import type { TriggerRepository } from '@clmm/application';
import type { ExitTrigger, ExitTriggerId, WalletId } from '@clmm/domain';

export class FakeTriggerRepository implements TriggerRepository {
  readonly triggers = new Map<string, ExitTrigger>();
  lastListedWalletId: WalletId | null = null;

  async getTrigger(triggerId: ExitTriggerId): Promise<ExitTrigger | null> {
    return this.triggers.get(triggerId) ?? null;
  }

  async listActionableTriggers(walletId: WalletId): Promise<ExitTrigger[]> {
    this.lastListedWalletId = walletId;
    return Array.from(this.triggers.values());
  }

  async deleteTrigger(triggerId: ExitTriggerId): Promise<void> {
    this.triggers.delete(triggerId);
  }
}
```

- [ ] **Step 3: Add `listAwaitingSignatureAttemptsByEpisode` to `FakeExecutionRepository`**

Add:

```typescript
async listAwaitingSignatureAttemptsByEpisode(
  episodeId: BreachEpisodeId,
): Promise<StoredExecutionAttempt[]> {
  return Array.from(this.attempts.values()).filter(
    (a) => a.episodeId === episodeId && a.lifecycleState.kind === 'awaiting-signature',
  );
}
```

- [ ] **Step 4: Export new fake from barrel**

Add to `packages/testing/src/fakes/index.ts`:

```typescript
export { FakeBreachEpisodeRepository } from './FakeBreachEpisodeRepository.js';
```

- [ ] **Step 5: Run type check**

Run: `cd packages/testing && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/testing/src/fakes/
git commit -m "feat: add FakeBreachEpisodeRepository and update fake ports for episode refactor"
```

---

## Task 4: Rewrite ScanPositionsForBreaches

**Files:**
- Modify: `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts`
- Modify: `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`

- [ ] **Step 1: Write failing tests for new scan behavior**

Rewrite `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { scanPositionsForBreaches } from './ScanPositionsForBreaches.js';
import {
  FakeSupportedPositionReadPort,
  FakeClockPort,
  FakeBreachEpisodeRepository,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_BELOW_RANGE,
  FIXTURE_POSITION_ABOVE_RANGE,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';

describe('ScanPositionsForBreaches', () => {
  let clock: FakeClockPort;
  let episodeRepo: FakeBreachEpisodeRepository;

  beforeEach(() => {
    clock = new FakeClockPort();
    episodeRepo = new FakeBreachEpisodeRepository();
    FakeBreachEpisodeRepository.resetCounter();
  });

  it('emits observation with consecutiveCount=1 for first breach', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);
    const { observations } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.consecutiveCount).toBe(1);
    expect(observations[0]?.direction.kind).toBe('lower-bound-breach');
  });

  it('increments consecutiveCount on subsequent scans in same direction', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const { observations } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(observations[0]?.consecutiveCount).toBe(2);
  });

  it('reuses same episodeId across scans in same direction', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    const first = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const second = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(second.observations[0]?.episodeId).toBe(first.observations[0]?.episodeId);
  });

  it('emits no observations and no abandonments for in-range positions with no open episode', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const { observations, abandonments } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(observations).toHaveLength(0);
    expect(abandonments).toHaveLength(0);
  });

  it('emits abandonment when position recovers to in-range', async () => {
    const belowRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: belowRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const inRangeRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const { abandonments } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: inRangeRead,
      clock,
      episodeRepo,
    });

    expect(abandonments).toHaveLength(1);
    expect(abandonments[0]?.reason).toBe('position-recovered');
  });

  it('emits abandonment and starts new episode on direction reversal', async () => {
    const belowRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: belowRead,
      clock,
      episodeRepo,
    });

    clock.advance(60_000);

    const aboveRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_ABOVE_RANGE]);
    const { observations, abandonments } = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: aboveRead,
      clock,
      episodeRepo,
    });

    expect(abandonments).toHaveLength(1);
    expect(abandonments[0]?.reason).toBe('direction-reversed');
    expect(observations).toHaveLength(1);
    expect(observations[0]?.consecutiveCount).toBe(1);
    expect(observations[0]?.direction.kind).toBe('upper-bound-breach');
  });

  it('does not increment count on duplicate scan tick (idempotency)', async () => {
    const positionRead = new FakeSupportedPositionReadPort([FIXTURE_POSITION_BELOW_RANGE]);

    const first = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    const second = await scanPositionsForBreaches({
      walletId: FIXTURE_WALLET_ID,
      positionReadPort: positionRead,
      clock,
      episodeRepo,
    });

    expect(second.observations[0]?.consecutiveCount).toBe(first.observations[0]?.consecutiveCount);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/application && npx vitest run src/use-cases/triggers/ScanPositionsForBreaches.test.ts`

Expected: FAIL — `scanPositionsForBreaches` does not accept `episodeRepo` yet.

- [ ] **Step 3: Rewrite `ScanPositionsForBreaches`**

Replace `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts`:

```typescript
import type { SupportedPositionReadPort, ClockPort } from '../../ports/index.js';
import type { BreachEpisodeRepository } from '../../ports/BreachEpisodeRepository.js';
import type {
  WalletId,
  BreachDirection,
  PositionId,
  BreachEpisodeId,
  ClockTimestamp,
} from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';

export type BreachObservationResult = {
  positionId: PositionId;
  direction: BreachDirection;
  observedAt: ClockTimestamp;
  episodeId: BreachEpisodeId;
  consecutiveCount: number;
};

export type AbandonmentDirective = {
  positionId: PositionId;
  episodeId: BreachEpisodeId;
  reason: 'position-recovered' | 'direction-reversed';
};

export type ScanResult = {
  observations: BreachObservationResult[];
  abandonments: AbandonmentDirective[];
};

export async function scanPositionsForBreaches(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
  clock: ClockPort;
  episodeRepo: BreachEpisodeRepository;
}): Promise<ScanResult> {
  const { walletId, positionReadPort, clock, episodeRepo } = params;
  const positions = await positionReadPort.listSupportedPositions(walletId);

  const now = makeClockTimestamp(Math.floor(clock.now() / 60_000) * 60_000);
  const observations: BreachObservationResult[] = [];
  const abandonments: AbandonmentDirective[] = [];

  for (const position of positions) {
    const rangeKind = position.rangeState.kind;

    if (rangeKind === 'in-range') {
      const transition = await episodeRepo.recordInRange(position.positionId, now);
      if (transition.kind === 'episode-closed-recovered') {
        abandonments.push({
          positionId: position.positionId,
          episodeId: transition.closedEpisodeId,
          reason: 'position-recovered',
        });
      }
      continue;
    }

    const direction: BreachDirection =
      rangeKind === 'below-range' ? LOWER_BOUND_BREACH : UPPER_BOUND_BREACH;

    const transition = await episodeRepo.recordOutOfRange(position.positionId, direction, now);

    if (transition.kind === 'episode-reversed') {
      abandonments.push({
        positionId: position.positionId,
        episodeId: transition.closedEpisodeId,
        reason: 'direction-reversed',
      });
      observations.push({
        positionId: position.positionId,
        direction: transition.newDirection,
        observedAt: now,
        episodeId: transition.newEpisodeId,
        consecutiveCount: transition.consecutiveCount,
      });
    } else if (
      transition.kind === 'episode-started' ||
      transition.kind === 'episode-continued'
    ) {
      observations.push({
        positionId: position.positionId,
        direction: transition.direction,
        observedAt: now,
        episodeId: transition.episodeId,
        consecutiveCount: transition.consecutiveCount,
      });
    }
  }

  return { observations, abandonments };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/application && npx vitest run src/use-cases/triggers/ScanPositionsForBreaches.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts packages/application/src/use-cases/triggers/ScanPositionsForBreaches.test.ts
git commit -m "feat: rewrite ScanPositionsForBreaches with persisted episode transitions"
```

---

## Task 5: Rewrite Qualification Path + Refactor Domain TriggerQualificationService

**Files:**
- Modify: `packages/domain/src/triggers/TriggerQualificationService.ts`
- Modify: `packages/domain/src/triggers/TriggerQualificationService.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts`
- Modify: `packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts`

**Design decisions:**

- **Domain = threshold only.** `qualifyTrigger` goes away. Domain code evaluates the threshold and builds trigger objects, but does not do dedup.
- **Application + persistence = dedup.** `qualifyActionableTrigger` checks threshold, builds a trigger, and calls `finalizeQualification`, which atomically handles dedup + trigger persistence.
- **Trigger IDs are constructed in the application layer** via `IdGeneratorPort`. Pure domain code does not invent IDs by side effect.
- **`observation.observedAt` is the timestamp for trigger construction**, not `clock.now()`.
- **`finalizeQualification` is the sole trigger persistence path.** No separate `triggerRepo.saveTrigger` call remains.

- [ ] **Step 1: Refactor domain `TriggerQualificationService`**

Rewrite `packages/domain/src/triggers/TriggerQualificationService.ts`:

```typescript
import type { PositionId, BreachDirection, ClockTimestamp } from '../shared/index.js';
import type { BreachEpisodeId, ExitTrigger, ExitTriggerId } from './index.js';

const MVP_CONFIRMATION_THRESHOLD = 3;

export type ThresholdEvaluation =
  | { readonly kind: 'met' }
  | { readonly kind: 'not-met'; readonly reason: string };

export function evaluateConfirmationThreshold(
  consecutiveOutOfRangeCount: number,
): ThresholdEvaluation {
  if (consecutiveOutOfRangeCount < MVP_CONFIRMATION_THRESHOLD) {
    return {
      kind: 'not-met',
      reason: `confirmation threshold not met: need ${MVP_CONFIRMATION_THRESHOLD} consecutive observations, got ${consecutiveOutOfRangeCount}`,
    };
  }

  return { kind: 'met' };
}

export function buildExitTrigger(params: {
  triggerId: ExitTriggerId;
  positionId: PositionId;
  direction: BreachDirection;
  observedAt: ClockTimestamp;
  episodeId: BreachEpisodeId;
}): ExitTrigger {
  return {
    triggerId: params.triggerId,
    positionId: params.positionId,
    breachDirection: params.direction,
    triggeredAt: params.observedAt,
    confirmationEvaluatedAt: params.observedAt,
    confirmationPassed: true,
    episodeId: params.episodeId,
  };
}
```

- [ ] **Step 2: Update domain barrel exports**

In `packages/domain/src/index.ts`, replace the `qualifyTrigger` export with:

```typescript
export {
  evaluateConfirmationThreshold,
  buildExitTrigger,
} from './triggers/TriggerQualificationService.js';
export type { ThresholdEvaluation } from './triggers/TriggerQualificationService.js';
```

- [ ] **Step 3: Replace remaining `qualifyTrigger` imports/usages across the repo**

Search for all imports/usages of `qualifyTrigger` and replace them with the new threshold + trigger-construction flow, or remove them if unused.

Run:

```bash
rg "qualifyTrigger" packages/
```

Expected: no remaining production imports after this task.

- [ ] **Step 4: Update domain tests**

Rewrite `packages/domain/src/triggers/TriggerQualificationService.test.ts` to test:
- `evaluateConfirmationThreshold(2)` returns `not-met`
- `evaluateConfirmationThreshold(3)` returns `met`
- `evaluateConfirmationThreshold(4)` returns `met`
- `buildExitTrigger(...)` returns an `ExitTrigger` with the exact fields passed in

- [ ] **Step 5: Write failing application tests**

Rewrite `packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { qualifyActionableTrigger } from './QualifyActionableTrigger.js';
import {
  FakeIdGeneratorPort,
  FakeBreachEpisodeRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, makeClockTimestamp } from '@clmm/domain';
import type { BreachEpisodeId } from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

function makeObs(overrides?: Partial<BreachObservationResult>): BreachObservationResult {
  return {
    positionId: FIXTURE_POSITION_ID,
    direction: LOWER_BOUND_BREACH,
    observedAt: makeClockTimestamp(1_000_000),
    episodeId: 'fake-episode-1' as BreachEpisodeId,
    consecutiveCount: 3,
    ...overrides,
  };
}

describe('QualifyActionableTrigger', () => {
  let ids: FakeIdGeneratorPort;
  let episodeRepo: FakeBreachEpisodeRepository;

  beforeEach(() => {
    ids = new FakeIdGeneratorPort('trigger');
    episodeRepo = new FakeBreachEpisodeRepository();
    FakeBreachEpisodeRepository.resetCounter();
  });

  it('returns not-qualified when consecutiveCount < threshold', async () => {
    const result = await qualifyActionableTrigger({
      observation: makeObs({ consecutiveCount: 2 }),
      episodeRepo,
      ids,
    });

    expect(result.kind).toBe('not-qualified');
  });

  it('creates trigger and finalizes on episode when threshold met', async () => {
    await episodeRepo.recordOutOfRange(
      FIXTURE_POSITION_ID,
      LOWER_BOUND_BREACH,
      makeClockTimestamp(1_000_000),
    );

    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    expect(result.kind).toBe('trigger-created');
    if (result.kind === 'trigger-created') {
      expect(result.trigger.breachDirection.kind).toBe('lower-bound-breach');
      expect(result.trigger.triggeredAt).toBe(1_000_000);
    }

    const ep = episodeRepo.episodes.get('fake-episode-1' as BreachEpisodeId);
    expect(ep?.triggerId).not.toBeNull();
  });

  it('returns duplicate-suppressed when episode already has a trigger', async () => {
    await episodeRepo.recordOutOfRange(
      FIXTURE_POSITION_ID,
      LOWER_BOUND_BREACH,
      makeClockTimestamp(1_000_000),
    );

    await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    expect(result.kind).toBe('duplicate-suppressed');
  });

  it('uses IdGeneratorPort for trigger ID', async () => {
    await episodeRepo.recordOutOfRange(
      FIXTURE_POSITION_ID,
      LOWER_BOUND_BREACH,
      makeClockTimestamp(1_000_000),
    );

    const result = await qualifyActionableTrigger({
      observation: makeObs(),
      episodeRepo,
      ids,
    });

    if (result.kind === 'trigger-created') {
      expect(result.trigger.triggerId).toMatch(/^trigger-/);
    }
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/application && npx vitest run src/use-cases/triggers/QualifyActionableTrigger.test.ts`

Expected: FAIL.

- [ ] **Step 7: Rewrite `QualifyActionableTrigger`**

Replace `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts`:

```typescript
import type { IdGeneratorPort } from '../../ports/index.js';
import type { BreachEpisodeRepository } from '../../ports/BreachEpisodeRepository.js';
import { evaluateConfirmationThreshold, buildExitTrigger } from '@clmm/domain';
import type { ExitTrigger, BreachEpisodeId, ExitTriggerId } from '@clmm/domain';
import type { BreachObservationResult } from './ScanPositionsForBreaches.js';

export type QualifyResult =
  | { kind: 'trigger-created'; trigger: ExitTrigger }
  | { kind: 'not-qualified'; reason: string }
  | { kind: 'duplicate-suppressed'; existingTriggerId: ExitTriggerId };

export async function qualifyActionableTrigger(params: {
  observation: BreachObservationResult;
  episodeRepo: BreachEpisodeRepository;
  ids: IdGeneratorPort;
}): Promise<QualifyResult> {
  const { observation, episodeRepo, ids } = params;

  const threshold = evaluateConfirmationThreshold(observation.consecutiveCount);
  if (threshold.kind === 'not-met') {
    return { kind: 'not-qualified', reason: threshold.reason };
  }

  const trigger = buildExitTrigger({
    triggerId: ids.generateId() as ExitTriggerId,
    positionId: observation.positionId,
    direction: observation.direction,
    observedAt: observation.observedAt,
    episodeId: observation.episodeId as BreachEpisodeId,
  });

  const finalization = await episodeRepo.finalizeQualification(
    observation.episodeId as BreachEpisodeId,
    trigger,
  );

  if (finalization.kind === 'duplicate-suppressed') {
    return {
      kind: 'duplicate-suppressed',
      existingTriggerId: finalization.existingTriggerId,
    };
  }

  return { kind: 'trigger-created', trigger };
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/application && npx vitest run src/use-cases/triggers/QualifyActionableTrigger.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/domain/src/triggers/TriggerQualificationService.ts packages/domain/src/triggers/TriggerQualificationService.test.ts packages/domain/src/index.ts packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts packages/application/src/use-cases/triggers/QualifyActionableTrigger.test.ts
git commit -m "feat: clean qualification path — domain threshold, app ids, atomic finalization"
```

---

## Task 6: Update BreachScanJobHandler

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts`
- Modify: `packages/adapters/src/inbound/jobs/tokens.ts`

- [ ] **Step 1: Add `BREACH_EPISODE_REPOSITORY` token**

Add to `packages/adapters/src/inbound/jobs/tokens.ts`:

```typescript
export const BREACH_EPISODE_REPOSITORY = 'BREACH_EPISODE_REPOSITORY';
```

- [ ] **Step 2: Rewrite `BreachScanJobHandler`**

The handler must:
- Add `BreachEpisodeRepository` to the handler dependencies
- Keep `IdGeneratorPort` because inline abandonment still calls `recordExecutionAbandonment`
- Inject `ExecutionRepository` and `ExecutionHistoryRepository` for inline abandonment
- Pass `episodeRepo` to `scanPositionsForBreaches`
- Pass `consecutiveCount` in the `qualify-trigger` job payload
- Log a warning if more than one awaiting-signature attempt is found for a single episode
- Process `abandonments[]` inline by looking up attempts and calling `recordExecutionAbandonment`

Update `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { scanPositionsForBreaches, recordExecutionAbandonment } from '@clmm/application';
import type {
  MonitoredWalletRepository,
  SupportedPositionReadPort,
  ClockPort,
  IdGeneratorPort,
  ObservabilityPort,
  BreachEpisodeRepository,
  ExecutionRepository,
  ExecutionHistoryRepository,
} from '@clmm/application';
import {
  MONITORED_WALLET_REPOSITORY,
  SUPPORTED_POSITION_READ_PORT,
  CLOCK_PORT,
  ID_GENERATOR_PORT,
  OBSERVABILITY_PORT,
  PG_BOSS,
  BREACH_EPISODE_REPOSITORY,
  EXECUTION_REPOSITORY,
  EXECUTION_HISTORY_REPOSITORY,
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
    @Inject(BREACH_EPISODE_REPOSITORY)
    private readonly episodeRepo: BreachEpisodeRepository,
    @Inject(EXECUTION_REPOSITORY)
    private readonly executionRepo: ExecutionRepository,
    @Inject(EXECUTION_HISTORY_REPOSITORY)
    private readonly historyRepo: ExecutionHistoryRepository,
  ) {}

  async handle(): Promise<void> {
    let wallets: Awaited<ReturnType<MonitoredWalletRepository['listActiveWallets']>>;

    try {
      wallets = await this.monitoredWalletRepo.listActiveWallets();
    } catch (error: unknown) {
      this.observability.log('error', 'Breach scan failed before wallet iteration', {
        stage: 'list-active-wallets',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    for (const wallet of wallets) {
      try {
        const { observations, abandonments } = await scanPositionsForBreaches({
          walletId: wallet.walletId,
          positionReadPort: this.positionReadPort,
          clock: this.clock,
          episodeRepo: this.episodeRepo,
        });

        for (const obs of observations) {
          await this.enqueue('qualify-trigger', {
            positionId: obs.positionId,
            walletId: wallet.walletId,
            directionKind: obs.direction.kind,
            observedAt: obs.observedAt,
            episodeId: obs.episodeId,
            consecutiveCount: obs.consecutiveCount,
          });

          this.observability.recordDetectionTiming({
            positionId: obs.positionId,
            detectedAt: this.clock.now(),
            observedAt: obs.observedAt,
            durationMs: this.clock.now() - obs.observedAt,
          });
        }

        for (const abandonment of abandonments) {
          const staleAttempts = await this.executionRepo.listAwaitingSignatureAttemptsByEpisode(
            abandonment.episodeId,
          );

          if (staleAttempts.length > 1) {
            this.observability.log(
              'warn',
              'Multiple awaiting-signature attempts found for episode',
              {
                episodeId: abandonment.episodeId,
                positionId: abandonment.positionId,
                count: staleAttempts.length,
              },
            );
          }

          for (const attempt of staleAttempts) {
            await recordExecutionAbandonment({
              attemptId: attempt.attemptId,
              positionId: attempt.positionId,
              breachDirection: attempt.breachDirection,
              executionRepo: this.executionRepo,
              historyRepo: this.historyRepo,
              clock: this.clock,
              ids: this.ids,
            });

            this.observability.log('info', `Abandoned stale attempt ${attempt.attemptId}`, {
              positionId: abandonment.positionId,
              reason: abandonment.reason,
              episodeId: abandonment.episodeId,
            });
          }
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

- [ ] **Step 3: Update `BreachScanJobHandler.test.ts`**

Update the test file to:
- Add `FakeBreachEpisodeRepository` to the handler construction
- Keep `FakeIdGeneratorPort` because abandonment still needs IDs
- Add `FakeExecutionRepository` and `FakeExecutionHistoryRepository` for abandonment
- Add test: `enqueues qualify-trigger with consecutiveCount from episode`
- Add test: `abandons stale awaiting-signature attempt when position recovers`
- Add test: `abandons stale attempt on direction reversal`
- Add test: `logs warning when multiple awaiting-signature attempts exist for one episode`
- Verify the enqueue payload includes `consecutiveCount`

- [ ] **Step 4: Run tests**

Run: `cd packages/adapters && npx vitest run src/inbound/jobs/BreachScanJobHandler.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts packages/adapters/src/inbound/jobs/BreachScanJobHandler.test.ts packages/adapters/src/inbound/jobs/tokens.ts
git commit -m "feat: update BreachScanJobHandler for episode transitions and inline abandonment"
```

---

## Task 7: Update TriggerQualificationJobHandler

**Files:**
- Modify: `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts`
- Modify: `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts`

- [ ] **Step 1: Update payload type and handler**

In `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts`:

1. Add `consecutiveCount: number` to `QualifyTriggerPayload`
2. Add `BreachEpisodeRepository` injection via `BREACH_EPISODE_REPOSITORY` token
3. Pass `data.consecutiveCount` from payload instead of hardcoded `3`
4. Pass `episodeRepo` and `ids` to `qualifyActionableTrigger`

Use:

```typescript
type QualifyTriggerPayload = {
  positionId: string;
  walletId: string;
  directionKind: 'lower-bound-breach' | 'upper-bound-breach';
  observedAt: number;
  episodeId: string;
  consecutiveCount: number;
};
```

Construct the observation with `observedAt: data.observedAt`, `episodeId: data.episodeId`, and `consecutiveCount: data.consecutiveCount`.

- [ ] **Step 2: Update tests**

Update `TriggerQualificationJobHandler.test.ts` to:
- Add `consecutiveCount` to all test payloads
- Add `FakeBreachEpisodeRepository` to handler construction
- Seed the fake episode before testing successful qualification
- Add test: `passes real consecutiveCount from payload to qualifier`

- [ ] **Step 3: Run tests**

Run: `cd packages/adapters && npx vitest run src/inbound/jobs/TriggerQualificationJobHandler.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.test.ts
git commit -m "feat: pass real consecutiveCount in qualification payload and inject episode repository"
```

---

## Task 8: Schema Migration

**Files:**
- Modify: `packages/adapters/src/outbound/storage/schema/triggers.ts`
- Modify: `packages/adapters/src/outbound/storage/schema/executions.ts`

- [ ] **Step 1: Update `breach_episodes` schema**

In `packages/adapters/src/outbound/storage/schema/triggers.ts`, update `breachEpisodes`:

```typescript
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  boolean,
  bigint,
  integer,
  check,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const breachEpisodes = pgTable('breach_episodes', {
  episodeId: text('episode_id').primaryKey(),
  positionId: text('position_id').notNull(),
  directionKind: text('direction_kind').notNull(),
  status: text('status').notNull().default('open'),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  lastObservedAt: bigint('last_observed_at', { mode: 'number' }).notNull(),
  consecutiveCount: integer('consecutive_count').notNull().default(1),
  triggerId: text('trigger_id'),
  closedAt: bigint('closed_at', { mode: 'number' }),
  closeReason: text('close_reason'),
}, (table) => [
  check(
    'breach_episodes_direction_kind_check',
    sql`${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')`,
  ),
  check(
    'breach_episodes_status_check',
    sql`${table.status} in ('open', 'closed')`,
  ),
  check(
    'breach_episodes_closed_fields_check',
    sql`(${table.status} = 'open') OR (${table.closedAt} IS NOT NULL AND ${table.closeReason} IS NOT NULL)`,
  ),
  uniqueIndex('breach_episodes_one_open_per_position')
    .on(table.positionId)
    .where(sql`${table.status} = 'open'`),
]);
```

Add unique constraint on `exit_triggers.episode_id`:

```typescript
export const exitTriggers = pgTable('exit_triggers', {
  triggerId: text('trigger_id').primaryKey(),
  positionId: text('position_id').notNull(),
  episodeId: text('episode_id').notNull().unique(),
  directionKind: text('direction_kind').notNull(),
  triggeredAt: bigint('triggered_at', { mode: 'number' }).notNull(),
  confirmationEvaluatedAt: bigint('confirmation_evaluated_at', { mode: 'number' }).notNull(),
  confirmationPassed: boolean('confirmation_passed').notNull().default(true),
}, (table) => [
  check(
    'exit_triggers_direction_kind_check',
    sql`${table.directionKind} in ('lower-bound-breach', 'upper-bound-breach')`,
  ),
]);
```

- [ ] **Step 2: Add `episode_id` to `execution_attempts`**

In `packages/adapters/src/outbound/storage/schema/executions.ts`, add:

```typescript
episodeId: text('episode_id'),
```

- [ ] **Step 3: Add foreign-key constraints for episode-linked flows if consistent with existing schema conventions**

Prefer:
- `exit_triggers.episode_id` → `breach_episodes.episode_id`
- `execution_attempts.episode_id` → `breach_episodes.episode_id`
- optional: `breach_episodes.trigger_id` → `exit_triggers.trigger_id`

If this codebase intentionally avoids DB foreign keys, document that explicitly in the schema/migration notes and preserve the relationships in application code.

- [ ] **Step 4: Determine migration strategy**

Check whether `drizzle-kit` is configured:

```bash
ls packages/adapters/drizzle.config.*
```

Check `package.json` for drizzle-kit scripts.

Then:
- If a `drizzle.config.ts` exists and migration files are present in a `drizzle/` or `migrations/` directory: run `cd packages/adapters && npx drizzle-kit generate`
- If no migration directory exists and `drizzle-kit push` is used: apply via push and document that path in the commit message

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/outbound/storage/schema/
git commit -m "feat: update breach_episodes and execution_attempts schema for episode-linked lifecycle"
```

---

## Task 9: OperationalStorageAdapter — Implement BreachEpisodeRepository

**Files:**
- Modify: `packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts`

- [ ] **Step 1: Implement `BreachEpisodeRepository` on `OperationalStorageAdapter`**

Update the class declaration:

```typescript
export class OperationalStorageAdapter
  implements TriggerRepository, ExecutionRepository, ExecutionSessionRepository, BreachEpisodeRepository
```

Implement `recordInRange` as a **transactional** close path:
- Wrap in `db.transaction()`
- SELECT open episode for `positionId` `FOR UPDATE`
- If none, return `{ kind: 'no-op' }`
- UPDATE to closed with `status = 'closed'`, `close_reason = 'position-recovered'`, `closed_at = observedAt`
- Return `episode-closed-recovered`

Implement `recordOutOfRange` as a **transactional** state transition:
- Wrap in `db.transaction()`
- SELECT open episode for `positionId` `FOR UPDATE`
- If none: INSERT new episode, return `episode-started`
- If same direction and `observedAt > last_observed_at`: UPDATE `consecutive_count + 1`, `last_observed_at`, return `episode-continued`
- If same direction and `observedAt <= last_observed_at`: return `episode-continued` with current state (idempotent no-op)
- If opposite direction: UPDATE old to closed with `direction-reversed`, INSERT new episode, return `episode-reversed`

Implement `getOpenEpisode`:
- SELECT where `position_id = ? AND status = 'open'`

Implement `finalizeQualification` — **this is the sole trigger persistence path**:
- Wrap in `db.transaction()`
- SELECT episode `FOR UPDATE`
- If `trigger_id` is already set, return `{ kind: 'duplicate-suppressed', existingTriggerId }`
- INSERT trigger into `exit_triggers` using the episode unique constraint as a backstop
- If the insert conflicts / is a no-op, re-read the existing trigger by `episode_id` and return `duplicate-suppressed`
- UPDATE `breach_episodes.trigger_id` to the new trigger ID
- Return `{ kind: 'qualified', triggerId }`

- [ ] **Step 2: Remove old episode/dedup methods**

Delete `saveEpisode` and `getActiveEpisodeTrigger`. They are replaced by the new transition methods and `finalizeQualification`.

- [ ] **Step 3: Add `listAwaitingSignatureAttemptsByEpisode`**

```typescript
async listAwaitingSignatureAttemptsByEpisode(
  episodeId: BreachEpisodeId,
): Promise<StoredExecutionAttempt[]> {
  const rows = await this.db
    .select()
    .from(executionAttempts)
    .where(
      sql`${executionAttempts.episodeId} = ${episodeId} AND ${executionAttempts.lifecycleStateKind} = 'awaiting-signature'`,
    );

  return rows.map((row) => this.mapAttemptRow(row));
}
```

- [ ] **Step 4: Update attempt persistence to include `episodeId`**

Update `saveAttempt` and `getAttempt` to write/read `episodeId`.

- [ ] **Step 5: Remove or adapt stale `saveTrigger` implementation**

Since qualification writes now go through `finalizeQualification`, remove or adapt any old `saveTrigger` implementation to match the new `TriggerRepository` interface from Task 2.

- [ ] **Step 6: Run type check**

Run: `cd packages/adapters && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/outbound/storage/OperationalStorageAdapter.ts
git commit -m "feat: implement BreachEpisodeRepository and atomic trigger finalization in storage adapter"
```

---

## Task 10: Wire Composition Root

**Files:**
- Modify: `packages/adapters/src/composition/AdaptersModule.ts`

- [ ] **Step 1: Add `BREACH_EPISODE_REPOSITORY` provider**

Import the token and add to `sharedProviders`:

```typescript
import { BREACH_EPISODE_REPOSITORY } from '../inbound/jobs/tokens.js';

// In sharedProviders:
{ provide: BREACH_EPISODE_REPOSITORY, useValue: operationalStorage },
```

`operationalStorage` implements `BreachEpisodeRepository` after Task 9.

- [ ] **Step 2: Verify `EXECUTION_HISTORY_REPOSITORY` is exported/injectable**

Confirm `EXECUTION_HISTORY_REPOSITORY` is already available for `BreachScanJobHandler`.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/src/composition/AdaptersModule.ts
git commit -m "feat: wire BreachEpisodeRepository in composition root"
```

---

## Task 11: Thread `episodeId` Through Trigger-Derived Execution Attempt Creation

**Files:**
- Modify: `packages/application/src/use-cases/execution/RequestWalletSignature.ts`
- Modify: trigger/approval caller(s) that invoke `requestWalletSignature`

- [ ] **Step 1: Thread `episodeId` into trigger-derived attempt creation**

For any trigger-derived execution attempt, `episodeId` must be propagated from the trigger/approval context into `requestWalletSignature` and persisted on the attempt. Optional typing is only for legacy/manual paths created before this feature.

Add `episodeId?: BreachEpisodeId` to `requestWalletSignature` params and pass it through to `saveAttempt`:

```typescript
await executionRepo.saveAttempt({
  attemptId,
  previewId,
  positionId: previewRecord.positionId,
  breachDirection: previewRecord.breachDirection,
  episodeId: params.episodeId,
  lifecycleState: { kind: 'awaiting-signature' },
  completedSteps: [],
  transactionReferences: [],
});
```

- [ ] **Step 2: Modify upstream trigger/approval flow so trigger-derived requests always carry `episodeId`**

Search for the caller that invokes `requestWalletSignature` from the actionable trigger / approval flow. Add `episodeId` to that DTO or call path and pass it through unconditionally for trigger-derived flows.

- [ ] **Step 3: Add a guard for trigger-derived flows**

If `requestWalletSignature` is being called for a trigger-derived execution and `episodeId` is missing, throw an error instead of silently creating an unlinked attempt.

- [ ] **Step 4: Run application tests**

Run: `cd packages/application && npx vitest run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/use-cases/execution/RequestWalletSignature.ts
git commit -m "feat: require episodeId for trigger-derived execution attempts"
```

---

## Task 12: Verify Abandoned State in Signing Flow

**Files:**
- No code changes expected — verification only unless a small gap is found

- [ ] **Step 1: Verify `abandoned` is terminal in signing flow**

Search the UI/frontend codebase for how `abandoned` is rendered on the signing page and result page.

Check:
- Does the signing screen stop prompting for wallet signature when state is `abandoned`?
- Does the result page show a sensible message for `abandoned`?
- Does any polling endpoint return `abandoned` correctly?

- [ ] **Step 2: If gaps are found, create follow-up tasks or minimal fixes**

If `abandoned` is not handled correctly, record the exact gaps. Apply only minimal fixes required to correctly reflect terminal abandoned state.

- [ ] **Step 3: Commit (if any small fixes were needed)**

---

## Task 13: Full Type Check + Test Suite + Search Cleanup

**Files:**
- None — verification only

- [ ] **Step 1: Run full type check across all packages**

```bash
npx tsc --noEmit -p packages/domain/tsconfig.json && \
npx tsc --noEmit -p packages/application/tsconfig.json && \
npx tsc --noEmit -p packages/adapters/tsconfig.json && \
npx tsc --noEmit -p packages/testing/tsconfig.json
```

Expected: PASS.

- [ ] **Step 2: Run focused grep checks for removed surfaces**

Run:

```bash
rg "qualifyTrigger" packages/
rg "getActiveEpisodeTrigger|saveEpisode|saveTrigger" packages/
```

Expected:
- no production `qualifyTrigger` imports
- no stale episode/trigger write method usage
- any remaining `saveTrigger` references should be test-only leftovers you intentionally retained, otherwise remove them

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests PASS.

- [ ] **Step 4: Fix failures and stale references**

Common remaining issues:
- old tests still referencing removed `TriggerRepository` methods
- missing `episodeId` in trigger-derived test setup
- stale constructor wiring in `BreachScanJobHandler.test.ts`
- lingering `qualifyTrigger` imports
- stale `saveTrigger` implementations/imports after interface cleanup

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve remaining type errors and test failures from breach episode lifecycle refactor"
```

---

## Policy Notes for Implementer

1. **When `listAwaitingSignatureAttemptsByEpisode` returns >1 result:** log a warning (integrity violation), then abandon all of them. This is not a user-facing error.

2. **Direction reversal starts a fresh episode at `consecutiveCount = 1`.** It does not immediately qualify. The new episode must still reach threshold `3` via normal scan accumulation.

3. **`observedAt` must be truncated to minute boundary** before passing to `recordOutOfRange` / `recordInRange`. The truncation belongs in `ScanPositionsForBreaches` where `clock.now()` is read. Use:
   `Math.floor(now / 60_000) * 60_000`.

4. **Trigger finalization is the only write path for exit triggers in this feature.** Do not reintroduce a second write path from `QualifyActionableTrigger` or a job handler.

5. **For trigger-derived execution attempts, missing `episodeId` is a correctness bug.** Fail fast instead of creating an unlinked attempt that cannot later be abandoned precisely.
