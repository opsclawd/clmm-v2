# Design: Breach Episode Deduplication & Stale Attempt Cancellation

**Story:** [breach-episode-deduplication-and-stale-attempt-cancellation](../stories/2026-04-03-breach-episode-deduplication-and-stale-attempt-cancellation.md)
**Date:** 2026-04-04

---

## Problem

The breach detection pipeline has three structural defects:

1. **Confirmation threshold is never enforced.** `TriggerQualificationJobHandler` hardcodes `consecutiveCount: 3` and passes it directly to `qualifyTrigger`, where the domain check is `consecutiveOutOfRangeCount >= 3`. The condition is always true. Every single observation qualifies immediately.

2. **Episode ID regenerated on every scan.** `ScanPositionsForBreaches` calls `ids.generateId()` for `episodeId` on every execution. Because `episodeId` is different each minute, `getActiveEpisodeTrigger(episodeId)` never finds the existing trigger for an ongoing breach. Duplicate suppression is unreachable. A new trigger and notification is created on every scan cycle.

3. **Stale execution attempts are never cancelled.** When a position returns to range or breaches in the opposite direction, any existing `awaiting-signature` execution attempt is left open indefinitely. `RecordExecutionAbandonment` exists but is never called by the worker.

---

## Design

### 1. Episode Lifecycle Model

The `breach_episodes` table is the source of truth for breach lifecycle. An episode record is created the first time a position is observed out of range, reused across subsequent scans in the same breach, and closed when the position recovers, reverses direction, or is otherwise no longer monitored. The database enforces that there can be at most one open episode per `position_id`, preventing duplicate or contradictory open episodes under retries or concurrent scans.

**Schema:**

| Column | Type | Notes |
|---|---|---|
| `episode_id` | PK | Generated once at episode creation via `ids.generateId()` |
| `position_id` | FK | |
| `direction_kind` | enum | `lower-bound` / `upper-bound` |
| `status` | enum | `open` / `closed` |
| `started_at` | timestamp | First out-of-range observation |
| `last_seen_at` | timestamp | Updated every scan tick while open |
| `consecutive_count` | int | Incremented each scan tick while open |
| `trigger_id` | nullable FK | Set once when qualification threshold is reached; dedup anchor |
| `closed_at` | nullable timestamp | Set when episode closes |
| `close_reason` | nullable enum | `position-recovered` / `direction-reversed` |

**Database constraints:**

- Unique partial index: at most one open episode per `position_id` (where `status = 'open'`)
- Check constraint: `closed_at` and `close_reason` must be present when `status = 'closed'`
- Optional index on `(position_id, direction_kind, status)` for historical queries

A position cannot be both below-range and above-range at once. The unique-open-per-position constraint encodes this fact in the data model rather than relying on application logic.

### 2. Scan Behavior

`ScanPositionsForBreaches` becomes a stateful use case that consults persisted breach episode state and records one atomic episode transition per scan result. It emits two outputs: breach observations for trigger qualification and abandonment directives for stale awaiting-signature attempts.

For each position:

- **If the position is in range:** close any open episode with reason `position-recovered` and emit abandonment for any awaiting-signature attempt associated with that episode.
- **If the position is out of range in direction D:**
  - If no open episode exists, create one with `consecutiveCount = 1`.
  - If an open episode exists in direction D, increment its `consecutiveCount` and update `lastSeenAt`.
  - If an open episode exists in the opposite direction, atomically close it with reason `direction-reversed`, open a new episode in direction D with `consecutiveCount = 1`, and emit abandonment for the superseded awaiting-signature attempt.

The application layer does not orchestrate multi-step close/open transaction flows manually. The persistence port provides atomic state-transition operations so uniqueness and lifecycle invariants remain enforced under retries and concurrent scans.

**Output shape:**

- `observations[]` — for trigger qualification. Each carries `episodeId`, `consecutiveCount`, `direction`, `positionId`, `observedAt`.
- `abandonments[]` — for stale attempt cancellation. Each carries `positionId`, `episodeId`, `reason`.

### 3. Qualification Changes

`TriggerQualificationJobHandler` must pass the real `consecutiveCount` emitted by scan-time episode transitions instead of hardcoding `3`. The domain qualification rule itself remains valid: below threshold is not qualified, an already-triggered episode is duplicate-suppressed, and the threshold-crossing observation qualifies.

Deduplication has a single source of truth: `breach_episodes.trigger_id`. `QualifyActionableTrigger` reads the episode, suppresses if `trigger_id` is already set, suppresses if `consecutiveCount < threshold`, and otherwise atomically creates the trigger and attaches it to the episode.

**Atomicity contract:**

- Row-lock the episode before qualification decision
- Check `trigger_id` — if set, return `duplicate-suppressed`
- Check `consecutiveCount` against threshold — if below, return `not-qualified`
- Create trigger, set `episode.trigger_id`, commit
- Unique constraint on `exit_triggers.episode_id` as database backstop

Duplicate suppression is a normal result type, not an exception. The qualification method returns a discriminated union: `qualified`, `duplicate-suppressed`, or `not-qualified`.

**Removed:** `getActiveEpisodeTrigger(episodeId)` — replaced by episode-authoritative dedup inside the atomic qualification path.

### 4. Abandonment Path

`ScanPositionsForBreaches` emits abandonment directives whenever an open episode is closed due to `position-recovered` or `direction-reversed`. `BreachScanJobHandler` processes these inline by resolving the affected `awaiting-signature` execution attempt and calling `RecordExecutionAbandonment`. No separate job queue — this is a simple terminal-state transition that does not benefit from independent retry semantics.

**Abandonment targeting:** Directives carry `{ positionId, episodeId, reason }`. The execution port looks up awaiting-signature attempts linked to the closed episode, not broad position-level lookup. This ensures abandonment precisely invalidates the stale attempt associated with the closed or superseded episode.

**Idempotency:** If the same abandonment directive is processed twice due to retries, race conditions, or repeated scans before state propagation, `RecordExecutionAbandonment` must behave safely:

- Abandoning an already-abandoned attempt is a no-op.
- Abandoning a non-awaiting-signature attempt rejects in a controlled, non-fatal way.

**Signing page:** Once an attempt reaches `abandoned`, the signing flow treats it as terminal and stops prompting for signature. This must be explicitly verified during implementation — the enum existing in code does not prove the screen handles it correctly.

### 5. Port and Repository Changes

**New: `BreachEpisodeRepository`** — dedicated port for episode lifecycle, separate from `TriggerRepository`. Episodes are their own aggregate boundary, not a trigger implementation detail.

Atomic state-transition methods:

| Method | Behavior |
|---|---|
| `recordInRange(positionId, observedAt)` | If open episode exists: close with reason `position-recovered`, return `episode-closed-recovered` with episode details. Otherwise: return `no-op`. |
| `recordOutOfRange(positionId, direction, observedAt)` | No open episode: create new, return `episode-started` with new episode. Same-direction open episode: increment count, return `episode-continued` with updated episode. Opposite-direction open episode: atomically close old + create new, return `episode-reversed` with both episode IDs. |

Returns a rich `EpisodeTransition` discriminated union. Each variant carries all IDs, counts, and direction info needed by downstream qualification and abandonment. Callers do not infer hidden facts.

`EpisodeTransition` variants:

- `no-op` — position was in range, no open episode existed
- `episode-closed-recovered` — open episode closed; carries `closedEpisodeId`, `direction`
- `episode-started` — new episode created; carries `episodeId`, `direction`, `consecutiveCount`
- `episode-continued` — existing episode incremented; carries `episodeId`, `direction`, `consecutiveCount`
- `episode-reversed` — old episode closed, new episode created; carries `closedEpisodeId`, `newEpisodeId`, `oldDirection`, `newDirection`, `consecutiveCount`

A separate `getOpenEpisode(positionId)` read method may exist for query paths but is not required by the scan workflow.

**Qualification port:**

| Method | Behavior |
|---|---|
| `finalizeQualification(episodeId, trigger)` | Row-lock episode, check `trigger_id`, insert trigger, set `episode.trigger_id`. Returns `qualified` or `duplicate-suppressed`. |

Threshold evaluation stays in the application/domain layer before this call. The port method atomically finalizes trigger creation for an episode that is believed eligible.

**Execution port addition:**

| Method | Returns |
|---|---|
| `listAwaitingSignatureAttemptsByEpisode(episodeId)` | `StoredExecutionAttempt[]` — returns a list so integrity violations surface rather than hiding behind a silent `LIMIT 1` |

Position-only lookup (`listAwaitingSignatureAttemptsForPosition`) may exist as fallback but is not the primary design.

**Removed:**

- `getActiveEpisodeTrigger(episodeId)` — replaced by episode-authoritative dedup
- `ids` dependency in `ScanPositionsForBreaches` — episode IDs are created inside the persistence port

### 6. What Does Not Change

What does not change is the business intent and the downstream user flow: the qualification rule remains the same, `RecordExecutionAbandonment` is reused rather than redesigned, notification dispatch remains downstream of trigger creation, the confirmation threshold stays at 3, the breach-scan schedule stays unchanged, and no new UI scope is introduced beyond correctly reflecting `abandoned`.

However, some application-service and persistence boundaries will still change to support persisted episodes, atomic deduplication, and precise abandonment targeting. AC-5 (no regression on the happy path) is about no regression in outcome, not zero code changes.

---

## Acceptance Criteria Traceability

| AC | Satisfied by |
|---|---|
| AC-1: Stable episode ID | Section 1 (persisted episodes) + Section 2 (reuse across scans) |
| AC-2: Real consecutive count | Section 2 (episode tracks count) + Section 3 (pass real count) |
| AC-3: Duplicate suppression | Section 3 (episode-authoritative dedup with DB backstop) |
| AC-4: Stale attempt abandonment | Section 4 (inline abandonment with episode-targeted lookup) |
| AC-5: No happy-path regression | Section 6 (same business flow, same outcomes) |
