# CLMM V2 — Claude Code Configuration

## What This Product Is

CLMM V2 is a mobile-first, non-custodial LP exit assistant for Solana CLMM positions.
It detects when a supported Orca CLMM position goes out of range, explains the directional
exposure, prepares the correct unwind path, and executes ONLY after explicit user signature.

This is NOT a generalized DeFi control panel, wallet, or analytics product.

---

## ⛔ THE CORE PRODUCT INVARIANT — NEVER VIOLATE THIS

This rule is a release blocker. Incorrect directional mapping is CRITICAL SEVERITY.
Do not abstract, generalize, or re-derive from token order:

```
LowerBoundBreach  →  RemoveLiquidity → CollectFees → Swap SOL→USDC  → ExitToUSDC posture
UpperBoundBreach  →  RemoveLiquidity → CollectFees → Swap USDC→SOL  → ExitToSOL posture
```

This mapping lives ONLY in `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
It must not be re-derived in adapters, UI, or anywhere outside the domain layer.
If you are uncertain about direction, STOP and ask. Do not infer.

---

## Tech Stack

### Monorepo
- Tool: Turborepo
- Package manager: pnpm workspaces

### App Shell (Primary + PWA)
- `apps/app` — Expo SDK 52 universal app (React Native primary, web/PWA secondary output)
- Navigation: Expo Router (file-based)
- Styling: NativeWind (Tailwind for RN + web)
- Notifications: Expo Push Notifications (native primary; web push secondary)

### Client State
- Server state: TanStack Query v5
- Local UI state: Zustand v4
- No Redux, no MobX

### Backend (source lives in packages/adapters, deployed separately to Railway)
- Runtime: Node.js 20+
- Framework: NestJS
- Language: TypeScript strict mode
- HTTP BFF: `packages/adapters/src/inbound/http` — deployed as NestJS BFF/API service
- Job workers: `packages/adapters/src/inbound/jobs` — deployed as NestJS worker service
- Job queue: pg-boss (Postgres-native, no Redis required)
- Hosting: Railway

### Database
- Engine: PostgreSQL (Railway Postgres)
- ORM: Drizzle ORM
- Migrations: Drizzle Kit
- All durable state (history, triggers, preview, execution attempt) lives here

### Solana / DeFi
- Primary Solana SDK: @solana/kit (anza-xyz — the Kit successor to web3.js, recommended for all new greenfield work)
- MWA peer dep: @solana/web3.js v1 pinned (included only to satisfy MWA type expectations — do NOT use for implementation logic)
- Orca: @orca-so/whirlpools — ALWAYS use context7 skill before any Orca SDK call
- Jupiter: Jupiter API v6 REST — ALWAYS use context7 skill before any Jupiter call
- Mobile wallet: @solana-mobile/mobile-wallet-adapter-protocol (React Native)
- Web wallet: @solana/wallet-adapter-react (PWA only)

### Solana SDK Usage Rule
All Solana operations must use @solana/kit APIs. The @solana/web3.js v1 package is present
as a pinned peer dependency only for MWA type compatibility. Never use web3.js v1 Connection,
PublicKey class, or Transaction class in implementation code — use @solana/kit equivalents.

---

## Frozen Repository Structure

Do not add top-level directories or packages not listed here:

```
apps/
  app/                         <- Expo SDK 52 universal shell only (NO screens, NO business logic)
    app/                       <- Expo Router route files + deep-link entrypoints
    src/composition/           <- single top-level client composition bootstrap
    src/platform/              <- native/web edge logic ONLY

packages/
  domain/                      <- pure business model, zero external deps
    src/shared/                <- PositionId, WalletId, PoolId, BreachDirection, PostExitAssetPosture, ClockTimestamp
    src/positions/             <- LiquidityPosition, RangeBounds, RangeState, MonitoringReadiness
    src/triggers/              <- BreachEpisode, ExitTrigger, ConfirmationEvaluation
    src/exit-policy/           <- DirectionalExitPolicyService (THE invariant lives here)
    src/execution/             <- ExecutionPlan, ExecutionPreview, ExecutionAttempt, lifecycle states
    src/history/               <- HistoryEvent, HistoryTimeline, ExecutionOutcomeSummary

  application/                 <- orchestrates use cases, depends only on domain + port contracts
    src/ports/                 <- outbound port interfaces (no implementations here)
    src/dto/                   <- DTOs crossing layer boundaries
    src/public/                <- ONLY entry point for UI imports
    src/use-cases/
      positions/
      triggers/
      previews/
      execution/
      history/
      notifications/

  adapters/                    <- implements ports; isolates all external SDKs
    src/outbound/
      solana-position-reads/   <- OrcaPositionReadAdapter, SolanaRangeObservationAdapter
      swap-execution/          <- JupiterQuoteAdapter, SolanaExecutionPreparationAdapter, SolanaExecutionSubmissionAdapter
      wallet-signing/          <- NativeWalletSigningAdapter, BrowserWalletSigningAdapter
      notifications/           <- ExpoPushAdapter, WebPushAdapter, InAppAlertAdapter
      storage/                 <- OffChainHistoryStorageAdapter (Drizzle), OperationalStorageAdapter (Drizzle)
      observability/           <- TelemetryAdapter
    src/inbound/
      http/                    <- NestJS BFF/API controllers (deployed separately from app)
      jobs/                    <- NestJS + pg-boss job handlers (deployed separately)
    src/composition/           <- NestJS module wiring (only imported via one approved bootstrap path)

  ui/                          <- screens, presenters, view-models, components, design-system
    src/presenters/
    src/view-models/
    src/screens/
    src/components/
    src/design-system/

  config/                      <- TS references, lint, dependency-cruiser, CI checks, env schema
    boundaries/
    eslint/
    typescript/
    ci/

  testing/                     <- fakes, contracts, fixtures, scenario harnesses
    src/fakes/
    src/contracts/
    src/fixtures/
    src/scenarios/

docs/
  architecture/
    adr/
    context-map.md
    dependency-rules.md
    event-catalog.md
```

`apps/app` does NOT own: screens, presenters, view-models, components, business policy.
`packages/ui` owns ALL screens. Never put a screen in `apps/app`.

---

## Dependency Rules (CI-Enforced — Never Violate)

| Package | May import |
|---------|-----------|
| `packages/domain` | only itself |
| `packages/application` | `packages/domain` and its own port contracts only |
| `packages/adapters` | `packages/application`, `packages/domain`, approved external SDKs |
| `packages/ui` | `packages/application/public` and its own UI code only |
| `apps/app` | `packages/ui`, `packages/application/public`, `packages/config`, ONE approved composition entrypoint |
| `packages/testing` | public APIs of all packages only (never private deep imports) |

Forbidden (will fail CI):
- `packages/domain` -> any external SDK or framework
- `packages/application` -> adapters, Solana SDKs, React, React Native, browser APIs, Expo APIs
- `packages/ui` -> adapter modules, storage SDKs, Solana SDKs
- `apps/app` -> `packages/adapters` directly (except ONE approved composition bootstrap)
- Any package -> on-chain receipt/attestation/proof/claim verification subsystem code
- Any implementation file -> @solana/web3.js Connection, PublicKey, or Transaction (use @solana/kit equivalents)

Banned concepts (CI symbol scan — build fails on these):
Receipt, Attestation, Proof, ClaimVerification, OnChainHistory, CanonicalExecutionCertificate

---

## Domain Model (Do Not Deviate From These Names or Types)

### Value Objects

```typescript
// BreachDirection — discriminated union, NEVER a boolean or string
type BreachDirection = { kind: 'lower-bound-breach' } | { kind: 'upper-bound-breach' }

// PostExitAssetPosture — discriminated union
type PostExitAssetPosture = { kind: 'exit-to-usdc' } | { kind: 'exit-to-sol' }

// SwapInstruction — always includes policyReason
type SwapInstruction = { fromAsset: AssetSymbol; toAsset: AssetSymbol; policyReason: string; amountBasis: TokenAmount }

// ExecutionStep — discriminated union
type ExecutionStep = RemoveLiquidity | CollectFees | SwapAssets

// ExecutionLifecycleState — 8 explicit states
type ExecutionLifecycleState =
  | { kind: 'previewed' }
  | { kind: 'awaiting-signature' }
  | { kind: 'submitted' }
  | { kind: 'confirmed' }   // terminal
  | { kind: 'failed' }
  | { kind: 'expired' }
  | { kind: 'abandoned' }   // terminal
  | { kind: 'partial' }     // terminal for retry — no blind full replay
```

### Critical Mapping Law (DirectionalExitPolicyService ONLY)

```
lower-bound-breach  =>  exit-to-usdc  +  SwapInstruction(SOL -> USDC)
upper-bound-breach  =>  exit-to-sol   +  SwapInstruction(USDC -> SOL)
```

### Domain Services (pure, deterministic — no side effects, no ports)

| Service | Responsibility |
|---------|---------------|
| `DirectionalExitPolicyService` | Maps BreachDirection to posture + swap + execution step skeleton |
| `TriggerQualificationService` | Applies fixed MVP confirmation rules + breach-episode idempotency |
| `ExecutionPlanFactory` | Builds ExecutionPlan from position + trigger + policy result |
| `PreviewFreshnessPolicy` | Determines fresh / stale / expired |
| `RetryBoundaryPolicy` | Determines retry eligibility from partial completion + lifecycle state |
| `ExecutionStateReducer` | Reduces execution events into authoritative lifecycle state |

Time, IDs, network reads, and persistence enter ONLY through application-layer ports.
Never pass these into domain services directly.

---

## Execution State Machine (Valid Transitions Only)

```
previewed          -> awaiting-signature
awaiting-signature -> submitted | abandoned | expired
submitted          -> confirmed | failed | partial
failed             -> previewed  (ONLY if no chain step confirmed)
expired            -> previewed  (ONLY if no chain step confirmed)
partial            -> NO TRANSITIONS (terminal for retry purposes)
confirmed          -> NO TRANSITIONS (terminal)
abandoned          -> NO TRANSITIONS (terminal)
```

partial -> previewed: PERMANENTLY FORBIDDEN
partial -> submitted: PERMANENTLY FORBIDDEN

---

## Outbound Ports (Defined in packages/application/src/ports/)

| Port | Primary Adapter |
|------|----------------|
| `SupportedPositionReadPort` | `OrcaPositionReadAdapter` |
| `RangeObservationPort` | `SolanaRangeObservationAdapter` |
| `SwapQuotePort` | `JupiterQuoteAdapter` |
| `ExecutionPreparationPort` | `SolanaExecutionPreparationAdapter` |
| `ExecutionSubmissionPort` | `SolanaExecutionSubmissionAdapter` |
| `WalletSigningPort` | `NativeWalletSigningAdapter`, `BrowserWalletSigningAdapter` |
| `NotificationPort` | `ExpoPushAdapter`, `WebPushAdapter`, `InAppAlertAdapter` |
| `PlatformCapabilityPort` | `NativePlatformCapabilityAdapter`, `WebPlatformCapabilityAdapter` |
| `NotificationPermissionPort` | platform adapters |
| `DeepLinkEntryPort` | `ExpoDeepLinkAdapter`, `WebDeepLinkAdapter` |
| `ExecutionHistoryRepository` | `OffChainHistoryStorageAdapter` (Drizzle) |
| `TriggerRepository` | `OperationalStorageAdapter` (Drizzle) |
| `ExecutionRepository` | `OperationalStorageAdapter` (Drizzle) |
| `ExecutionSessionRepository` | `OperationalStorageAdapter` (Drizzle) |
| `ObservabilityPort` | `TelemetryAdapter` |
| `ClockPort` | platform adapter |
| `IdGeneratorPort` | platform adapter |

Adapters translate external SDK models to domain DTOs immediately on ingress.
No adapter type ever enters `packages/domain`.
No adapter decides breach direction or target posture.

---

## Application Use Cases

Worker/BFF runtime (NestJS backend on Railway):
ScanPositionsForBreaches, QualifyActionableTrigger, CreateExecutionPreview,
RefreshExecutionPreview, ReconcileExecutionAttempt, DispatchActionableNotification

Client runtime (Expo app):
ConnectWalletSession, SyncPlatformCapabilities, AcknowledgeAlert, ApproveExecution,
RequestWalletSignature, ResolveExecutionEntryContext, ResumeExecutionAttempt,
RecordSignatureDecline, RecordExecutionAbandonment

Shared query facade:
ListSupportedPositions, GetPositionDetail, ListActionableAlerts,
GetExecutionPreview, GetExecutionHistory, GetExecutionAttemptDetail, GetMonitoringReadiness

---

## Implementation Sequence (Do Not Skip or Reorder)

| Seq | What | Done When |
|-----|------|-----------|
| 1 | Turborepo + pnpm scaffold + boundary enforcement | CI fails illegal imports and banned concepts; no business code yet |
| 2 | Shared domain kernel in `packages/domain` | DirectionalExitPolicyService pure + exhaustively tested |
| 3 | Application contracts: ports, DTOs, use cases with fake ports | UI and adapters can proceed against stable contracts |
| 4 | Off-chain history + observability adapters (Drizzle + Railway Postgres) | Durable history exists before protocol execution is wired |
| 5 | Monitoring + trigger path (Orca read → pg-boss scan job → trigger) | Actionable triggers generated + persisted without UI |
| 6 | Preview generation (Jupiter v6 REST quote + freshness) | Directional preview generated + refreshed from shared logic |
| 7 | Signing + submission + reconciliation (MWA + @solana/kit) | Full signed execution lifecycle supportable + history-backed |
| 8 | Notifications + capability path (Expo Push + pg-boss dispatch job) | Best-effort alerts integrated; degraded states honest |
| 9 | UI assembly in packages/ui (Expo SDK 52 + NativeWind) | Native + PWA share contracts; directional copy is primary |

Story execution rules for each sequence:
1. Start from the narrowest package that owns the change
2. Extend public contracts before extending adapters or UI
3. Use fake ports from packages/testing before real adapters
4. Never bypass application public APIs with direct adapter imports
5. Never introduce generic exitPosition behavior that loses breach direction
6. Never introduce on-chain receipt concepts

---

## Common Commands

```bash
# Monorepo
pnpm dev              # Start all services (turbo)
pnpm dev:app          # Expo SDK 52 dev server (mobile + web)
pnpm dev:api          # NestJS BFF HTTP server
pnpm dev:worker       # NestJS + pg-boss worker

# Testing
pnpm test             # All tests
pnpm test:domain      # packages/domain only
pnpm test:application # packages/application only
pnpm test:adapters    # adapter contract tests
pnpm test:e2e         # End-to-end scenario tests

# Database (Drizzle)
pnpm db:migrate       # Run pending Drizzle Kit migrations
pnpm db:generate      # Generate Drizzle schema client
pnpm db:studio        # Open Drizzle Studio

# Validation
pnpm build            # Build all
pnpm typecheck        # tsc --noEmit all packages
pnpm lint             # ESLint including boundary rules
pnpm boundaries       # dependency-cruiser check
```

---

## Coding Rules

### TypeScript
- Strict mode: `strict: true`, `noUncheckedIndexedAccess: true` everywhere
- No `any` except at external API boundaries with an explicit `// boundary: <reason>` comment
- Use `unknown` + narrowing for all untyped external data
- BreachDirection, ExecutionLifecycleState, ExecutionStep, PostExitAssetPosture are ALWAYS discriminated unions

### Testing
- `packages/domain`: 100% branch coverage on `DirectionalExitPolicyService` (both directions confirmed)
- `packages/domain`: all state machine transitions tested — valid, invalid, and all partial->* forbidden transitions
- `packages/application`: use cases tested with fakes from `packages/testing` only
- Adapter contract tests: each adapter validated against its port interface
- No test calls live Orca or Jupiter APIs — use recorded fixtures from `packages/testing/src/fixtures`

### React / React Native
- Functional components only
- `packages/ui` consumes `packages/application/public` DTOs only — never raw adapter output
- Wallet signing flows must preserve navigation context across MWA handoff and app return
- No business logic in components — render view-models and dispatch commands only

### Solana / DeFi
- Use @solana/kit for all Solana operations (address, createSolanaRpc, pipe, transaction building)
- @solana/web3.js v1 is a pinned peer dep for MWA types ONLY — never use its Connection or PublicKey class in logic
- Always use context7 skill for Orca, Jupiter, @solana/kit, MWA, Expo Push before writing adapter code
- Quote freshness validated before every signing attempt — stale quote blocks signing
- Never present submitted transaction as confirmed — wait for on-chain reconciliation
- All trigger creation requires idempotency keys (pg-boss provides these natively)

### NestJS / pg-boss
- Each bounded context maps to a NestJS module
- pg-boss jobs are the mechanism for: breach scanning, trigger qualification, reconciliation, notification dispatch
- Job handlers live exclusively in `packages/adapters/src/inbound/jobs`
- Never call job handlers directly from application use cases — use port interfaces

### Drizzle
- Schema definitions live in `packages/adapters/src/outbound/storage/schema/`
- Never import Drizzle types into `packages/domain` or `packages/application`
- Adapters translate Drizzle row types to domain DTOs at the boundary

### Error Handling
- Never swallow errors silently
- Use typed domain error classes, not generic Error for policy violations
- Distinguish: pre-signing failure | submission failure | post-submission reconciliation failure

---

## Context7 Skill Usage — Always for These Libraries

Use the solana-adapter-docs skill when writing code that touches any of these:
- @orca-so/whirlpools — API changes between minor versions
- Jupiter API v6 REST — endpoint and parameter changes are significant
- @solana/kit — factory pattern APIs, pipe composition, address types
- @solana-mobile/mobile-wallet-adapter-protocol — MWA signing flow + session management
- @solana/wallet-adapter-react — web signing flow
- Expo SDK 52 — permissions, push notifications, deep links, app state, Expo Router

---

## State Ownership

| State | Source of Truth |
|-------|----------------|
| Position snapshots | Backend read model (Railway Postgres via Drizzle — client cache only) |
| Range observations + breach episodes | Backend worker state (pg-boss + Postgres) |
| Actionable trigger records | Railway Postgres (shared by mobile + PWA) |
| Preview freshness + estimates | Railway Postgres (client cached via TanStack Query) |
| Execution attempt / awaiting-signature | Railway Postgres (authoritative for resumable signing) |
| Terminal lifecycle state | Railway Postgres reconciliation projection |
| Execution history timeline | Railway Postgres off-chain storage (survives reinstall + device loss) |
| Private keys + signature authority | Wallet only — NEVER backend |

---

## Non-Custodial Invariants (Absolute)

- Backend NEVER stores wallet private keys, seeds, or signing authority
- Backend NEVER initiates execution without an explicit user-signed transaction
- Backend NEVER implies custody or guaranteed execution outcome
- Any feature requiring backend signing authority is OUT OF SCOPE for MVP

---

## What This Product Is NOT

Stop and flag any request moving toward:
- Portfolio analytics, yield dashboards, performance history
- Generic wallet features (arbitrary transfer, stake, generic swap)
- Autonomous, scheduled, or delegated execution
- Multi-chain support
- Multi-CLMM protocol (Orca only for MVP)
- On-chain receipts, attestations, proofs, claim verification
- Social features, copy trading, strategy marketplace

---

## Domain Glossary

| Term | Meaning |
|------|---------|
| LowerBoundBreach | Price moved below position's lower range boundary |
| UpperBoundBreach | Price moved above position's upper range boundary |
| ExitTrigger | Confirmed actionable record after confirmation policy passes |
| ExecutionPlan | Ordered: remove liquidity -> collect fees -> directional swap |
| ExecutionPreview | Signable snapshot with freshness, estimates, direction visible |
| ExecutionAttempt | One user-approved execution flow |
| Partial | Execution state where >=1 chain step confirmed but sequence incomplete |
| HistoryTimeline | Append-only off-chain operational event log (Railway Postgres) |
| ConfirmationPolicy | Fixed MVP rules that must pass before observation becomes trigger |
| BreachEpisode | Continuous out-of-range period for a specific position + direction |
| DirectionalExitPolicyService | Domain service encoding the non-negotiable exit mapping |

---

## When In Doubt

1. Choose narrower implementation over generalized
2. Preserve the directional invariant over DRY or abstraction convenience
3. Surface stale/uncertain state to user rather than silently proceeding
4. Start from packages/domain — work outward toward adapters and UI
5. If a change touches DirectionalExitPolicyService, RED tests come first, always
6. Use context7 skill before writing any adapter code touching external SDKs
7. Ask before making any architecture decision not covered in this file or docs/architecture/