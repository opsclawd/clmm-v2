# User Story: Breach Episode Deduplication & Stale Attempt Cancellation

## Summary

As a user with a monitored liquidity position, I want the system to correctly
detect sustained out-of-range breaches (not fire on every scan), deduplicate
triggers within a breach episode, and automatically invalidate stale execution
attempts when market conditions change — so I am never prompted to exit a
position that has recovered or reversed direction.

---

## Background

The current breach detection pipeline has two structural defects that cause
incorrect behaviour in all non-trivial market scenarios.

### Defect 1 — Confirmation threshold is not enforced

`TriggerQualificationJobHandler` hardcodes `consecutiveCount: 3` and passes it
directly to `qualifyTrigger` as `consecutiveOutOfRangeCount`. The domain check
is `consecutiveOutOfRangeCount >= MVP_CONFIRMATION_THRESHOLD (3)`, so the
condition is always true. Every single observation qualifies immediately,
regardless of how many times the position has actually been observed out of
range.

**Affected files:**
- `packages/adapters/src/inbound/jobs/TriggerQualificationJobHandler.ts` — line 56
- `packages/domain/src/triggers/TriggerQualificationService.ts` — line 39

### Defect 2 — Episode ID regenerated on every scan, breaking deduplication

`scanPositionsForBreaches` calls `ids.generateId()` for `episodeId` on every
execution (`ScanPositionsForBreaches.ts:32`). Because `episodeId` is different
each minute, `getActiveEpisodeTrigger(episodeId)` never finds the existing
trigger for the ongoing breach. The duplicate-suppression branch in
`qualifyTrigger` is never reached. A new trigger (and notification) is created
on every scan cycle for as long as the position remains out of range.

**Affected files:**
- `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts` — line 32
- `packages/application/src/use-cases/triggers/QualifyActionableTrigger.ts` — line 20

### Defect 3 — Stale execution attempts are never cancelled

When a position returns to range, or breaches in the opposite direction, any
existing `awaiting-signature` execution attempt is left open indefinitely. The
worker has no path to mark attempts `abandoned`. A user who delays signing will
eventually be prompted to execute an exit that is no longer warranted, or will
have two competing signing prompts for opposite directions simultaneously.

**Affected files:**
- `packages/application/src/use-cases/triggers/ScanPositionsForBreaches.ts` — no abandonment output
- `packages/adapters/src/inbound/jobs/BreachScanJobHandler.ts` — no abandonment dispatch
- `packages/application/src/use-cases/execution/RecordExecutionAbandonment.ts` — exists but is never called by the worker

---

## Acceptance Criteria

### AC-1: Episode ID is stable for the duration of a breach episode

- A breach episode begins the first time a position is observed out-of-range in
  a given direction.
- The episode ID is deterministic and stable: it must be the same value for
  every subsequent scan that observes the same position out-of-range in the same
  direction, until the position returns to range.
- When the position returns to range, the episode ends. If it breaches again
  later (even in the same direction), a new episode ID is generated.
- Episode ID derivation must survive worker restarts (i.e. it cannot be held
  only in memory).

### AC-2: Consecutive observation count is actually accumulated

- The system must count how many consecutive scans have observed the position
  out-of-range within the current episode.
- A trigger is only created once the count reaches the confirmation threshold (3
  by default).
- If the position returns to range before the threshold is reached, the
  accumulated count is discarded. A subsequent breach starts a fresh count.
- `consecutiveCount` passed to `qualifyActionableTrigger` must reflect the real
  accumulated count, not a hardcoded value.

### AC-3: Duplicate triggers within an episode are suppressed

- Once a trigger has been created for an episode, no further triggers are
  created for the same episode, regardless of how many additional scans observe
  the position out-of-range.
- This is the existing `duplicate-suppressed` path in `qualifyTrigger`; it must
  now actually be reachable.

### AC-4: Stale awaiting-signature attempts are abandoned when conditions change

The worker must abandon an open `awaiting-signature` attempt when either of the
following is detected during a scan:

| Condition | Action |
|-----------|--------|
| Position is back in-range | Abandon the attempt; reason: `position-recovered` |
| Position breached in the opposite direction | Abandon the attempt; reason: `direction-reversed` |

- Abandonment must call `RecordExecutionAbandonment` for the affected attempt.
- After abandonment, the signing page (`/signing/:attemptId`) must reflect the
  `abandoned` state and stop prompting the user to sign.
- A direction reversal should subsequently trigger the normal approval flow for
  the new direction (subject to AC-2 threshold).

### AC-5: No regression on the happy path

- A position that breaches, stays out-of-range for ≥ 3 consecutive scans, and
  is never abandoned still produces exactly one trigger and one execution attempt.
- Signing and submitting that attempt still works end-to-end.

---

## Out of Scope

- Changing the confirmation threshold from 3 (configurable threshold is a
  separate story).
- UI changes beyond reflecting the `abandoned` lifecycle state (the signing page
  already routes to the result page on terminal states).
- Handling partial fills or re-entry after a successful exit.
