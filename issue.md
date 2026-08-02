# asOfUnixMs captured before observedAtUnixMs causes ordering validation failure on every breach-qualified plan request

## Summary

With #121/PR #122 deployed, the `exitIntent` schema-drift bug is fixed and confirmed live — but the worker's own natural cron-triggered plan requests for breach-qualified positions now fail with a _new_, distinct error:

```
RegimePlan validation error reason="position.observedAtUnixMs (1785674137891) must not exceed asOfUnixMs (1785674137760)" statusClass="permanent"
```

`observedAtUnixMs` is ~131ms _later_ than `asOfUnixMs` in the actual request sent to `regime-engine`. This is not a vendoring/schema-drift bug — `regime-engine` correctly rejects it, per its own real validation rule (`src/contract/v1/validation.ts:217`: `if (parsed.position.observedAtUnixMs > parsed.asOfUnixMs) { ... "observedAtUnixMs is in the future relative to asOfUnixMs" }`). The bug is in how `clmm-v2` constructs the request.

## Root cause

In `packages/application/src/use-cases/plans/RequestPositionPlan.ts`:

- Line 145: `const now = clock.now();` — captured right after the _first_ position fetch (`positionReadPort.getPosition(...)`), used later as `asOfUnixMs` when building the regime plan request.
- Later, inside `executeWork`, `positionReadPort.getPositionDetail(walletId, positionId)` is called — a _second_, separate live Solana RPC round-trip. Inside `OrcaPositionReadAdapter`/`SolanaPositionSnapshotReader`, this stamps `lastObservedAt: makeClockTimestamp(Date.now())` — a **fresh** timestamp taken _after_ that RPC call completes.
- `buildRegimePlanRequest` (`buildRegimePlanRequest.ts:159`) sets `observedAtUnixMs: positionDetail.position.lastObservedAt`, but reuses the stale `asOfUnixMs: now` captured before the second RPC call even started.

Since the RPC round-trip for `getPositionDetail` takes real wall-clock time (~131ms observed), `observedAtUnixMs` (stamped after) ends up later than `asOfUnixMs` (stamped before), violating regime-engine's ordering invariant on every request where a qualified trigger exists — which is precisely the breach/exit scenario the whole plan-submission chain exists for.

## Evidence

Live `railway logs -s clmm-worker` (worker's own natural cron cycle, not manually triggered), 2026-08-02T12:35:38Z, position `57DoQihsbyFy53R5DbcvoCbJDdscuNhd37GvxNX6nhqF`:

```
[INFO] RequestPositionPlan: qualified trigger outranks permanent error breachDirection="lower-bound-breach" ...
[WARN] RegimePlan validation error reason="position.observedAtUnixMs (1785674137891) must not exceed asOfUnixMs (1785674137760)" statusClass="permanent" durationMs=41
[INFO] PositionPlanRequestJobHandler completed with status superseded status="superseded" ...
```

## Fix

Capture `asOfUnixMs` fresh, via `clock.now()`, _after_ `positionReadPort.getPositionDetail(...)` resolves — immediately before calling `buildRegimePlanRequest` — instead of reusing the `now` captured at the top of `requestPositionPlan` (which is legitimately still used for the earlier staleness check against the first `position` fetch; that usage is unaffected and should NOT change).

## Acceptance criteria

- [ ] `RequestPositionPlan.ts`'s call to `buildRegimePlanRequest` uses a timestamp captured after `getPositionDetail` resolves, not the earlier claim-time `now`.
- [ ] Add a regression test asserting `asOfUnixMs >= observedAtUnixMs` in the built request even when `getPositionDetail` is simulated as taking non-zero time.
- [ ] Live-verified: a real breach-qualified position on `clmm-worker`'s own natural cron cycle produces a `{"kind":"ok"}` result with a `REQUEST_EXIT_CLMM` action (not `superseded`/`permanent`).
