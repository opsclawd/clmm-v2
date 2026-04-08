# Working MVP End-to-End Out-of-Range Flow Design

**Goal:** Complete the remaining stubbed and disconnected parts of CLMM V2 so a connected wallet can progress from a real out-of-range Orca position to an actionable trigger, directional preview, explicit user-approved execution, lifecycle result, and durable history in a backend-triggered MVP flow.

**Scope:** This design covers the remaining monitoring, trigger, preview, execution, history, notification, and app-route wiring needed to make the current codebase behave like the intended MVP. It does not expand product scope beyond Orca-only, non-custodial, user-signed exits.

---

## Current State Summary

The codebase already has meaningful pieces of the MVP:

- Supported position reads work through the BFF and browser app.
- Range state detection exists and can identify `in-range`, `below-range`, and `above-range` positions.
- Directional preview, execution, and reconciliation application use cases exist.
- Backend HTTP controllers exist for positions, alerts, previews, and executions.
- UI screens exist for alerts, position detail, preview, signing, result, and history.

The remaining gap is that these pieces do not yet form a real backend-triggered product path:

- worker jobs are still stubbed
- alerts are not created automatically from monitoring
- app routes are mostly thin re-exports without live data wiring
- preview and execution routes are not driven by backend state
- notification and deep-link re-entry are not fully connected
- there is no durable wallet-monitoring registry, so the worker has no authoritative set of wallets to scan

---

## Recommended Delivery Approach

Use a **vertical-slice completion** strategy.

Why this approach:

- It matches the actual user journey rather than finishing isolated subsystems in the abstract.
- It turns already-implemented backend and UI pieces into a reachable end-to-end flow.
- It keeps the directional invariant visible across monitoring, alerting, preview, signing, and result states.
- It produces a real MVP instead of a browser demo or a backend-only foundation.

Alternatives considered but not recommended:

- Backend-first completion would leave too much of the app stubbed for too long.
- Frontend-first wiring would still not produce a true backend-triggered MVP.

---

## Architecture

The MVP should operate with one authoritative flow:

1. The backend worker detects a breach.
2. The backend qualifies and persists an actionable trigger.
3. The app fetches actionable backend state for the wallet.
4. The user opens a position or alert and views a backend-generated directional preview.
5. The user explicitly approves and signs.
6. The backend submits, reconciles, and persists lifecycle transitions.
7. The app renders result and history from backend truth.

State ownership should remain strict:

- **Backend truth:** triggers, previews, execution attempts, execution sessions, history, reconciliation status
- **App truth:** wallet session, capabilities, route state, cached query results

The directional invariant remains unchanged and must dominate the flow:

- lower-bound breach -> remove liquidity -> collect fees -> swap `SOL -> USDC` -> exit-to-usdc
- upper-bound breach -> remove liquidity -> collect fees -> swap `USDC -> SOL` -> exit-to-sol

No adapter or UI layer may re-derive direction from token order.

---

## Backend Flow

### 1. Monitoring and Breach Observation

`BreachScanJobHandler` becomes the runtime entrypoint for scheduled monitoring.

This requires one additional MVP-owned concept: a durable monitored-wallet registry.

The backend needs a persisted list of wallet ids that opted into monitoring so scheduled scans know which wallets to process.

Responsibilities:

- load monitored wallets from durable storage
- load supported positions for a wallet
- call `scanPositionsForBreaches`
- produce breach observations only for `below-range` and `above-range`
- record observability timing for detection
- enqueue qualification work for each observation

Constraints:

- scanning is recoverable and idempotent at the job boundary
- only supported positions participate
- no trigger persistence happens directly in the scan handler
- monitoring enrollment is created from wallet-connect or explicit monitoring enablement and survives app restarts

### 2. Trigger Qualification

`TriggerQualificationJobHandler` becomes the only path that turns an observation into an actionable trigger.

Responsibilities:

- load observation context
- call `qualifyActionableTrigger`
- persist trigger and breach episode updates through repositories
- suppress duplicates within an active episode
- enqueue notification dispatch only after a trigger is created

Constraints:

- qualification remains direction-aware
- trigger persistence is repository-backed and durable
- non-qualified observations do not leak into user-visible alerts

### 3. Query Surfaces in the BFF

The BFF should expose real wallet-scoped state for the app:

- `GET /positions/:walletId`
- `GET /alerts/:walletId`
- `GET /positions/:positionId/detail` or equivalent detail route
- preview creation/refresh route keyed from trigger state
- execution attempt lookup route
- execution history route

The BFF should not trust inferred client-side state when a backend ID exists.

### 4. Preview Creation and Refresh

Preview creation must be trigger-driven.

Responsibilities:

- resolve trigger -> positionId + breachDirection
- create or refresh directional preview through application use cases
- expose preview freshness honestly
- preserve ordered execution steps and post-exit posture

Constraints:

- stale preview blocks signing until refreshed
- preview stays tied to trigger direction

### 5. Approval, Submission, and Reconciliation

Execution stays non-custodial and explicit.

Responsibilities:

- approval creates or advances a backend execution attempt
- backend prepares serialized payload for the wallet
- client signs
- backend submits signed payload
- reconciliation updates lifecycle state to `confirmed`, `failed`, `partial`, or leaves pending
- history appends on every relevant lifecycle event

Constraints:

- submitted is never treated as confirmed
- partial execution is terminal for blind replay purposes
- decline, interruption, abandonment, and retry eligibility remain explicit

### 6. Notifications and Re-entry

Notifications are overlays, not the source of truth.

Responsibilities:

- dispatch best-effort actionable notifications once a trigger exists
- record dispatch timing separately from breach detection timing
- deep links reopen into trigger/preview/history context using backend IDs

Constraints:

- if notification delivery fails, alert visibility in-app must still work
- deep-link resolution must hydrate from backend state, not stale client state

---

## App Flow

### Positions Tab

The positions tab should:

- fetch supported positions for the connected wallet
- show real backend range state
- navigate to position detail on selection

It should no longer be a terminal surface. It becomes the first step into the review flow.

The connected wallet flow should also ensure backend monitoring enrollment exists for that wallet, so the worker can discover it later without relying on an in-memory client session.

### Alerts Tab

The alerts tab should:

- fetch live actionable alerts from the BFF
- show directional state prominently
- navigate into the affected position or directly into preview context

Wallet-scoped alerts must come from backend trigger state, not from local heuristics.

### Position Detail Route

The position detail route should:

- fetch live detail for a specific position
- join or fetch linked actionable alert state
- expose directional copy when the position is out of range and actionable
- provide `View Exit Preview` only when a relevant trigger exists

### Preview Route

The preview route should:

- resolve from `triggerId`
- fetch or create a backend preview
- show ordered steps, freshness, and directional posture
- allow refresh when stale
- start approval flow from backend truth

### Signing Route

The signing route should:

- render backend attempt state
- preserve handoff/re-entry semantics
- distinguish awaiting signature, interrupted, declined, and submitted paths

### Result and History Routes

The result route should:

- fetch the backend attempt record
- show lifecycle status and transaction references
- expose retry only when backend eligibility says so

The history route should:

- fetch durable off-chain history
- show directional context through all execution events

---

## Execution Boundaries

The MVP execution path must remain split into three explicit stages.

### Preview Stage

- backend builds directional plan and freshness state
- app displays exact ordered steps
- stale or expired preview blocks progression until refreshed

### Approval and Signing Stage

- backend creates or advances an execution attempt
- backend prepares payload
- client wallet signs
- backend records decline or interruption explicitly

### Submission and Reconciliation Stage

- backend submits signed payload
- reconciliation updates final lifecycle state
- result and history screens read that backend truth

Absolute constraints:

- no auto-execution
- no backend signing authority
- no blind retry after partial completion

---

## Testing and Verification Strategy

### Domain and Application

Preserve and extend tests for:

- monitoring enrollment and wallet-scan selection
- scan -> qualify transition
- directional preview generation for both breach directions
- approval/sign/submit/reconcile lifecycle transitions
- stale preview refresh behavior
- retry eligibility boundaries, especially partial execution cases

### Adapters and Backend Integration

Add or extend tests for:

- worker job handlers using fakes first
- monitored-wallet storage and query behavior
- BFF controllers for positions, alerts, preview, execution, history
- storage-backed trigger and preview persistence
- notification dispatch behavior and degraded paths

### App and Route Integration

Add route-level tests for:

- positions list -> detail navigation
- alerts list -> detail/preview navigation
- preview fetch/refresh/approve flow
- signing/result/history route hydration from backend IDs

### Manual Verification

The final MVP must be manually verified with this user journey:

1. connect wallet
2. see supported position
3. observe out-of-range state
4. see actionable alert
5. open directional preview
6. approve and sign
7. see submitted/result lifecycle state
8. review durable history

---

## Delivery Phases

### Phase 1: Monitoring and Trigger Pipeline

Complete the worker path:

- monitored wallet registry and enrollment path
- breach scan job
- qualification job
- episode/trigger persistence
- reconciliation job skeleton to real orchestration

Done when out-of-range positions can produce durable actionable triggers without manual intervention.

### Phase 2: BFF Query Completion

Complete and normalize backend query surfaces:

- alerts by wallet
- position detail
- preview create/refresh
- execution attempt lookup
- history lookup

Done when the app has all backend endpoints needed for the end-to-end flow.

### Phase 3: App Route Wiring

Replace thin exports with route components that fetch live backend data for:

- alerts
- position detail
- preview
- signing
- result
- history

Done when the app can navigate through the review flow using backend-backed IDs.

### Phase 4: Approve, Sign, Submit, Reconcile

Wire preview approval to:

- attempt creation
- payload preparation
- wallet signing
- submission
- reconciliation polling or result hydration

Done when one user-signed exit attempt can progress from preview to backend lifecycle result.

### Phase 5: Notifications and Deep-Link Re-entry

Finish:

- best-effort actionable notifications
- deduplication behavior
- deep-link resolution into trigger/preview/history context

Done when the MVP supports backend-triggered re-entry without inventing local-only state.

---

## Non-Goals

This design does not add:

- autonomous execution
- portfolio analytics
- multi-protocol support
- multi-chain support
- backend custody or signing
- on-chain receipts, attestations, proofs, or claim verification concepts

---

## Acceptance Standard For MVP Completion

The MVP is complete when:

- a real supported Orca position can be read for a connected wallet
- an out-of-range position can become an actionable trigger through backend jobs
- the app can show the resulting alert and directional preview
- the user can explicitly approve and sign
- backend submission and reconciliation update lifecycle state honestly
- off-chain history records the trigger, preview, signing, submission, and terminal outcome
- deep-link and notification paths degrade honestly without breaking core review/execution flows
