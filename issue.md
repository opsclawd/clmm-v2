# feat: integrate the current position-scoped Regime plan and execution-result loop

## Summary

Integrate clmm-v2 with Regime Engine's **current position-scoped** plan → user decision/execution → execution-result audit loop.

The previous issue body described an obsolete broad portfolio-allocation contract with inline candles and autonomous enter/rebalance actions. That design is superseded.

## Correct boundary

```text
Regime Engine -> advisory position-scoped plan and audit ledger
clmm-v2       -> live position truth, breach qualification, execution safety, UX, signing, and actual result
```

Regime Engine never signs or submits transactions. clmm-v2 never delegates deterministic stop-loss safety or live execution authority to Regime availability.

## Canonical contract pinning

Before this issue is enqueued, update this body with the merged/live Regime Engine contract artifacts:

```text
Regime Engine contract commit: <merged SHA>
Plan request schema/OpenAPI path: <path>
Plan response schema/OpenAPI path: <path>
Execution-result schema/OpenAPI path: <path>
Schema/API version: <version>
Contract artifact SHA-256: <hash if applicable>
Authentication/private-network semantics: <documented behavior>
```

Do not reimplement the request or response from examples in this issue. Generate or centralize client validation from the pinned machine-readable contract.

## Superseded behavior — remove from scope

Do not implement:

- inline OHLCV candles in the plan request;
- client-authored regime state;
- broad portfolio target allocations such as `solBps`/`usdcBps`;
- `REQUEST_ENTER_CLMM`;
- `REQUEST_REBALANCE`;
- autonomous position opening;
- execution of multiple portfolio actions from one plan;
- the old five-action table from the previous body.

Regime Engine owns canonical stored candles and current regime state. The MVP plan contract is position-scoped.

## Supported plan actions

Consume only the action types in the current MVP contract:

```text
HOLD
STAND_DOWN
REQUEST_EXIT_CLMM
```

Unknown actions or schema versions must fail closed and remain unexecuted.

`REQUEST_EXIT_CLMM` is a request for the existing close/collect/swap preview-and-sign flow. It is not permission to bypass user approval or execution-safety checks.

## Plan request

Request a plan for one current position using the exact pinned Regime schema.

The request must be built from authoritative clmm-v2 application/domain state and should include only fields supported by the live contract, such as:

- position and pool identity;
- observation/as-of timestamp;
- current range state and boundary/tick context;
- position freshness;
- deterministic qualified-trigger state when the contract supports it;
- current liquidity, fee/reward, or inventory context only when authoritative and contractually required;
- current stand-down/cooldown or execution-attempt state when owned by clmm-v2.

No source API/RPC calls should be duplicated solely to satisfy fields Regime already owns.

## Freshness and availability

- Reject or stand down on stale local position state according to the current plan contract.
- Timeouts, `5xx`, malformed responses, unknown versions, and Regime unavailability must degrade the advisory plan feature explicitly.
- Regime failure must **not** disable clmm-v2 monitoring, breach debounce/qualification, notifications, preview creation, or deterministic stop-loss execution.
- Do not substitute a cached plan as current unless the contract defines valid expiry and the UI marks it stale/cached.

## Plan persistence and idempotency

Persist enough local state to audit and resume the lifecycle:

- plan ID;
- plan hash/canonical response hash;
- schema version;
- position identity;
- requested/received/as-of/expiry timestamps;
- action and reason codes;
- local decision state;
- linked execution attempt/result identity.

Exact plan replays must be idempotent. Same plan identity with different content must fail as a conflict and remain unexecuted.

## User decision and execution behavior

### `HOLD`

- display/record the advisory result;
- perform no on-chain action;
- post the canonical acknowledgement/result required by the execution-result contract.

### `STAND_DOWN`

- display the stand-down state and reason;
- do not open or rebalance positions;
- do not suppress an already-qualified deterministic breach exit;
- post the canonical acknowledgement/result.

### `REQUEST_EXIT_CLMM`

- route into the existing execution preview → approval → wallet signing → submit → reconcile flow;
- preserve all clmm-v2 checks for current position state, balances, route availability, slippage cap, price impact, fee/priority-fee buffers, transaction freshness, retry limit, and user signature;
- allow the user to decline/skip according to the canonical result-status contract;
- never submit automatically in Phase 1.

If the position has already closed or changed materially since plan creation, fail/skip safely and report the actual reason rather than executing a stale request.

## Execution-result reporting

Post the exact canonical execution result for each accepted plan lifecycle according to the pinned Regime contract.

At minimum preserve:

- plan ID and plan hash;
- position identity;
- requested action;
- actual result status;
- reason/note codes;
- execution attempt/transaction signature where applicable;
- realized costs/amounts only when authoritative;
- resulting position/posture state;
- completion timestamp;
- idempotency identity.

Retry unknown network outcomes with the same idempotency identity and bounded backoff. Do not retry permanent validation/auth/conflict failures indefinitely.

If the app crashes or is closed after accepting a plan but before reporting a terminal result, persist enough state to reconcile/report it on the next launch without double execution.

## Authentication and network boundary

Plan and execution-result routes must use the exact authenticated/private-network semantics documented by the live Regime contract.

Do not create an unauthenticated public write surface. If the live route lacks required internal authentication and is not provably private-only, treat that as a prerequisite Regime issue rather than weakening the client.

## Relationship to deterministic breach execution

The following precedence is mandatory:

```text
qualified clmm-v2 breach + clmm execution safety
> Regime position plan
> pair-level PolicyInsight
```

Examples:

- a qualified lower breach may continue toward the existing exit-to-USDC flow even if Regime is unavailable;
- a `HOLD` plan cannot cancel an already-qualified deterministic breach;
- `STAND_DOWN` prevents discretionary/new activity but cannot trap funds inside an already-breached position;
- a plan may request exit before a breach, but clmm-v2 still requires user approval and all execution checks.

## Scope

In scope:

- pinned contract client/types/validation;
- position-scoped plan request adapter and application use case;
- plan persistence/idempotency/conflict handling;
- UX integration for `HOLD`, `STAND_DOWN`, and `REQUEST_EXIT_CLMM`;
- linking `REQUEST_EXIT_CLMM` into the existing preview/sign/submit/reconcile flow;
- execution-result reporting and crash/retry reconciliation;
- timeout, degraded-state, observability, tests, and docs.

Out of scope:

- inline candle delivery;
- portfolio allocation targets;
- enter/rebalance actions;
- autonomous signing/submission;
- changing Regime synthesis rules;
- PolicyInsight display (#92/#93);
- redesigning the separate breach-event telemetry endpoint unless required by the pinned plan-result contract.

## Guardrails

- clmm-v2 remains execution authority.
- Regime availability never gates deterministic stop-loss protection.
- Only current MVP actions are accepted.
- Unknown action/schema fails closed.
- No duplicate execution on retries or app restart.
- Every reported monetary/cost field must be authoritative or explicitly unavailable.

## Acceptance criteria

- [ ] Issue is pinned to exact current Regime plan and execution-result artifacts before implementation.
- [ ] Plan requests are position-scoped and contain no inline candles or client-authored regime state.
- [ ] Client accepts only `HOLD`, `STAND_DOWN`, and `REQUEST_EXIT_CLMM`.
- [ ] Unknown action/schema, malformed response, stale position, timeout, and Regime-unavailable cases fail/degrade safely.
- [ ] Regime failure does not disable deterministic monitoring, breach qualification, alerts, or the existing user-signed exit flow.
- [ ] `REQUEST_EXIT_CLMM` uses the existing preview/sign/submit/reconcile pipeline and cannot bypass slippage, fee, route, balance, freshness, retry, or signature checks.
- [ ] `HOLD` and `STAND_DOWN` do not suppress an already-qualified breach.
- [ ] Plan ID/hash, lifecycle state, and linked result are persisted for audit and restart recovery.
- [ ] Exact replay is idempotent and conflicting replay fails closed.
- [ ] Canonical execution results are posted for hold, stand-down, executed, failed, declined/skipped, stale, and abandoned/expired outcomes supported by the live contract.
- [ ] Unknown network outcomes retry with the same idempotency identity and do not double execute.
- [ ] Tests cover lower/upper qualified breach precedence, plan outage, stale plan, position-changed-before-signing, user decline, successful exit, failed transaction, app restart, result replay, and conflicting result.

## Dependencies

- Current Regime Engine position-scoped `/v1/plan` and `/v1/execution-result` contracts must be merged and pinned.
- Existing clmm-v2 preview/sign/submit/reconcile flow must remain the execution path.
