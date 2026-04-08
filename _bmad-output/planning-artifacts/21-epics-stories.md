---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/05-product-brief.md
  - _bmad-output/planning-artifacts/10-prd.md
  - _bmad-output/planning-artifacts/11-ux.md
  - _bmad-output/planning-artifacts/20-architecture.md
workflowType: 'epics-stories'
project_name: 'clmm-v2'
date: '2026-03-21'
status: 'complete'
---

# clmm-v2 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for `clmm-v2`, decomposing the approved Product Brief, PRD, UX, and Architecture into thin, implementation-ready stories for autonomous execution.

These stories intentionally prioritize repository foundation and architecture enforcement before feature work. Every story preserves the validated clean architecture boundaries, keeps domain and application layers free of Solana and UI framework imports, and forbids any on-chain receipt, attestation, claim, or proof subsystem.

The epic grouping is intentionally implementation-layer-first for autonomous sequencing. It is optimized for story-by-story agent execution order rather than end-user outcome reporting.

The directional exit policy is locked across this backlog:

- downside breach below range -> remove liquidity -> collect fees -> swap SOL to USDC
- upside breach above range -> remove liquidity -> collect fees -> swap USDC to SOL

No story may replace this with a direction-agnostic exit flow.

## Requirements Inventory

### Functional Requirements

FR1: Users can connect a supported self-custody wallet to the product.  
FR2: Users can view supported Orca CLMM positions associated with the connected wallet.  
FR3: Users can view the pool, range boundaries, and current in-range or out-of-range state for each supported position.  
FR4: Users can select a supported position to view its breach status, trigger status, preview state, and execution history.  
FR5: The system can preserve user context across wallet handoff and return flows during signing.  
FR6: Users can see whether monitoring is active for their supported positions.  
FR7: Users can see notification permission state and whether alert delivery is fully active or degraded.  
FR8: The system can monitor supported positions against their lower and upper range boundaries.  
FR9: The system can detect downside breach conditions separately from upside breach conditions.  
FR10: The system can apply fixed MVP confirmation rules before promoting an observed breach into an actionable exit trigger.  
FR11: The system can create an actionable trigger record tied to a specific position, breach direction, trigger time, confirmation-policy pass state, and confirmation evaluation timestamp.  
FR12: The system can suppress duplicate actionable triggers within a single breach episode.  
FR13: The system can prepare a downside exit flow that removes liquidity, collects fees, and swaps SOL to USDC.  
FR14: The system can prepare an upside exit flow that removes liquidity, collects fees, and swaps USDC to SOL.  
FR15: The system can expose the triggered direction as explicit product state throughout preview, signing, and history.  
FR16: The system can prevent a user from executing an exit flow whose directional logic is ambiguous or unresolved.  
FR17: Users can receive a best-effort notification when a supported position reaches an actionable exit condition.  
FR18: Users can open the application from a notification and land in the affected position or preview context.  
FR19: Users can see in-app breach alerts even if push delivery was delayed or unavailable.  
FR20: The system can distinguish informational state from actionable trigger state in user-visible alerts.  
FR21: Users can see when notification delivery is unavailable or degraded and what that means for breach awareness.  
FR22: Users can review an execution preview before signing.  
FR23: Users can see the liquidity removal step in the preview.  
FR24: Users can see the fee collection step in the preview.  
FR25: Users can see the required swap direction in the preview.  
FR26: Users can see the expected post-exit asset posture in the preview.  
FR27: Users can see whether preview estimates are fresh, stale, or expired.  
FR28: Users can refresh or regenerate a stale preview before execution.  
FR29: Users can see a clear distinction between estimated outcomes and executed outcomes.  
FR30: Users can explicitly approve and sign an exit execution from the product.  
FR31: The system can orchestrate the exit flow as a guided sequence while preserving the distinct logical steps involved.  
FR32: Users can see lifecycle states for previewed, awaiting signature, submitted, confirmed, failed, expired, abandoned, and partial executions.  
FR33: Users can see when submission succeeded but final confirmation is still pending.  
FR34: The system can stop execution if the user declines to sign.  
FR35: The system can require refreshed preview data when a preview is no longer valid for signing.  
FR36: Users can see whether a failure happened before signing, during submission, or after one or more chain actions completed.  
FR37: The system can allow full retry only when no prior chain step has been confirmed for that execution attempt.  
FR38: The system can prevent blind full-sequence retry after partial completion.  
FR39: Users can see recovery guidance appropriate to the current execution state.  
FR40: Users can review off-chain history for trigger, preview, signing, submission, reconciliation, and terminal outcome events.  
FR41: Users can see the directional context associated with each history entry.  
FR42: Users can review transaction references linked to execution attempts when available.  
FR43: Support and operations users can use the history record to troubleshoot reported execution issues.  
FR44: The system can durably persist off-chain execution history in backend storage so it survives app reinstall, device change, and local cache loss.  
FR45: Users can complete the primary breach-to-exit workflow on React Native mobile.  
FR46: Users can access execution history, supported review flows, and supported manual signed execution through a desktop-capable PWA where compatible browser-wallet support is available.  
FR47: Users can experience degraded but honest behavior on unsupported mobile web flows rather than false parity claims.

### NonFunctional Requirements

NFR1: Alert-to-preview navigation should complete within 5 seconds under normal conditions once opened from a valid notification.  
NFR2: Preview generation or refresh completes within 10 seconds for the 95th percentile under normal conditions.  
NFR3: Critical breach context must render above the fold on common mobile screens.  
NFR4: Monitoring, trigger generation, and reconciliation must operate as separate recoverable subsystems.  
NFR5: Execution history must converge to a terminal state for submitted attempts and cannot rely on local-only persistence.  
NFR6: All signing remains user-controlled and wallet-mediated; wallet secrets are never stored by the backend.  
NFR7: Persisted execution-history data at rest must use managed backend encryption controls.  
NFR8: Incorrect directional mapping is a critical severity defect.  
NFR9: Operational logs and user-visible history must support debugging of trigger timing, preview freshness, submission attempts, and reconciliation.  
NFR10: Breach-detection time and notification-delivery time must be recorded separately.  
NFR11: Accessibility must support readable hierarchy, strong contrast, and touch-friendly targets on handheld devices.  
NFR12: The product must use plain directional language rather than protocol jargon alone.  
NFR13: Integration failures with Orca, Jupiter, wallets, or notifications must degrade honestly without corrupting history.  
NFR14: Package boundaries must be CI-enforced and testable.  
NFR15: No on-chain receipt, attestation, claim, or proof subsystem is permitted anywhere in the codebase.

### Additional Requirements

- Freeze the repository structure to `apps/app`, `packages/domain`, `packages/application`, `packages/adapters`, `packages/ui`, `packages/config`, `packages/testing`, and `docs/architecture`.
- `packages/domain` depends on nothing external.
- `packages/application` depends only on `packages/domain` and application port contracts.
- Adapters implement application ports; UI depends only on `packages/application/public`.
- `apps/app` is a host shell only and may import one approved composition entrypoint.
- Backend BFF and worker runtimes are separate deployables even though their source lives under `packages/adapters/src/inbound/*`.
- Execution history is off-chain only.
- No on-chain receipt, attestation, claim, proof, or canonical execution certificate concepts may appear in code or CI-approved vocabulary.
- Domain concepts must explicitly include `BreachDirection`, `PostExitAssetPosture`, `ExecutionPlan`, and `SwapInstruction`.
- Directional policy logic must be pure, deterministic, and exhaustively tested.
- Wallet handoff resume state must be recoverable from backend state after interruption.
- Mobile is the reference execution surface; desktop PWA is a supported secondary surface; mobile web may degrade honestly.

### UX Design Requirements

UX-DR1: The top-level IA must remain narrow: Positions, Alerts, History, Wallet/Settings.  
UX-DR2: Actionable breach state must never be buried behind a generic dashboard.  
UX-DR3: Position detail must show current range status first and exit policy summary second.  
UX-DR4: Directional state must dominate the alert and preview hierarchy.  
UX-DR5: Execution preview must show the ordered sequence: trigger direction, remove liquidity, collect fees, swap direction, post-exit posture.  
UX-DR6: Downside previews must explicitly state `SOL -> USDC`; upside previews must explicitly state `USDC -> SOL`.  
UX-DR7: Estimates, slippage, route quality, and freshness must appear in a compact risk panel.  
UX-DR8: Wallet handoff must preserve context and return the user to a single authoritative current state.  
UX-DR9: History must show a reverse-chronological operational timeline with directional context preserved.  
UX-DR10: Failure states must distinguish stale preview, submission failure, expiry, partial completion, and reconciliation delay.  
UX-DR11: Desktop PWA must support review, history, and supported manual execution without introducing a broader dashboard shell.  
UX-DR12: Mobile web and mobile PWA must degrade honestly and must not imply parity with native signing or native push delivery.

### FR Coverage Map

FR1: Epic 4 Story 4.5, Epic 5 Story 5.2  
FR2: Epic 4 Story 4.3, Epic 6 Story 6.1  
FR3: Epic 2 Story 2.1, Epic 6 Story 6.2  
FR4: Epic 6 Story 6.1, Epic 6 Story 6.2, Epic 6 Story 6.3, Epic 6 Story 6.6  
FR5: Epic 3 Story 3.5, Epic 4 Story 4.6, Epic 5 Story 5.2  
FR6: Epic 3 Story 3.5, Epic 6 Story 6.1, Epic 7 Story 7.3  
FR7: Epic 3 Story 3.5, Epic 4 Story 4.6, Epic 7 Story 7.3  
FR8: Epic 3 Story 3.2, Epic 4 Story 4.3  
FR9: Epic 2 Story 2.1, Epic 3 Story 3.2  
FR10: Epic 2 Story 2.1, Epic 3 Story 3.2  
FR11: Epic 2 Story 2.1, Epic 3 Story 3.2, Epic 4 Story 4.1  
FR12: Epic 2 Story 2.1, Epic 3 Story 3.2, Epic 7 Story 7.1  
FR13: Epic 2 Story 2.2, Epic 3 Story 3.3, Epic 4 Story 4.4  
FR14: Epic 2 Story 2.2, Epic 3 Story 3.3, Epic 4 Story 4.4  
FR15: Epic 2 Story 2.3, Epic 3 Story 3.3, Epic 6 Story 6.2, Epic 6 Story 6.3, Epic 6 Story 6.4, Epic 6 Story 6.5, Epic 6 Story 6.6  
FR16: Epic 2 Story 2.2, Epic 3 Story 3.3  
FR17: Epic 7 Story 7.1, Epic 7 Story 7.2  
FR18: Epic 3 Story 3.5, Epic 4 Story 4.6, Epic 7 Story 7.2  
FR19: Epic 6 Story 6.1, Epic 7 Story 7.3  
FR20: Epic 2 Story 2.1, Epic 6 Story 6.1, Epic 7 Story 7.1  
FR21: Epic 3 Story 3.5, Epic 6 Story 6.1, Epic 7 Story 7.3  
FR22: Epic 3 Story 3.3, Epic 6 Story 6.3  
FR23: Epic 2 Story 2.2, Epic 6 Story 6.3  
FR24: Epic 2 Story 2.2, Epic 6 Story 6.3  
FR25: Epic 2 Story 2.2, Epic 3 Story 3.3, Epic 6 Story 6.3  
FR26: Epic 2 Story 2.2, Epic 3 Story 3.3, Epic 6 Story 6.3  
FR27: Epic 2 Story 2.3, Epic 3 Story 3.3, Epic 6 Story 6.3  
FR28: Epic 3 Story 3.3, Epic 6 Story 6.3  
FR29: Epic 2 Story 2.3, Epic 6 Story 6.3, Epic 6 Story 6.5  
FR30: Epic 3 Story 3.4, Epic 4 Story 4.5, Epic 6 Story 6.4  
FR31: Epic 2 Story 2.2, Epic 3 Story 3.4, Epic 4 Story 4.4  
FR32: Epic 2 Story 2.3, Epic 3 Story 3.4, Epic 6 Story 6.4, Epic 6 Story 6.5  
FR33: Epic 2 Story 2.3, Epic 6 Story 6.4, Epic 6 Story 6.5  
FR34: Epic 3 Story 3.4, Epic 6 Story 6.4, Epic 6 Story 6.5  
FR35: Epic 2 Story 2.3, Epic 3 Story 3.3, Epic 6 Story 6.3  
FR36: Epic 2 Story 2.3, Epic 6 Story 6.5  
FR37: Epic 2 Story 2.3, Epic 3 Story 3.4, Epic 6 Story 6.5  
FR38: Epic 2 Story 2.3, Epic 3 Story 3.4, Epic 6 Story 6.5  
FR39: Epic 2 Story 2.3, Epic 6 Story 6.5  
FR40: Epic 4 Story 4.1, Epic 6 Story 6.6  
FR41: Epic 2 Story 2.3, Epic 4 Story 4.1, Epic 6 Story 6.6  
FR42: Epic 4 Story 4.1, Epic 6 Story 6.6  
FR43: Epic 4 Story 4.2, Epic 8 Story 8.3  
FR44: Epic 4 Story 4.1  
FR45: Epic 5 Story 5.1, Epic 5 Story 5.2, Epic 6 Story 6.1, Epic 6 Story 6.2, Epic 6 Story 6.3, Epic 6 Story 6.4, Epic 6 Story 6.5  
FR46: Epic 5 Story 5.3, Epic 6 Story 6.7  
FR47: Epic 5 Story 5.3, Epic 7 Story 7.3

## Epic List

### Epic 1: Repo Foundation And CI Guardrails
Establish the frozen monorepo structure, compile graph, test harness, and CI guardrails so every later story executes within enforceable clean architecture boundaries.
**FRs covered:** FR5, FR44  

### Epic 2: Domain Model
Model positions, triggers, directional exit policy, preview state, execution lifecycle, and off-chain history as explicit domain concepts that cannot collapse into a generic exit flow.
**FRs covered:** FR3, FR9-FR16, FR23-FR29, FR32-FR39, FR41  

### Epic 3: Application Use Cases
Expose application-facing ports, DTOs, and use cases for monitoring, trigger qualification, preview orchestration, execution, resume, and history without leaking infrastructure or UI concerns.
**FRs covered:** FR5-FR7, FR8-FR18, FR22-FR39  

### Epic 4: Infrastructure Adapters
Implement the off-chain storage, Solana read, swap/execution, wallet signing, capability, and runtime adapters required to back the shared application layer.
**FRs covered:** FR1-FR2, FR5, FR8-FR14, FR30-FR31, FR40-FR44  

### Epic 5: Expo Universal App Shell
Create the Expo-based host shell for React Native and web/PWA with strict composition boundaries and honest platform capability handling.
**FRs covered:** FR1, FR5, FR45-FR47  

### Epic 6: Core Feature UI
Deliver the core mobile-first UI for positions, alerts, execution preview, signing status, results, history, and desktop PWA review/manual execution.
**FRs covered:** FR2-FR4, FR6, FR15, FR19, FR21-FR39, FR40-FR42, FR45-FR46  

### Epic 7: Notifications
Deliver best-effort actionable notifications, deep-link re-entry, duplicate suppression, and degraded-state messaging across native and desktop PWA surfaces.
**FRs covered:** FR7, FR12, FR17-FR21  

### Epic 8: Hardening And Smoke Tests
Validate that the integrated system preserves the directional policy, off-chain history, degraded-state honesty, and CI boundary enforcement before implementation handoff is considered complete.
**FRs covered:** FR5, FR13-FR15, FR17-FR18, FR27-FR29, FR32-FR44, FR45-FR47

## Epic 1: Repo Foundation And CI Guardrails

Create an enforceable foundation that prevents layer drift, repo sprawl, and forbidden receipt-style subsystems before any business behavior is implemented.

### Story 1.1: Freeze The Workspace And Compile Graph

As an implementation agent,
I want the frozen workspace packages and TypeScript project references established,
So that all future stories start from the approved repository structure and dependency graph.

**Affected Layer/Package:** workspace root, `packages/config`
**Requirements:** NFR14, Additional Requirements

**Acceptance Criteria:**

- Given a clean checkout, when workspace manifests and package directories are created, then only the approved top-level structure exists: `apps/app`, `packages/domain`, `packages/application`, `packages/adapters`, `packages/ui`, `packages/config`, `packages/testing`, and `docs/architecture`.
- Given TypeScript project references are configured, when a workspace build is run, then the compile graph permits `domain -> none`, `application -> domain`, `adapters -> application/domain`, `ui -> application/public`, and `apps/app -> ui/application/public/config/one approved composition entrypoint`.
### Story 1.2: Enforce Architecture Boundaries In CI

As an implementation agent,
I want CI rules that fail illegal imports and banned architectural concepts,
So that clean architecture and the no-receipt rule are mechanically enforced.

**Affected Layer/Package:** `packages/config`, CI configuration
**Requirements:** NFR14, NFR15, Additional Requirements

**Acceptance Criteria:**

- Given dependency-cruiser and lint rules are configured, when a forbidden import is introduced from `packages/application` to adapters or from `packages/ui` to adapters, then CI fails.
- Given banned-concept scanning is configured, when code introduces `Receipt`, `Attestation`, `Proof`, `ClaimVerification`, `OnChainHistory`, or equivalent concepts, then CI fails.
- Given the app-shell exception is narrow, when any file outside the approved top-level composition bootstrap imports `packages/adapters`, then CI fails.

### Story 1.3: Establish Shared Testing Harness And Fakes

As an implementation agent,
I want reusable fake ports, fixtures, and scenario helpers,
So that later stories can be tested without inventing ad hoc scaffolding.

**Affected Layer/Package:** `packages/testing`
**Requirements:** NFR4, NFR5, NFR14

**Acceptance Criteria:**

- Given the testing package exists, when later stories import fake ports and fixtures, then they do so from `packages/testing` public APIs only.
- Given shared scenario helpers are defined, when domain and application tests are added later, then they can model lower-bound and upper-bound paths independently.
- Given the test harness is reviewed, when scanning package names and helpers, then no on-chain receipt, attestation, claim, or proof helpers exist.

### Story 1.4: Create Runtime Skeletons For Client, BFF, And Worker

As an implementation agent,
I want the host-shell, BFF, and worker entry skeletons in their approved locations,
So that later stories do not invent runtime topology.

**Affected Layer/Package:** `apps/app`, `packages/adapters/src/inbound/*`, `packages/adapters/src/composition`
**Requirements:** NFR4, Additional Requirements

**Acceptance Criteria:**

- Given the frozen repo structure, when runtime skeletons are added, then client code lives under `apps/app`, BFF entrypoints live under `packages/adapters/src/inbound/http`, and worker entrypoints live under `packages/adapters/src/inbound/jobs`.
- Given the host shell boundary is frozen, when `apps/app` is inspected, then it owns route files, platform bootstrap, and one client composition bootstrap only.
- Given runtime separation is required, when server-only code is inspected, then it is not imported into `packages/ui`, `packages/application/public`, or client bundles.
- Given future Ralph stories use these entrypoints, when they add behavior, then they do so without creating a separate top-level backend app or changing the approved structure.

## Epic 2: Domain Model

Model the business core so breach direction, target asset posture, execution plan, and execution state are explicit, deterministic, and impossible to hide in adapters or UI.

### Story 2.1: Model Positions, Range State, Breach Episodes, And Triggers

As a product team,
I want position surveillance and trigger qualification concepts explicitly modeled,
So that monitoring and actionable triggers are position-specific and direction-aware.

**Affected Layer/Package:** `packages/domain`, `packages/testing`
**Requirements:** FR3, FR9-FR12, FR15, FR20

**Acceptance Criteria:**

- Given a supported position, when the domain evaluates current price against range bounds, then the resulting range state distinguishes in-range, below-range, and above-range.
- Given an out-of-range observation, when confirmation rules are applied, then the domain can create an actionable trigger with position id, breach direction, trigger time, confirmation state, and confirmation evaluation timestamp.
- Given repeated observations inside a single breach episode, when trigger qualification is run again, then duplicate actionable triggers are suppressed for that episode.

### Story 2.2: Model The Directional Exit Policy And Execution Plan

As a product team,
I want the directional exit invariant encoded in pure domain services,
So that no implementation path can collapse the core flow into a generic exit.

**Affected Layer/Package:** `packages/domain`, `packages/testing`
**Requirements:** FR13-FR16, FR23-FR26, NFR8

**Acceptance Criteria:**

- Given a confirmed breach below the lower bound, when the domain builds an execution plan, then the resulting execution plan targets a USDC post-exit posture and the ordered steps are remove liquidity, collect fees, and swap SOL to USDC.
- Given a confirmed breach above the upper bound, when the domain builds an execution plan, then the resulting execution plan targets a SOL post-exit posture and the ordered steps are remove liquidity, collect fees, and swap USDC to SOL.
- Given either breach direction, when the execution plan is inspected, then breach direction, target post-exit asset posture, execution plan, and swap instruction are explicit domain concepts rather than inferred adapter logic.
- Given domain tests are run, when the lower-bound and upper-bound cases are executed, then both breach directions are covered independently.

### Story 2.3: Model Preview Freshness, Lifecycle State, Retry Boundaries, And History Events

As a product team,
I want preview, execution, retry, and history semantics modeled in the domain,
So that stale-state handling and partial-completion behavior are deterministic.

**Affected Layer/Package:** `packages/domain`, `packages/testing`
**Requirements:** FR27-FR29, FR32-FR39, FR41

**Acceptance Criteria:**

- Given an execution preview snapshot, when freshness policy is evaluated, then the preview state is explicit as fresh, stale, or expired.
- Given an execution attempt with partial chain completion, when retry eligibility is evaluated, then blind full-sequence retry is rejected and allowed next actions remain explicit.
- Given history events are emitted for trigger, preview, signing, submission, reconciliation, and terminal states, when the domain reduces them into lifecycle state, then directional context is preserved in every relevant state transition.

### Story 2.4: Lock The Domain Vocabulary Against Receipt-Style Concepts

As an implementation agent,
I want the domain vocabulary explicitly bounded,
So that future stories cannot reintroduce forbidden proof-style concepts under a different name.

**Affected Layer/Package:** `packages/domain`, `packages/config`
**Requirements:** NFR15, Additional Requirements

**Acceptance Criteria:**

- Given the domain package is reviewed, when entities and value objects are enumerated, then they include `BreachDirection`, `PostExitAssetPosture`, `ExecutionPlan`, and `SwapInstruction`.
- Given the off-chain history model exists, when transaction references are represented, then they are operational references only and not modeled as receipts, attestations, proofs, or claims.
- Given CI banned-concept rules are applied to domain code, when a forbidden receipt-style concept is introduced, then the change fails validation.

## Epic 3: Application Use Cases

Expose stable application-facing contracts and orchestration so UI and adapters can proceed independently without making architecture decisions.

### Story 3.1: Define Application Ports, DTOs, And Public Facades

As an implementation agent,
I want the application layer to publish stable public contracts,
So that UI and adapters can build against explicit APIs instead of deep imports.

**Affected Layer/Package:** `packages/application`
**Requirements:** Additional Requirements, NFR14

**Acceptance Criteria:**

- Given the application package is initialized, when ports are defined, then they cover storage, Solana reads, swap quoting, execution preparation/submission, wallet signing, notification dispatch, platform capability, notification permission, deep-link entry, clock, id generation, and execution session persistence.
- Given UI-facing contracts are published, when `packages/ui` integrates later, then it imports only from `packages/application/public`.
- Given the package boundary is reviewed, when application code is scanned, then no Solana SDK, React, React Native, browser API, or Expo API imports are present.

### Story 3.2: Orchestrate Monitoring And Trigger Qualification Use Cases

As a backend operator,
I want application use cases for breach scanning and trigger qualification,
So that monitoring can create actionable triggers without embedding policy in adapters.

**Affected Layer/Package:** `packages/application`, `packages/testing`
**Requirements:** FR8-FR12, FR20

**Acceptance Criteria:**

- Given position snapshots and range observations are supplied through ports, when `ScanPositionsForBreaches` runs, then it evaluates supported positions against lower and upper bounds only.
- Given a below-range or above-range observation, when `QualifyActionableTrigger` runs, then the resulting trigger retains explicit breach direction and confirmation metadata.
- Given duplicate observations in one breach episode, when trigger qualification is repeated, then the application layer does not create conflicting actionable states.

### Story 3.3: Orchestrate Directional Preview Use Cases

As a user,
I want preview use cases to preserve directional policy end to end,
So that the preview remains explicit, fresh, and directionally correct before any signing occurs.

**Affected Layer/Package:** `packages/application`, `packages/testing`
**Requirements:** FR13-FR16, FR22-FR29, FR35, NFR8

**Acceptance Criteria:**

- Given a confirmed breach below the lower bound, when the application creates or refreshes a preview, then the resulting execution plan targets a USDC post-exit posture.
- Given a confirmed breach above the upper bound, when the application creates or refreshes a preview, then the resulting execution plan targets a SOL post-exit posture.
- Given either breach direction, when the execution preview DTO is produced, then it states the correct swap direction for each case: `SOL -> USDC` for downside and `USDC -> SOL` for upside.
- Given a preview becomes stale or expired, when refresh logic is evaluated, then the application layer requires refresh before signing and produces a refreshed preview DTO rather than reusing stale data.

### Story 3.4: Orchestrate Execution Submission And Recovery Use Cases

As a user,
I want execution submission and recovery use cases to preserve directional policy after approval,
So that signing, submission, reconciliation, and retry behavior remain explicit and safe.

**Affected Layer/Package:** `packages/application`, `packages/testing`
**Requirements:** FR30-FR39, NFR8

**Acceptance Criteria:**

- Given a user declines to sign, when execution submission is attempted, then the application layer stops execution and records the decline path explicitly.
- Given a signed execution request, when submission and reconciliation are orchestrated, then submission is treated as distinct from confirmation and lifecycle states remain explicit.
- Given a partially completed execution attempt, when retry logic is evaluated, then the application layer prevents blind full replay and exposes the next allowed action only.
- Given domain tests and application/use-case tests are run, when both breach directions are exercised independently, then application/use-case tests verify that the correct adapter calls are orchestrated for each direction and in the correct order.

### Story 3.5: Orchestrate History, Capability Sync, Deep-Link Resolution, And Resume

As a user,
I want the application layer to resolve entry context and restore interrupted execution sessions,
So that mobile-first wallet handoff and PWA re-entry stay coherent.

**Affected Layer/Package:** `packages/application`, `packages/testing`
**Requirements:** FR5-FR7, FR18, FR21, FR40-FR44, FR47

**Acceptance Criteria:**

- Given a notification tap, deep link, or app relaunch, when `ResolveExecutionEntryContext` runs, then it resolves the user into trigger, preview, history, or degraded recovery context without platform-specific logic in the UI.
- Given an interrupted awaiting-signature session, when `ResumeExecutionAttempt` runs, then the authoritative source of truth is backend session state and client state is treated as cache only.
- Given history queries are requested, when `GetExecutionHistory` and `GetExecutionAttemptDetail` run, then they expose off-chain operational history with directional context and transaction references where available.

## Epic 4: Infrastructure Adapters

Implement the runtime adapters that satisfy the application ports while preserving the architecture boundaries and the off-chain-only history rule.

### Story 4.1: Implement Off-Chain Storage Adapters

As a backend operator,
I want durable off-chain storage for triggers, previews, execution sessions, and history,
So that execution state survives device loss and remains queryable as off-chain operational history.

**Affected Layer/Package:** `packages/adapters`, `packages/testing`
**Requirements:** FR11-FR12, FR40-FR42, FR44, NFR5, NFR7

**Acceptance Criteria:**

- Given storage adapters are implemented, when trigger, preview, signing, submission, reconciliation, and terminal events are persisted, then they are stored off-chain only.
- Given an app reinstall or device change, when history is queried again, then the operational record remains available from backend storage.
- Given off-chain trigger, preview, execution session, and history records are persisted, when backend storage is configured, then persisted data at rest uses managed backend encryption controls.
- Given storage schema and adapter configuration are reviewed, when secrets handling is checked, then wallet private keys and signing authority are not stored in the backend.
- Given transaction references are stored, when the adapter schema is reviewed, then no receipt, attestation, proof, or claim subsystem is modeled.

### Story 4.2: Implement Observability Adapters

As a backend operator,
I want observability adapters that record operational timing and support diagnostics,
So that support can troubleshoot breach detection, alert delivery, preview freshness, and reconciliation behavior.

**Affected Layer/Package:** `packages/adapters`, `packages/testing`
**Requirements:** FR43, NFR9, NFR10

**Acceptance Criteria:**

- Given observability adapters are implemented, when breach detection and notification delivery events are recorded, then detection time and notification-delivery time are stored as separate fields for support analysis.
- Given trigger, preview, signing, submission, and reconciliation flows emit telemetry, when support diagnostics are reviewed, then the operational record supports debugging of trigger timing, preview freshness, submission attempts, and reconciliation updates.
- Given observability schemas and event names are reviewed, when support-facing terminology is inspected, then no receipt, attestation, proof, or claim subsystem is implied.

### Story 4.3: Implement Supported Position Read And Range Observation Adapters

As a backend operator,
I want Solana-backed read adapters normalized behind ports,
So that position surveillance uses supported Orca data without leaking SDK types inward.

**Affected Layer/Package:** `packages/adapters`, `packages/testing`
**Requirements:** FR2-FR3, FR8-FR12

**Acceptance Criteria:**

- Given Orca-backed position reads are implemented, when supported positions are fetched, then adapter outputs are translated immediately into application/domain DTOs.
- Given range observations are fetched, when lower-bound and upper-bound conditions are reported, then the adapter does not decide business policy or target posture.
- Given adapter contract tests are run, when external SDK shapes change or vary, then the port contract still returns normalized position and range data.

### Story 4.4: Implement Swap Quote, Execution Preparation, And Submission Adapters

As a backend operator,
I want infrastructure adapters for quoting and protocol execution,
So that the application layer can orchestrate exits without owning chain-specific details.

**Affected Layer/Package:** `packages/adapters`, `packages/testing`
**Requirements:** FR13-FR16, FR22-FR35

**Acceptance Criteria:**

- Given an execution plan generated by the application layer, when execution preparation runs, then the adapter preserves the provided step order and does not reinterpret breach direction.
- Given a downside execution plan, when quote or submission preparation runs, then the adapter receives a swap instruction for `SOL -> USDC` and does not rewrite it.
- Given an upside execution plan, when quote or submission preparation runs, then the adapter receives a swap instruction for `USDC -> SOL` and does not rewrite it.
- Given contract tests are run, when both directions are exercised, then adapter behavior proves it preserves the domain-generated `SwapInstruction` and ordered execution plan.

### Story 4.5: Implement Wallet Signing Adapters

As a user,
I want wallet signing adapters isolated at the edge,
So that signing remains explicit, wallet-mediated, and non-custodial across supported platforms.

**Affected Layer/Package:** `packages/adapters`, `packages/testing`
**Requirements:** FR1, FR30, FR45-FR46

**Acceptance Criteria:**

- Given native and browser wallet adapters are implemented, when a signature is requested, then explicit user approval remains wallet-mediated and no signing authority is stored by the backend.
- Given supported native and desktop-browser wallet contexts, when signing is invoked, then the adapter contract exposes a consistent application-facing signing result without leaking platform SDK types inward.
- Given wallet contract tests are run, when signing success, decline, and interruption cases are exercised, then the adapter behavior remains explicit and non-custodial.

### Story 4.6: Implement Capability, Permission, And Deep-Link Adapters

As a user,
I want platform capability, permission, and deep-link adapters isolated at the edge,
So that mobile-native and PWA flows remain honest about what each platform can do.

**Affected Layer/Package:** `packages/adapters`, `packages/testing`
**Requirements:** FR5-FR7, FR18, FR45-FR47

**Acceptance Criteria:**

- Given platform capability and notification-permission adapters are implemented, when capability state is synchronized, then native push capability, browser notification capability, native wallet capability, browser-wallet capability, and unsupported mobile web capability are distinguished explicitly.
- Given deep-link adapters are implemented, when alert or resume metadata is parsed, then they only parse platform entry metadata and do not decide application business outcomes.
- Given permission and deep-link contract tests are run, when native, desktop PWA, and unsupported mobile web cases are exercised, then degraded states and re-entry metadata are represented explicitly without inventing business policy in adapters.

## Epic 5: Expo Universal App Shell

Create the host shell and platform bootstrap for native mobile and web/PWA without weakening package ownership or runtime separation.

### Story 5.1: Create The Expo Host Shell And Route Skeleton

As an implementation agent,
I want the Expo app shell and route files created in the approved host-shell boundary,
So that native and web/PWA clients have a stable entry structure.

**Affected Layer/Package:** `apps/app`
**Requirements:** FR45-FR47, Additional Requirements

**Acceptance Criteria:**

- Given `apps/app` is implemented, when its structure is inspected, then it contains route files, deep-link entrypoints, platform bootstrap, and no owned screen components.
- Given the route skeleton is created, when future UI stories are added, then screens are imported from `packages/ui/src/screens` rather than implemented in `apps/app`.
- Given the app shell is reviewed, when imports are scanned, then it does not directly import adapters outside the one approved composition bootstrap path.

### Story 5.2: Wire The Client Composition Bootstrap To Application Public APIs

As an implementation agent,
I want the app shell to compose UI and application contracts through one approved bootstrap,
So that wallet handoff, query access, and execution flows are wired without boundary leakage.

**Affected Layer/Package:** `apps/app`, `packages/application/public`, `packages/ui`
**Requirements:** FR1, FR5, FR45

**Acceptance Criteria:**

- Given the composition bootstrap is implemented, when the app is started, then UI dependencies are resolved from `packages/application/public` contracts only.
- Given a wallet handoff return, when composition is resumed, then application resume and entry-context use cases can be invoked without direct adapter imports from screen code.
- Given composition boundaries are checked, when a screen or presenter is inspected, then infrastructure wiring does not appear there.

### Story 5.3: Enable Web/PWA Bootstrap With Honest Degradation

As a desktop or mobile web user,
I want the universal shell to expose only supported capabilities per platform,
So that the product remains honest about native-first and PWA-secondary behavior.

**Affected Layer/Package:** `apps/app`, `packages/ui`, `packages/application/public`
**Requirements:** FR46-FR47, UX-DR11, UX-DR12

**Acceptance Criteria:**

- Given the web/PWA shell is bootstrapped, when a desktop browser with compatible wallet support is used, then review, history, and supported manual signed execution flows are available.
- Given mobile web or mobile PWA lacks native-equivalent capability, when the user enters an execution path, then the app degrades honestly rather than implying parity with native signing or native push.
- Given platform capability state is available, when the shell renders supported vs degraded experiences, then the decision is driven by application capability DTOs rather than UI heuristics.

## Epic 6: Core Feature UI

Deliver the mobile-first UI for the narrow breach-to-exit workflow and the supporting desktop PWA review surface.

### Story 6.1: Build Positions And Alerts Screens

As an active LP,
I want to see supported positions and actionable alerts quickly,
So that I can understand whether action is needed without browsing a generic dashboard.

**Affected Layer/Package:** `packages/ui`, `apps/app`
**Requirements:** FR2, FR4, FR6, FR19-FR21, UX-DR1-UX-DR2

**Acceptance Criteria:**

- Given positions and alerts data are available, when the user opens the app, then actionable positions or alerts are reachable without a generic dashboard gate.
- Given the positions list is rendered, when supported positions are present, then each row shows the position identity, current range status, and latest operational state without unrelated portfolio analytics.
- Given the alerts list is rendered, when an actionable or recently degraded alert exists, then breach direction and urgency to review are visually primary.
- Given the user selects a position or alert, when navigation occurs, then the route enters the relevant position detail or preview path without forcing a dashboard hop.
- Given capability or notification delivery is degraded, when the user views the relevant positions or alerts state, then the app explains what is unavailable and what the user can still do.

### Story 6.2: Build Position Detail Screen

As an active LP,
I want position detail to explain current range state and fixed exit policy clearly,
So that I can understand current posture and the directional action path before opening a preview.

**Affected Layer/Package:** `packages/ui`, `apps/app`
**Requirements:** FR3-FR4, FR15, UX-DR3-UX-DR4

**Acceptance Criteria:**

- Given a position detail screen is rendered, when a breach exists, then breach direction is visually primary and current range status is shown before deeper detail.
- Given an actionable downside trigger, when position detail is rendered, then the screen pairs the breach state with the expected post-exit posture and explicitly shows `SOL -> USDC`.
- Given an actionable upside trigger, when position detail is rendered, then the screen pairs the breach state with the expected post-exit posture and explicitly shows `USDC -> SOL`.
- Given any position detail screen, when the user views the status block, then the fixed directional exit policy summary is visible and not editable.
- Given an out-of-range but not yet actionable state, when the screen renders, then the current likely one-sided posture is shown distinctly from the post-exit posture.
- Given a common mobile screen size, when the position detail screen renders for an actionable state, then breach direction, current posture, expected post-exit posture, and the primary next action are visible above the fold.

### Story 6.3: Build The Directional Execution Preview Screen

As an active LP,
I want the execution preview to explain the exact directional path before I sign,
So that I know what asset posture I am moving toward and why.

**Affected Layer/Package:** `packages/ui`, `packages/application/public`
**Requirements:** FR4, FR22-FR29, UX-DR5-UX-DR7

**Acceptance Criteria:**

- Given a confirmed breach below the lower bound, when the preview screen is shown, then the resulting execution plan targets a USDC post-exit posture.
- Given a confirmed breach above the upper bound, when the preview screen is shown, then the resulting execution plan targets a SOL post-exit posture.
- Given the preview is rendered for either case, when the step sequence is displayed, then the execution preview states the correct swap direction for each case.
- Given the screen is inspected, when the sequence block is read, then it shows trigger direction, remove liquidity, collect fees, swap direction, and post-exit posture in that order.
- Given a common mobile screen size, when the execution preview renders, then trigger direction, swap direction, post-exit posture, freshness state, and the primary review/sign action are visible without requiring the user to scroll.
- Given preview freshness, estimates, and risk details are available, when the screen renders, then freshness and estimate-vs-executed distinctions are explicit and compact.

### Story 6.4: Build Signing And Submission State Screen

As an active LP or support reviewer,
I want signing and submission-state views to be legible,
So that I can preserve context across wallet handoff and understand the authoritative in-flight state.

**Affected Layer/Package:** `packages/ui`, `packages/application/public`
**Requirements:** FR4-FR5, FR30-FR35, UX-DR8

**Acceptance Criteria:**

- Given the user enters signing flow, when external wallet UI is active, then context is preserved and the return path stays tied to one authoritative execution attempt.
- Given the user returns from wallet signing, when the submission-state screen is shown, then a single authoritative lifecycle state is presented instead of conflicting local and remote states.
- Given submission has occurred but reconciliation is still pending, when the state screen renders, then submission is not labeled as final completion.
- Given the user declines to sign, when the state screen is shown, then the UI clearly distinguishes abandonment from submission or confirmation failure.

### Story 6.5: Build Result And Recovery Screens

As an active LP or support reviewer,
I want result and recovery views to be legible,
So that I can understand the exact current state and next allowed action after signing or failure.

**Affected Layer/Package:** `packages/ui`, `packages/application/public`
**Requirements:** FR29, FR32-FR39, UX-DR10

**Acceptance Criteria:**

- Given a stale preview, submission failure, expiry, partial completion, or reconciliation delay, when the relevant view renders, then the state is named explicitly and the next allowed action is clear.
- Given the user declines to sign, when the result or recovery state is shown, then the UI clearly distinguishes abandonment from submission or confirmation failure.
- Given a result screen is shown after any execution attempt, when the user reviews the outcome, then estimated-versus-executed distinctions remain explicit.

### Story 6.6: Build History List And History Detail Screens

As an active LP or support reviewer,
I want history list and detail views to preserve directional operational context,
So that I can review what happened without mistaking history for proof.

**Affected Layer/Package:** `packages/ui`, `packages/application/public`
**Requirements:** FR4, FR40-FR42, UX-DR9

**Acceptance Criteria:**

- Given history data is available, when the history list or detail screen renders, then each entry preserves directional context and clearly labels the record as off-chain operational history rather than proof.
- Given transaction references are available, when a history detail view is shown, then those references are visible as operational references and not framed as receipts or attestations.

### Story 6.7: Build The Desktop PWA Review And Manual Execution Surface

As a desktop reviewer or LP,
I want a useful secondary PWA surface for review, history, and supported manual execution,
So that desktop remains helpful without becoming the primary execution model.

**Affected Layer/Package:** `packages/ui`, `apps/app`
**Requirements:** FR46, UX-DR11, UX-DR12

**Acceptance Criteria:**

- Given a supported desktop browser with compatible wallet support, when the PWA is opened, then users can review positions, triggers, previews, history, and supported manual signed execution.
- Given desktop has more horizontal space, when the UI is rendered, then it uses the same narrow IA and does not introduce a broader analytics or dashboard shell.
- Given mobile web lacks equivalent support, when the same surface is visited there, then degradation is explicit and non-parity claims remain intact.

### Story 6.8: Wire Wallet Connection Entry, Supported Wallet States, And Resume Handoff

As a user,
I want a clear wallet connection flow with explicit supported-platform and supported-wallet states,
So that I can connect once, understand whether this device is actually usable for monitoring and execution, and reach my positions without confusion.

**Affected Layer/Package:** `packages/ui`, `apps/app`, `packages/application/public`
**Requirements:** FR1, FR2, FR5-FR7, FR45-FR47, UX-DR1, UX-DR8, UX-DR11, UX-DR12

**Acceptance Criteria:**

- Given the user opens the app while disconnected, when the initial wallet state is rendered, then the primary screen presents a clear connect-wallet entry point rather than an empty positions surface or generic dashboard.
- Given the user chooses to connect, when the wallet-selection flow is opened, then only supported wallet options for the current platform are presented and unsupported options are not implied to work.
- Given the user is on React Native mobile, when the wallet-selection flow renders, then native-supported wallet connection options are shown in plain language without exposing adapter or SDK terminology.
- Given the user is on a desktop PWA with compatible browser-wallet support, when the wallet-selection flow renders, then supported browser-wallet connection options are shown and desktop review/manual execution capability is represented honestly.
- Given the user is on unsupported mobile web or degraded mobile PWA, when the wallet-selection flow renders, then the UI explains degraded capability explicitly and does not imply parity with native signing or native push delivery.
- Given the wallet connection succeeds, when the app resolves the connected state, then the user is taken to the narrow core flow starting with supported positions associated with that wallet rather than to a generic dashboard.
- Given the wallet connection succeeds but no supported Orca CLMM positions are found, when the post-connect screen renders, then the UI shows a dedicated empty state explaining that the wallet is connected but no supported positions are currently available.
- Given the wallet connection fails, is cancelled, or is interrupted, when the flow returns to the app, then the UI distinguishes failed connection, user cancellation, and interrupted handoff rather than collapsing them into a generic error.
- Given a wallet handoff occurs during connection or reconnect, when the user returns to the app, then context is restored to one authoritative current state and the UI does not show conflicting local assumptions.
- Given the user is already connected, when the wallet state is viewed later from Wallet/Settings, then the screen shows connected-wallet summary plus reconnect, switch-wallet, and disconnect actions without expanding into analytics or protocol configuration.
- Given a different wallet is connected, when supported positions are queried again, then positions, alerts, and history context refresh against the newly connected wallet identity rather than stale prior-wallet state.
- Given the screen and route structure are reviewed, when navigation is inspected, then wallet connection remains part of the narrow IA and does not introduce a broader dashboard shell.

**Implementation References (Context7)**

- Resolve the exact Context7 library ID first; do not guess IDs.
- Solana Mobile Wallet Adapter overview and platform constraints.
- MWA React Native Installation.
- MWA React Native Setup.
- MWA React Native Quickstart.
- ConnectorKit / `@solana/connector`.
- Optional only if not using ConnectorKit: Solana `@solana/react-hooks` wallet docs.

## Epic 7: Notifications

Deliver best-effort notifications and re-entry flows that are operationally useful without implying guaranteed protection.

### Story 7.1: Dispatch Actionable Notifications With Duplicate Suppression

As a user,
I want actionable notifications only when a breach becomes truly actionable,
So that I am not spammed with conflicting or duplicate alerts.

**Affected Layer/Package:** `packages/application`, `packages/adapters`, `packages/testing`
**Requirements:** FR12, FR17, FR20

**Acceptance Criteria:**

- Given a breach observation that has not passed confirmation rules, when notification logic runs, then no actionable notification is dispatched.
- Given an actionable trigger is created, when notification dispatch runs, then the notification identifies the affected position, breach direction, and the need to review the execution preview.
- Given repeated qualifying evaluations inside one breach episode, when notification dispatch runs again, then duplicates are suppressed for that episode.

### Story 7.2: Implement Native Push And Deep-Link Re-Entry

As a mobile user,
I want notification taps to open directly into the relevant execution context,
So that I can move from alert to review with minimal friction.

**Affected Layer/Package:** `packages/adapters`, `apps/app`, `packages/application/public`
**Requirements:** FR17-FR19, FR45

**Acceptance Criteria:**

- Given a native push notification is delivered, when the user taps it, then the app resolves into the affected trigger or preview context rather than a generic home screen.
- Given the app is resumed through a notification while a resumable execution session exists, when entry resolution runs, then the user lands in the appropriate current state.
- Given notification delivery is best-effort, when timestamps are stored, then detection time and delivery time remain separate for debugging and user support.

### Story 7.3: Implement Desktop Browser Notifications, In-App Alerts, And Degraded-State Messaging

As a desktop or degraded-capability user,
I want clear fallback alert behavior,
So that I understand what alert coverage exists on my platform.

**Affected Layer/Package:** `packages/adapters`, `packages/ui`, `packages/application/public`
**Requirements:** FR7, FR19, FR21, FR47

**Acceptance Criteria:**

- Given browser notification permission is granted on desktop PWA, when an actionable trigger occurs, then a secondary browser notification path is available.
- Given push or browser notifications are unavailable or delayed, when the user opens the app, then in-app alerts still surface the actionable state.
- Given a degraded capability platform such as unsupported mobile web, when alert state is shown, then the UI explicitly explains degraded coverage and does not imply native parity.

## Epic 8: Hardening And Smoke Tests

Validate the integrated system against the architecture, the directional policy, and the core user journeys before story execution is considered complete.

### Story 8.1: Add Directional End-To-End Smoke Scenarios

As a release owner,
I want end-to-end smoke scenarios for both breach directions,
So that the most important product invariant is verified across layers.

**Affected Layer/Package:** `packages/testing`
**Requirements:** FR13-FR15, FR22-FR31, FR45

**Acceptance Criteria:**

- Given a confirmed breach below the lower bound, when the end-to-end smoke scenario is executed, then the resulting execution plan targets a USDC post-exit posture.
- Given a confirmed breach above the upper bound, when the end-to-end smoke scenario is executed, then the resulting execution plan targets a SOL post-exit posture.
- Given the preview is rendered in both scenarios, when assertions are evaluated, then the execution preview states the correct swap direction for each case.
- Given smoke tests are run, when both breach directions are exercised, then domain tests cover both breach directions independently and application/use-case tests verify that the correct adapter calls are orchestrated for each direction.

### Story 8.2: Add Failure, Resume, And History Smoke Scenarios

As a release owner,
I want smoke coverage for stale preview, partial completion, and resume behavior,
So that high-risk recovery paths are validated before release.

**Affected Layer/Package:** `packages/testing`
**Requirements:** FR5, FR27-FR29, FR32-FR44

**Acceptance Criteria:**

- Given a stale preview before signing, when the smoke scenario runs, then refresh is required before execution can proceed.
- Given a partial execution state, when the smoke scenario runs, then blind full replay is blocked and the next allowed action is explicit.
- Given an interrupted awaiting-signature session, when the app is resumed, then execution session state is restored from backend state and history remains intact.

### Story 8.3: Add Release-Blocking Architecture And Supportability Checks

As a release owner,
I want final release-blocking checks for boundaries, banned concepts, and observability,
So that the shipped baseline is supportable and architecture-compliant.

**Affected Layer/Package:** `packages/config`, `packages/testing`, `docs/architecture`
**Requirements:** NFR9-NFR15, Additional Requirements

**Acceptance Criteria:**

- Given the integrated repo is validated, when architecture checks run, then compile-graph, forbidden-import, and banned-concept rules all pass.
- Given supportability requirements are reviewed, when logs and history records are inspected, then trigger timing, delivery timing, preview freshness, submission attempts, and reconciliation updates are observable.
- Given the release checklist is executed, when forbidden concepts are scanned, then no on-chain receipt, attestation, claim, or proof subsystem exists anywhere in the implementation backlog or delivered baseline.
