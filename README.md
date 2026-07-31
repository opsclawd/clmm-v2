# CLMM V2 — SOL/USDC Stop-Loss Autopilot

CLMM V2 is the product/runtime repo for a non-custodial SOL/USDC Orca Whirlpool exit assistant.

The app watches supported concentrated-liquidity positions, detects out-of-range movement, qualifies actionable breach triggers, generates a directionally explicit execution preview, obtains user approval, submits signed payloads, reconciles execution state, and records off-chain operational history.

This repo owns the user-facing product, the BFF/API, worker jobs, deterministic CLMM orchestration, and the Orca/Jupiter/Solana adapter boundary.

## Current state

CLMM V2 currently provides:

- a mobile-first Expo app with a narrow product surface: Positions, Alerts, History, and Wallet/Settings;
- a NestJS/Fastify BFF that mediates app reads and backend-only integrations;
- a pg-boss worker for position scanning, trigger qualification, notification dispatch, reconciliation, and submitted-attempt sweeping;
- pure domain logic for position state, trigger qualification, directional exit policy, preview freshness, retry limits, and execution lifecycle transitions;
- adapter implementations for Orca position reads, Jupiter quotes, Solana transaction preparation/submission, Postgres persistence, notification dispatch, and regime-engine integration;
- a read-only `/insights/sol-usdc/*` API that exposes CLMM pool, position, alert, and S/R snapshots to the external intelligence pipeline;
- backend-only regime-engine reads for current regime, S/R levels, S/R theses, and policy insights;
- backend-only regime-engine writes for terminal CLMM execution events;
- a position-scoped Regime plan request/decision/preview/approval flow, plus a result-outbox worker job that reports every received plan's terminal outcome back to regime-engine.

The current execution model is explicit user approval. The backend may prepare and submit signed payloads, but signing authority remains with the user's wallet.

## Core product invariant

Direction matters. A lower-bound breach and an upper-bound breach are different risk events with different target postures:

```text
lower-bound breach -> remove liquidity -> collect fees -> swap SOL to USDC -> end in USDC
upper-bound breach -> remove liquidity -> collect fees -> swap USDC to SOL -> end in SOL
```

The directional mapping lives in `packages/domain/src/exit-policy/DirectionalExitPolicyService`. Other layers consume the policy result; they should not re-implement the mapping.

## How the three repos work together today

```text
                    GeckoTerminal / market candles
                                |
                                v
                         regime-engine
              regime, S/R, S/R theses, policy insights
                                ^
                                | execution result events
                                |
Wallet + App  <---- BFF/API + Worker ----> Orca / Jupiter / Solana RPC
  clmm-v2          positions, alerts,
                   previews, signing,
                   submission, history
                                |
                                | read-only bundle API
                                v
              sol-usdc-clmm-intelligence
       OpenClaw routines, evidence memory, advisory outputs
```

Today:

- `clmm-v2` is the operational product. It owns wallet connection, monitored positions, alerts, preview approval, signing handoff, signed payload submission, reconciliation, and history.
- `regime-engine` is the deterministic analytics and ledger service. It stores candles, computes current regime, stores S/R and current insight blocks, and records CLMM execution-result events.
- `sol-usdc-clmm-intelligence` is the advisory/evidence pipeline. It pulls CLMM bundles from this repo's BFF, runs OpenClaw-backed analysis against durable policies/memory, and produces advisory artifacts. It does not perform execution.

## Evidence-driven policy loop (delivered)

The evidence-driven policy loop described below was the near-term roadmap through #90–#93, #62, #72, #73, and #76. All of those issues are closed and the work has shipped; this section documents delivered behavior, not upcoming work.

### Evidence-driven PolicyInsights consumption

Delivered:

- CLMM V2 remains the source of truth for live wallet, LP, position, alert, execution, and history state;
- the read-only SOL/USDC intelligence bundle was extended with raw LP facts needed by downstream evidence derivation, such as inventory skew, fee-capture inputs, unclaimed-fee valuation lineage, token composition, and explicit data-quality warnings;
- `clmm-v2` consumes one canonical Regime Engine PolicyInsight contract, vendored at `schemas/regime-engine/policy-insight.v1/` (see `AGENTS.md` for the vendoring convention), instead of hand-rolled or duplicated parser shapes;
- the app renders synthesized PolicyInsights with freshness, confidence, risk, reasoning, levels, and degraded/unavailable states through `PolicyInsightsSection`;
- the UI stays concise and decision-focused rather than becoming a raw analytics dump.

The important boundary: intelligence gets raw evidence inputs from CLMM; Regime Engine synthesizes the final PolicyInsight; CLMM displays/consumes the final policy while preserving live LP and signed-transaction responsibility.

### Regime Engine plan/result loop

Delivered as a position-scoped plan/result audit loop:

```text
CLMM -> POST /plans/:walletId/:positionId/request           -> Regime Engine returns a plan
CLMM -> POST /plans/:walletId/:positionId/:planId/decision  -> user accept/decline recorded
CLMM -> POST /plans/:walletId/:positionId/:planId/preview   -> signed transaction handling when applicable
CLMM -> POST /plans/:walletId/:positionId/:planId/approve   -> user approval recorded
CLMM worker -> POST /v1/execution-result                    -> Regime Engine records the outcome
```

Every preview and execution attempt carries an explicit `ExecutionOrigin` (`qualified-breach` or `regime-plan`). The `syncPlanExecutionResults` worker job claims due rows from the `plan_execution_results` outbox table using atomic database locks (`FOR UPDATE SKIP LOCKED`), delivers `POST /v1/execution-result` to Regime Engine, and retries retryable failures with exponential backoff up to 5 attempts before marking a row `failed-permanent`. Deterministic qualified lower/upper breach triggers always outrank advisory plan responses (`HOLD`, `STAND_DOWN`, or degraded/unavailable plan states). The audit rule is the important part: every received plan eventually gets a recorded result, including hold, skipped, failed, and completed cases. Regime Engine records decisions and outcomes; CLMM remains responsible for user approval, safety checks, transaction submission, and reconciliation.

### Product/data hardening

Also delivered:

- impossible or inconsistent `hasAlert + in-range` display states are now explicit instead of silently showing a normal chip;
- `RangeBar` no longer renders plausible-looking output when price inputs are non-finite or unavailable (`RangeBarUtils` validates each bound and reports a specific non-finite reason);
- placeholder portfolio and position-card financial metrics were replaced with real application-layer data or visibly marked as unavailable;
- `PairGlyph` fallbacks were hardened for non-canonical pool labels to reduce placeholder hash collisions;
- market insight fetch timeouts now cover response body reads, not only response headers.

## Mature system vision

The mature system is a closed feedback loop:

1. `clmm-v2` observes supported SOL/USDC Orca Whirlpool positions and exposes safe read-only LP evidence through `/insights/sol-usdc/*`.
2. `sol-usdc-clmm-intelligence` collects, normalizes, derives, and summarizes structured evidence from CLMM snapshots, market sources, on-chain flow, perps/liquidations, macro/protocol context, and durable memory.
3. `regime-engine` ingests structured evidence, combines it with deterministic market regime state, and synthesizes one canonical PolicyInsight.
4. `clmm-v2` reads and displays that canonical PolicyInsight while keeping deterministic stop-loss handling separate from advisory context.
5. Execution outcomes flow back to `regime-engine` so the system can measure signal quality, stale evidence, false positives, fee capture, and outcome quality over time.

A future proof layer may include a minimal Anchor receipt/claim program that records one execution receipt per epoch after a completed user-approved flow. That proof layer is not implemented in this repo today.

## Runtime surfaces

### App

Location: `apps/app`

The app is the user execution surface. It should not receive backend secrets and should not call Solana RPC, regime-engine, or the intelligence pipeline directly. Public app config is limited to `EXPO_PUBLIC_*` values, currently `EXPO_PUBLIC_BFF_BASE_URL`.

### BFF/API

Location: `packages/adapters/src/inbound/http`

Run locally with:

```bash
pnpm dev:api
```

Key route groups:

```text
GET  /health
POST /wallets/:walletId/challenge
POST /wallets/:walletId/enroll
POST /wallets/:walletId/monitor
GET  /positions/:walletId
GET  /positions/:walletId/:positionId
GET  /alerts/:walletId
POST /alerts/:triggerId/acknowledge
POST /previews/:triggerId
POST /previews/:triggerId/refresh
GET  /previews/:previewId
POST /executions/approve
GET  /executions/:attemptId/signing-payload
POST /executions/:attemptId/decline-signature
POST /executions/:attemptId/interrupt-signature
POST /executions/:attemptId/submit
POST /executions/:attemptId/abandon
GET  /executions/:attemptId
GET  /executions/history/wallet/:walletId
POST /plans/:walletId/:positionId/request
GET  /plans/:walletId/:positionId/current
POST /plans/:walletId/:positionId/:planId/decision
POST /plans/:walletId/:positionId/:planId/preview
POST /plans/:walletId/:positionId/:planId/approve
GET  /regime/pools/:poolId/current
GET  /sr-levels/pools/:poolId/current
GET  /sr-theses/pools/:poolId/current
GET  /policy-insights/sol-usdc/current
GET  /insights/sol-usdc/pool
GET  /insights/sol-usdc/positions/:walletId
GET  /insights/sol-usdc/bundle/:walletId
```

### Worker

Location: `packages/adapters/src/inbound/jobs`

Run locally with:

```bash
pnpm dev:worker
```

The worker hosts background jobs for breach scanning, trigger qualification, notification dispatch, reconciliation, and submitted-attempt sweeping. It refuses to start when `DATABASE_URL` is missing or the schema is not ready.

## Integration contracts

### Regime Engine

Backend-only env vars:

```bash
REGIME_ENGINE_BASE_URL=http://localhost:8787
REGIME_ENGINE_INTERNAL_TOKEN=<must-match-regime-engine-CLMM_INTERNAL_TOKEN>
```

`clmm-v2` currently reads:

- `GET /v1/regime/current` through `CurrentRegimeAdapter`;
- `GET /v1/sr-levels/current` and `GET /v2/sr-levels/current` through S/R read adapters;
- `GET /v1/insights/sol-usdc/current` through `CurrentPolicyInsightsAdapter`.

`clmm-v2` currently writes:

- `POST /v1/clmm-execution-result` for terminal execution outcomes.

`clmm-v2` also implements the position-scoped plan/result audit loop (see [Regime Engine plan/result loop](#regime-engine-planresult-loop) above):

- inbound `POST /plans/:walletId/:positionId/request`, `.../decision`, `.../preview`, and `.../approve` accept and progress a position plan requested from Regime Engine;
- outbound `POST /v1/execution-result` reports every received plan's terminal outcome back to Regime Engine;
- `clmm-v2` consumes one canonical PolicyInsight contract (fixtures/schema vendored from Regime Engine at `schemas/regime-engine/policy-insight.v1/`) instead of duplicated parser logic.

Database migrations for the plan and result-outbox tables (`position_plans`, `plan_execution_results`) are owned by `packages/adapters` (`pnpm --filter @clmm/adapters db:migrate`). Migrations must run and complete before deploying new worker or API code that requires the new schema tables — the API container runs `pnpm db:migrate` via a pre-deploy hook before worker rollout.

The `syncPlanExecutionResults` worker job claims due rows from `plan_execution_results` using atomic database locks (`FOR UPDATE SKIP LOCKED`), delivers `POST /v1/execution-result` to Regime Engine, and marks successful or idempotent deliveries `status = 'delivered'`. Retryable failures back off exponentially up to 5 attempts; permanent failures or cap exhaustion mark the row `failed-permanent`.

Operational endpoints (`/v1/plan`, `/v1/execution-result` on Regime Engine; `/plans/*` on this BFF) are backend-only and private and must never be exposed to client bundles or public networks. Public/Insights endpoints (`/insights/sol-usdc/*`) are read-only and secured via `INSIGHTS_API_KEY`.

Never expose regime-engine through `EXPO_PUBLIC_*` variables.

### Intelligence pipeline

Backend-only env var:

```bash
INSIGHTS_API_KEY=<shared-read-token-for-sol-usdc-insight-endpoints>
```

The external intelligence repo reads this BFF through:

```bash
CLMM_DATA_API_BASE=http://localhost:3001
CLMM_INSIGHTS_API_KEY=<same-value-as-INSIGHTS_API_KEY>
```

The intelligence endpoints are read-only. They expose raw/product-owned facts for analysis. They do not submit transactions or request wallet credentials.

## Getting started

Prerequisites:

- Node.js 20+
- pnpm 9+
- Postgres for API/worker persistence
- Solana RPC URL for live position reads and transaction submission

Bootstrap the repo:

```bash
pnpm bootstrap
```

Backend env:

```bash
cp packages/adapters/.env.sample packages/adapters/.env
```

App env:

```bash
cp apps/app/.env.example apps/app/.env
```

## Common commands

```bash
pnpm bootstrap
pnpm dev
pnpm dev:api
pnpm dev:worker
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
pnpm test:domain
pnpm test:application
pnpm test:adapters
pnpm test:e2e
pnpm db:migrate
pnpm db:generate
pnpm db:studio
pnpm format
```

## Verification gate

Before marking broad work complete, run:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm test
```

For targeted work, run the relevant package-level checks and report anything not run.

## Repo map

```text
apps/app                 Expo shell, routes, composition, platform edge code
packages/domain          Pure domain model and invariant-carrying business rules
packages/application     Use cases, DTOs, and port contracts
packages/adapters        BFF, worker jobs, storage, Solana/Orca/Jupiter/regime adapters
packages/ui              Screens, presenters, view-models, and components
packages/testing         Fakes, fixtures, contracts, and scenarios
packages/config          Shared TypeScript, ESLint, CI, and boundary config
scripts                  Operational helper scripts
```

## Product guardrails

- Non-custodial only: signing authority stays with the user wallet.
- User approval is required for execution in the current product.
- Directional exits are mandatory: lower breach exits to USDC, upper breach exits to SOL.
- App secrets stay backend-only; the mobile/web bundle only receives public configuration.
- Regime/intelligence outputs are context, not signing authority.
- CLMM owns live LP/execution truth; intelligence owns evidence production; Regime Engine owns final policy synthesis.
- This product is not a general wallet or generic analytics dashboard.

## Important docs

- Agent instructions: `AGENTS.md`
- Setup and worktree guidance: `docs/setup.md`
- Architecture overview: `docs/architecture.md`
- Domain invariants and lifecycle rules: `docs/architecture/invariants.md`
- Railway deploy runbook: `docs/runbooks/railway-deploy.md`
- Release checklist: `docs/architecture/release-checklist.md`
