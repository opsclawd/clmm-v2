---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/05-product-brief.md
  - _bmad-output/planning-artifacts/10-prd.md
  - _bmad-output/planning-artifacts/11-ux.md
workflowType: 'architecture'
project_name: 'clmm-v2'
user_name: 'BMad'
date: '2026-03-21'
lastStep: 8
status: 'complete'
completedAt: '2026-03-21'
---

# Architecture Decision Document

## 1. Project Context Analysis

CLMM V2 is a greenfield, mobile-first, non-custodial LP exit assistant for supported Solana CLMM positions, with React Native as the primary execution surface and desktop PWA support as a secondary surface. The product scope is intentionally narrow: detect out-of-range conditions, qualify actionable triggers, generate a directionally explicit execution preview, obtain explicit user signature, reconcile execution state, and persist off-chain operational history.

Architecturally significant requirements from the locked source artifacts:

- Shared domain and application layers must serve both React Native and PWA.
- Monitoring is backend-supported and position-specific.
- Downside and upside breaches are distinct business states, not UI labels.
- The directional exit invariant is mandatory:
  - lower-bound breach -> remove liquidity -> collect fees -> swap SOL to USDC -> end in USDC posture
  - upper-bound breach -> remove liquidity -> collect fees -> swap USDC to SOL -> end in SOL posture
- Execution history is off-chain only and must survive device loss.
- No on-chain receipt, attestation, proof, claim, or verification subsystem is allowed.
- Mobile is the reference execution experience; desktop PWA is a supported secondary surface; mobile web degrades honestly.
- Wallet signing, notification delivery, quoting, and reconciliation are failure-prone external concerns and must be isolated behind ports.

Complexity assessment:

- Product complexity: high
- Technical domain: shared mobile/web client plus backend monitoring and reconciliation
- Cross-cutting concerns: correctness of directional policy, stale preview handling, idempotent triggering, history durability, observability, degraded platform capability handling, CI-enforced package boundaries

## 2. Architectural Laws

These laws are mandatory and non-negotiable:

1. `packages/domain` depends on nothing external.
2. `packages/application` depends only on `packages/domain` and application port contracts.
3. Adapters implement application ports; application never imports adapter code.
4. UI depends on application-facing interfaces and DTOs, never raw infrastructure.
5. Policy logic is pure and deterministic.
6. Execution history is off-chain only.
7. No on-chain receipt logic is permitted anywhere in the codebase.
8. Platform-specific concerns stay out of domain and application.
9. All boundaries must be testable and CI-enforced.

## 3. Bounded Contexts

### 3.1 Position Surveillance

Responsibility:

- represent supported liquidity positions
- evaluate position-specific range state
- hold the latest known range snapshot and monitoring readiness

Core concepts:

- `LiquidityPosition`
- `RangeBounds`
- `RangeState`
- `MonitoringReadiness`

### 3.2 Trigger Qualification

Responsibility:

- convert out-of-range observations into actionable breach triggers
- apply fixed MVP confirmation rules
- enforce breach-episode idempotency

Core concepts:

- `BreachEpisode`
- `ExitTrigger`
- `ConfirmationEvaluation`

### 3.3 Directional Exit Planning

Responsibility:

- encode the core product invariant explicitly
- derive target post-exit asset posture from breach direction
- create the ordered execution plan and preview semantics

Core concepts:

- `BreachDirection`
- `PostExitAssetPosture`
- `ExecutionPlan`
- `SwapInstruction`
- `ExecutionPreview`

### 3.4 Execution Orchestration

Responsibility:

- manage explicit user approval and signature flow
- coordinate execution submission and reconciliation
- model partial completion and retry boundaries

Core concepts:

- `ExecutionAttempt`
- `ExecutionLifecycleState`
- `TransactionReference`
- `RetryEligibility`

### 3.5 Operational History

Responsibility:

- persist the off-chain operational event log
- preserve directional context and state transitions
- support user review and support/debugging

Core concepts:

- `HistoryEvent`
- `HistoryTimeline`
- `ExecutionOutcomeSummary`

### 3.6 Notification And Capability

Responsibility:

- model user-visible readiness for notification delivery and signing capability
- dispatch best-effort notifications without becoming a generalized alerting engine

Core concepts:

- `NotificationCapability`
- `DeliveryStatus`
- `DeepLinkTarget`

## 4. Context Map

Relationship flow:

1. Position Surveillance publishes `RangeObservation`.
2. Trigger Qualification consumes `RangeObservation` and emits `ActionableExitTrigger`.
3. Directional Exit Planning consumes `ActionableExitTrigger` plus `LiquidityPosition` and emits `ExecutionPlan` and `ExecutionPreview`.
4. Execution Orchestration consumes `ExecutionPlan`, obtains signature, submits execution, and emits lifecycle events.
5. Operational History consumes trigger, preview, signing, submission, reconciliation, and terminal events to build the off-chain timeline.
6. Notification And Capability consumes actionable triggers and selected lifecycle events to notify users and report degraded readiness.

Upstream/downstream map:

- Position Surveillance -> Trigger Qualification: upstream/downstream
- Trigger Qualification -> Directional Exit Planning: upstream/downstream
- Directional Exit Planning -> Execution Orchestration: upstream/downstream
- Execution Orchestration -> Operational History: upstream/downstream
- Trigger Qualification -> Notification And Capability: published-language integration
- Execution Orchestration -> Notification And Capability: published-language integration
- Operational History -> UI read models: projection integration

Shared kernel across contexts:

- `PositionId`
- `WalletId`
- `PoolId`
- `BreachDirection`
- `PostExitAssetPosture`
- `ClockTimestamp`

## 5. Layer Model

### 5.1 Domain Layer

Location: `packages/domain`

Rules:

- pure business model
- no Solana SDK imports
- no UI framework imports
- no platform APIs
- no network, storage, notification, or telemetry code

Purpose:

- preserve the directional exit invariant
- define entities, value objects, domain services, and domain events

### 5.2 Application Layer

Location: `packages/application`

Rules:

- orchestrates use cases
- depends only on domain and port contracts
- no Solana SDK imports
- no UI framework imports
- no platform-specific conditionals

Purpose:

- expose application-facing commands, queries, DTOs, and facades
- coordinate ports for monitoring, preview generation, signing, submission, history persistence, and reconciliation

### 5.3 Adapter Layer

Location: `packages/adapters`

Rules:

- implements outbound ports
- hosts inbound runtime handlers for worker jobs and backend/BFF endpoints
- may depend on external SDKs and platform APIs

Purpose:

- isolate Solana reads, Jupiter routing, wallet integration, storage, notifications, and observability

### 5.4 UI Layer

Location: `packages/ui`

Rules:

- owns all screens, presenters, view models, reusable components, and design-system primitives
- never import raw adapter implementations
- consume application-facing interfaces only
- keep platform-specific rendering and navigation at the edge

Purpose:

- render native and web experiences over the same application contracts
- keep breach direction and post-exit posture visually primary

### 5.5 App Shell And Deployment Topology

Locations:

- app shell: `apps/app`
- backend BFF runtime source: `packages/adapters/src/inbound/http`
- backend worker runtime source: `packages/adapters/src/inbound/jobs`

Rules:

- `apps/app` is a host shell only
- `apps/app` owns Expo/bootstrap entrypoints, route files, navigation wiring, platform bootstrap, and one top-level composition bootstrap
- `apps/app` does not own screens, presenters, view models, reusable components, or business policy
- backend BFF and worker runtimes are separate deployables even though their source lives under the frozen `packages/adapters` tree
- server-only code must never be imported into `apps/app`, `packages/ui`, `packages/application/public`, or any client bundle

Purpose:

- preserve strict runtime separation without changing the frozen repository structure
- support backend monitoring, preview generation, reconciliation, and notification dispatch as required by the product

## 6. Package Structure

Frozen top-level structure:

```text
apps/
  app/
packages/
  domain/
  application/
  adapters/
  ui/
  config/
  testing/
docs/
  architecture/
```

Detailed package responsibilities:

### 6.1 `apps/app`

Single Expo-based universal app shell for React Native primary execution and web/PWA output.

Owns:

- Expo/bootstrap entrypoints
- route files and navigation wiring
- deep-link registration and handoff entry wiring
- platform bootstrap
- one top-level client composition bootstrap
- web/native capability switches at the composition edge only

Does not own:

- business policy
- domain rules
- screens
- presenters
- view models
- reusable components
- infrastructure implementations except one approved top-level composition bootstrap

### 6.2 `packages/domain`

Suggested internal modules:

```text
packages/domain/src/
  shared/
  positions/
  triggers/
  exit-policy/
  execution/
  history/
```

### 6.3 `packages/application`

Suggested internal modules:

```text
packages/application/src/
  ports/
  dto/
  public/
  use-cases/
    positions/
    triggers/
    previews/
    execution/
    history/
    notifications/
```

`public/` is the only UI-facing import surface.

### 6.4 `packages/adapters`

Suggested internal modules:

```text
packages/adapters/src/
  outbound/
    solana-position-reads/
    swap-execution/
    wallet-signing/
    notifications/
    storage/
    observability/
  inbound/
    http/
    jobs/
  composition/
```

Important constraint:

- Because the top-level repo structure is frozen, backend worker and BFF entrypoints live under `packages/adapters/src/inbound/*`, not a separate top-level backend app.
- This source-code placement does not change runtime separation: the BFF/API and background worker are separate backend deployables and must not be bundled into `apps/app`.

### 6.5 `packages/ui`

Suggested internal modules:

```text
packages/ui/src/
  presenters/
  view-models/
  screens/
  components/
  design-system/
```

Responsibilities:

- render application DTOs
- map application state to mobile-first visual hierarchy
- preserve directional wording and posture clarity

### 6.6 `packages/config`

Owns:

- TypeScript project references
- lint configuration
- dependency-cruiser rules
- CI architecture checks
- shared environment schema

### 6.7 `packages/testing`

Owns:

- test fixtures
- fake port implementations
- contract test suites
- scenario harnesses for story-by-story execution

### 6.8 `docs/architecture`

Owns:

- ADRs
- context map snapshots
- dependency matrix
- event catalog
- sequence diagrams for monitoring, preview, execution, and reconciliation

## 7. Dependency Rules

Allowed runtime dependencies:

| Package | May import |
| --- | --- |
| `packages/domain` | only itself |
| `packages/application` | `packages/domain` and its own port contracts |
| `packages/adapters` | `packages/application`, `packages/domain`, approved external SDKs |
| `packages/ui` | `packages/application/public` and its own UI code |
| `apps/app` | `packages/ui`, `packages/application/public`, `packages/config`, and one approved composition entrypoint only |
| `packages/testing` | public APIs of all packages, never private deep imports |
| `packages/config` | configuration-only modules |

Forbidden dependencies:

- `packages/domain` -> any external SDK or framework
- `packages/application` -> adapters, Solana SDKs, React, React Native, browser APIs, Expo APIs
- `packages/ui` -> adapter modules, storage SDKs, Solana SDKs
- `apps/app` -> no direct imports from `packages/adapters` except one explicitly approved top-level composition bootstrap path
- any package -> receipt/attestation/proof/claim verification subsystem code

CI enforcement:

1. TypeScript project references enforce the compile graph.
2. Workspace manifests restrict declared dependencies per package.
3. `dependency-cruiser` rules in `packages/config` fail the build on illegal imports.
4. ESLint path rules fail deep imports and forbidden layer crossings.
5. Architecture tests scan for banned symbols and folders related to on-chain receipt logic.
6. Public API tests ensure imports go through package entrypoints only.
7. Path-based rules enforce that only one named composition bootstrap under `apps/app` may import adapter composition code.

Banned architectural concepts in CI:

- `Receipt`
- `Attestation`
- `Proof`
- `ClaimVerification`
- `OnChainHistory`
- `CanonicalExecutionCertificate`

## 8. Entities

### 8.1 `LiquidityPosition`

Represents a supported Orca CLMM position as a domain object, independent of Orca SDK types.

Invariants:

- evaluation is position-specific
- range bounds are explicit
- current posture is derived from range state, not token-order shortcuts

### 8.2 `BreachEpisode`

Represents a continuous out-of-range episode for a specific position and direction.

Invariants:

- only one actionable trigger per position per breach episode
- duplicate notifications and duplicate triggers are suppressed inside the episode

### 8.3 `ExitTrigger`

Represents the actionable business event created after confirmation rules pass.

Invariants:

- always includes `BreachDirection`
- always references trigger time and confirmation evaluation time
- cannot exist with ambiguous direction

### 8.4 `ExecutionPlan`

Represents the explicit ordered plan:

1. remove liquidity
2. collect fees
3. execute mandatory directional swap

Invariants:

- never modeled as a generic directionless exit
- always contains target post-exit posture
- always contains explicit swap instruction

### 8.5 `ExecutionPreview`

Represents a signable preview snapshot with freshness and estimate metadata.

Invariants:

- direction and target posture are visible fields
- stale and expired are explicit states
- estimates are separate from executed outcome

### 8.6 `ExecutionAttempt`

Represents one user-approved execution flow.

Invariants:

- signature is explicit and user-mediated
- submission is not confirmation
- partial completion blocks blind full replay

### 8.7 `HistoryTimeline`

Represents the append-only off-chain operational record.

Invariants:

- directional context is preserved on every relevant event
- transaction references may exist, but no on-chain receipt object exists
- history is operational, not canonical proof

## 9. Value Objects

Required explicit value objects:

- `BreachDirection`
  - `LowerBoundBreach`
  - `UpperBoundBreach`
- `PostExitAssetPosture`
  - `ExitToUSDC`
  - `ExitToSOL`
- `SwapInstruction`
  - `fromAsset`
  - `toAsset`
  - `policyReason`
  - `amountBasis`
- `ExecutionStep`
  - `RemoveLiquidity`
  - `CollectFees`
  - `SwapAssets`
- `RangeBounds`
- `RangeState`
- `ConfirmationEvaluation`
- `PreviewFreshness`
- `ExecutionLifecycleState`
- `RetryEligibility`
- `TransactionReference`
- `TokenAmount`
- `AssetSymbol`
- `PositionId`
- `WalletId`
- `PoolId`
- `HistoryEventType`

Critical mapping law:

- `LowerBoundBreach` must map to `ExitToUSDC` and a `SwapInstruction` of `SOL -> USDC`.
- `UpperBoundBreach` must map to `ExitToSOL` and a `SwapInstruction` of `USDC -> SOL`.

This mapping is part of the domain model and may not be hidden in UI conditionals or adapter code.

## 10. Domain Services

### 10.1 `DirectionalExitPolicyService`

Pure service that converts `BreachDirection` into:

- target post-exit posture
- required swap instruction
- ordered execution-step skeleton

It is the core release-blocker policy surface and must be exhaustively unit tested.

### 10.2 `TriggerQualificationService`

Applies fixed MVP confirmation rules and breach-episode idempotency.

### 10.3 `ExecutionPlanFactory`

Builds `ExecutionPlan` from position state, trigger state, and the directional policy result.

### 10.4 `PreviewFreshnessPolicy`

Determines whether a preview is fresh, stale, or expired.

### 10.5 `RetryBoundaryPolicy`

Determines whether retry is permitted based on partial completion and lifecycle state.

### 10.6 `ExecutionStateReducer`

Reduces execution and reconciliation events into a single authoritative lifecycle state.

All domain services must be deterministic. Time, IDs, network reads, and persistence enter through ports at the application layer.

## 11. Application Use Cases

### 11.1 Query Use Cases

- `ListSupportedPositions`
- `GetPositionDetail`
- `ListActionableAlerts`
- `GetExecutionPreview`
- `GetExecutionHistory`
- `GetExecutionAttemptDetail`
- `GetMonitoringReadiness`

### 11.2 Command Use Cases

- `ConnectWalletSession`
- `SyncPlatformCapabilities`
- `ScanPositionsForBreaches`
- `QualifyActionableTrigger`
- `CreateExecutionPreview`
- `RefreshExecutionPreview`
- `AcknowledgeAlert`
- `ApproveExecution`
- `RequestWalletSignature`
- `ResolveExecutionEntryContext`
- `ResumeExecutionAttempt`
- `RecordSignatureDecline`
- `SubmitExecutionAttempt`
- `ReconcileExecutionAttempt`
- `RecordExecutionAbandonment`
- `DispatchActionableNotification`

### 11.3 Runtime Ownership

Worker/BFF-oriented use cases:

- `ScanPositionsForBreaches`
- `QualifyActionableTrigger`
- `CreateExecutionPreview`
- `RefreshExecutionPreview`
- `ReconcileExecutionAttempt`
- `DispatchActionableNotification`

The backend serves authoritative resumable execution session state, while resume initiation is client-driven after wallet return, deep-link entry, or app relaunch.

Client-oriented use cases:

- `ConnectWalletSession`
- `SyncPlatformCapabilities`
- `AcknowledgeAlert`
- `ApproveExecution`
- `RequestWalletSignature`
- `ResolveExecutionEntryContext`
- `ResumeExecutionAttempt`
- `RecordSignatureDecline`
- `RecordExecutionAbandonment`

Shared query facade use cases:

- `ListSupportedPositions`
- `GetPositionDetail`
- `ListActionableAlerts`
- `GetExecutionHistory`
- `GetExecutionAttemptDetail`

## 12. Ports And Adapters

### 12.1 Outbound Ports

| Port | Purpose | Primary Adapter |
| --- | --- | --- |
| `SupportedPositionReadPort` | read supported CLMM positions without leaking Orca types | `OrcaPositionReadAdapter` |
| `RangeObservationPort` | fetch range/price observations for monitoring | `SolanaRangeObservationAdapter` |
| `SwapQuotePort` | quote the mandatory directional swap | `JupiterQuoteAdapter` |
| `ExecutionPreparationPort` | prepare protocol-specific execution payloads from domain plans | `SolanaExecutionPreparationAdapter` |
| `ExecutionSubmissionPort` | submit signed execution payloads and report references | `SolanaExecutionSubmissionAdapter` |
| `WalletSigningPort` | obtain explicit user signatures | `NativeWalletSigningAdapter`, `BrowserWalletSigningAdapter` |
| `NotificationPort` | send best-effort alerts | `ExpoPushAdapter`, `WebPushAdapter`, `InAppAlertAdapter` |
| `PlatformCapabilityPort` | report native/web execution capabilities and degraded states | `NativePlatformCapabilityAdapter`, `WebPlatformCapabilityAdapter` |
| `NotificationPermissionPort` | read and sync notification permission state | `NativeNotificationPermissionAdapter`, `WebNotificationPermissionAdapter` |
| `DeepLinkEntryPort` | parse alert/deep-link entry metadata for application resolution; the application use case decides whether the result opens a trigger, preview, history item, or degraded recovery state | `ExpoDeepLinkAdapter`, `WebDeepLinkAdapter` |
| `ExecutionHistoryRepository` | persist off-chain event log and projections | `OffChainHistoryStorageAdapter` |
| `TriggerRepository` | persist breach episodes and actionable triggers | `OperationalStorageAdapter` |
| `ExecutionRepository` | persist preview and execution attempt state | `OperationalStorageAdapter` |
| `ExecutionSessionRepository` | persist wallet-handoff correlation and resumable awaiting-signature state | `OperationalStorageAdapter` |
| `ObservabilityPort` | emit logs, traces, metrics | `TelemetryAdapter` |
| `ClockPort` | provide time at application edge | platform adapter |
| `IdGeneratorPort` | provide deterministic ID generation boundary | platform adapter |

### 12.2 Inbound Adapters

- mobile/native route handlers in `apps/app`
- web/PWA route handlers in `apps/app`
- backend/BFF handlers in `packages/adapters/src/inbound/http`
  - position query endpoints
  - alert/history query endpoints
  - preview creation and refresh endpoints
  - execution approval, resume, and submission endpoints
- monitoring and reconciliation job handlers in `packages/adapters/src/inbound/jobs`
  - breach scan jobs
  - trigger qualification jobs
  - reconciliation jobs
  - notification dispatch jobs

### 12.3 Adapter Rules

- Adapters translate external SDK models into domain/application DTOs immediately.
- No adapter type crosses into `packages/domain`.
- No adapter may decide breach direction or target posture.
- Adapters may enrich execution data, but they may not override policy.

## 13. State Ownership Model

| State | Source of truth | Notes |
| --- | --- | --- |
| supported positions snapshot | backend read model backed by external position reads | cached on client for display only |
| range observations and breach episodes | backend worker state | required for idempotent monitoring |
| actionable trigger records | backend storage | shared by mobile and PWA |
| execution preview freshness and estimates | backend storage | client treats as cached read model |
| execution attempt session / awaiting-signature state | backend storage | authoritative source of truth for resumable signing and interruption recovery |
| wallet handoff return context / resume token | client cache plus backend-correlated resume record | client copy is cache only and must be recoverable from off-chain backend state |
| submitted execution references | backend storage after submission | reconciled against chain state |
| terminal lifecycle state | backend reconciliation projection | user-visible authoritative state |
| execution history timeline | backend off-chain storage | survives reinstall and device loss |
| native push capability | platform edge | synchronized into application readiness state for React Native |
| browser notification capability | platform edge | synchronized into application readiness state for desktop PWA |
| native wallet capability | platform edge | primary execution capability for mobile |
| browser-wallet capability | platform edge | secondary execution capability for desktop PWA where supported |
| unsupported mobile web capability state | platform edge | may degrade to review/history only and must not claim native parity |
| private keys and signature authority | wallet only | never stored by product backend |

Ownership principle:

- if state must survive device loss or support debugging, it belongs in off-chain backend storage
- if state is purely navigational or presentational, it belongs in the client
- if state is cryptographic authority, it belongs in the wallet
- client session state is cache only for signing continuity and must always be reconstructable from backend state after interruption

## 14. Testing Strategy

### 14.1 Domain Tests

- exhaustive unit tests for `DirectionalExitPolicyService`
- table-driven tests for lower-bound and upper-bound mapping
- property tests for deterministic state transitions
- invariant tests for `ExecutionPlan`, `ExecutionAttempt`, and retry boundaries

### 14.2 Application Tests

- use-case tests with fake ports from `packages/testing`
- stale preview, duplicate trigger, partial completion, and degraded capability scenarios
- tests that assert application never needs SDK types to execute core logic

### 14.3 Adapter Contract Tests

- each adapter validated against the corresponding port contract
- position-read fixtures normalize Orca responses into domain DTOs
- swap/execution adapters prove they preserve the domain-generated `SwapInstruction`
- wallet adapters prove explicit approval boundaries

### 14.4 UI Tests

- presenter/view-model tests for directional copy and posture rendering
- navigation tests for alert deep linking into preview context
- degraded-state rendering tests for unsupported web/mobile capability gaps

### 14.5 Architecture And CI Tests

- dependency-cruiser layer rules
- lint rules for forbidden imports
- public API tests for package entrypoints
- banned-concept scan for on-chain receipt subsystem terms
- scenario tests for story-by-story composition using only public contracts

### 14.6 End-To-End Scenario Tests

- breach detected -> actionable trigger -> preview -> signature -> submission -> confirmation
- breach detected -> stale preview -> refresh required
- partial execution -> no blind retry -> guided recovery
- delayed notification -> in-app alert still available
- history survives logout/reinstall/device change because it is off-chain

## 15. Repo Structure

Frozen repository structure and intended usage:

```text
apps/
  app/
    app/                    # route files and deep-link entrypoints only
    src/composition/        # client composition root only
    src/platform/           # native/web edge logic only
packages/
  domain/
    src/shared/
    src/positions/
    src/triggers/
    src/exit-policy/
    src/execution/
    src/history/
  application/
    src/ports/
    src/dto/
    src/public/
    src/use-cases/
  adapters/
    src/outbound/solana-position-reads/
    src/outbound/swap-execution/
    src/outbound/wallet-signing/
    src/outbound/notifications/
    src/outbound/storage/
    src/outbound/observability/
    src/inbound/http/
    src/inbound/jobs/
    src/composition/
  ui/
    src/presenters/
    src/view-models/
    src/screens/
    src/components/
    src/design-system/
  config/
    boundaries/
    eslint/
    typescript/
    ci/
  testing/
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

Screen components are owned by `packages/ui/src/screens` and are never owned by `apps/app`.

## 16. Implementation Sequencing Guidance

This architecture is optimized for story-by-story autonomous execution. The sequence below minimizes cross-story conflicts.

### Sequence 1: Foundation And Boundary Enforcement

- create workspace package manifests
- add TypeScript project references
- add dependency-cruiser and ESLint boundary rules
- add banned-concept CI checks for receipt/attestation/proof logic

Definition of done:

- no business code yet
- CI can fail illegal imports and banned concepts immediately

### Sequence 2: Shared Domain Kernel

- implement value objects and entities in `packages/domain`
- implement `DirectionalExitPolicyService`
- implement domain tests proving lower-bound -> USDC and upper-bound -> SOL

Definition of done:

- directional policy is explicit, pure, and exhaustively tested

### Sequence 3: Application Contracts

- define ports, DTOs, and public facades in `packages/application`
- implement core use cases with fake ports only
- add scenario tests in `packages/testing`

Definition of done:

- UI and adapters can proceed independently against stable contracts

### Sequence 4: Off-Chain History And Observability

- implement storage and observability adapters
- persist trigger, preview, signing, submission, reconciliation, and terminal events
- build projections for execution status and history timeline

Definition of done:

- durable off-chain history exists before protocol execution is wired

### Sequence 5: Monitoring And Trigger Path

- implement Solana position-read and range-observation adapters
- wire worker handlers for breach scanning and trigger qualification
- enforce idempotent breach-episode handling

Definition of done:

- actionable triggers can be generated and persisted without UI completion

### Sequence 6: Preview Generation Path

- implement swap quoting and execution-preparation adapters
- create preview generation and refresh flows
- persist freshness state and estimate caveats

Definition of done:

- directional preview can be generated and refreshed from shared application logic

### Sequence 7: Signing And Submission Path

- implement wallet-signing adapters for native and browser contexts
- implement execution submission and reconciliation adapters
- enforce partial-completion and retry-boundary behavior

Definition of done:

- end-to-end signed execution lifecycle is supportable and history-backed

### Sequence 8: Notification And Capability Path

- implement notification adapters and readiness synchronization
- wire deep links from notifications to preview context
- surface degraded capability states honestly
- preserve native mobile as the reference execution path
- support desktop PWA for review, history, and supported manual signed execution where browser-wallet support exists
- allow mobile web/mobile PWA to degrade honestly to non-parity behavior without claiming native signing or push equivalence

Definition of done:

- best-effort notifications are integrated without implying guarantees

### Sequence 9: UI Assembly

- build presenters, view models, and screens in `packages/ui`
- keep `apps/app` limited to routing, composition, and platform edges
- verify native-first interaction quality and desktop PWA continuity

Definition of done:

- native and PWA flows share application contracts and preserve the same domain model

### Story Execution Rules For Autonomous Agents

Every implementation story must follow these rules:

1. Start from the narrowest package that owns the change.
2. Extend public contracts before extending adapters or UI.
3. Use fake ports from `packages/testing` before real adapters.
4. Never bypass application public APIs with direct adapter imports.
5. Never introduce generic `exitPosition` behavior that loses breach direction.
6. Never introduce on-chain receipt concepts.

## 17. Validation Results

### Coherence Validation

- The package graph preserves strict clean architecture and DDD boundaries.
- The directional exit rule is modeled in the domain, not hidden in infrastructure or UI.
- Backend-supported monitoring, preview generation, reconciliation, and durable history are supported without adding forbidden top-level repo paths.

### Requirements Coverage Validation

- FR8-FR16 are covered by Position Surveillance, Trigger Qualification, and Directional Exit Planning.
- FR22-FR39 are covered by Execution Preview and Execution Orchestration.
- FR40-FR44 are covered by Operational History with backend durability.
- FR45-FR47 are covered by the Expo universal app shell plus platform-edge capability handling.

### Architecture Readiness Assessment

Status: READY FOR IMPLEMENTATION

Critical readiness conclusions:

- shared domain and application layers are defined
- Solana and UI dependencies are isolated from core policy code
- off-chain execution history is explicit and durable
- no on-chain receipt subsystem is present or permitted
- package boundaries are enforceable in CI
- the architecture supports incremental autonomous story execution
