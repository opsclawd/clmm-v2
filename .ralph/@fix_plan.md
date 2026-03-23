# Ralph Fix Plan

## Stories to Implement

### Repo Foundation And CI Guardrails
> Goal: Create an enforceable foundation that prevents layer drift, repo sprawl, and forbidden receipt-style subsystems before any business behavior is implemented.

- [ ] Story 1.1: Freeze The Workspace And Compile Graph
  > As an implementation agent
  > I want the frozen workspace packages and TypeScript project references established
  > So that all future stories start from the approved repository structure and dependency graph.
  > AC: Given a clean checkout, when workspace manifests and package directories are created, then only the approved top-level structure exists: `apps/app`, `packages/domain`, `packages/application`, `packages/adapters`, `packages/ui`, `packages/config`, `packages/testing`, and `docs/architecture`.
  > AC: Given TypeScript project references are configured, when a workspace build is run, then the compile graph permits `domain -> none`, `application -> domain`, `adapters -> application/domain`, `ui -> application/public`, and `apps/app -> ui/application/public/config/one approved composition entrypoint`.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-1-1
- [ ] Story 1.2: Enforce Architecture Boundaries In CI
  > As an implementation agent
  > I want CI rules that fail illegal imports and banned architectural concepts
  > So that clean architecture and the no-receipt rule are mechanically enforced.
  > AC: Given dependency-cruiser and lint rules are configured, when a forbidden import is introduced from `packages/application` to adapters or from `packages/ui` to adapters, then CI fails.
  > AC: Given banned-concept scanning is configured, when code introduces `Receipt`, `Attestation`, `Proof`, `ClaimVerification`, `OnChainHistory`, or equivalent concepts, then CI fails.
  > AC: Given the app-shell exception is narrow, when any file outside the approved top-level composition bootstrap imports `packages/adapters`, then CI fails.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-1-2
- [ ] Story 1.3: Establish Shared Testing Harness And Fakes
  > As an implementation agent
  > I want reusable fake ports, fixtures, and scenario helpers
  > So that later stories can be tested without inventing ad hoc scaffolding.
  > AC: Given the testing package exists, when later stories import fake ports and fixtures, then they do so from `packages/testing` public APIs only.
  > AC: Given shared scenario helpers are defined, when domain and application tests are added later, then they can model lower-bound and upper-bound paths independently.
  > AC: Given the test harness is reviewed, when scanning package names and helpers, then no on-chain receipt, attestation, claim, or proof helpers exist.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-1-3
- [ ] Story 1.4: Create Runtime Skeletons For Client, BFF, And Worker
  > As an implementation agent
  > I want the host-shell, BFF, and worker entry skeletons in their approved locations
  > So that later stories do not invent runtime topology.
  > AC: Given the frozen repo structure, when runtime skeletons are added, then client code lives under `apps/app`, BFF entrypoints live under `packages/adapters/src/inbound/http`, and worker entrypoints live under `packages/adapters/src/inbound/jobs`.
  > AC: Given the host shell boundary is frozen, when `apps/app` is inspected, then it owns route files, platform bootstrap, and one client composition bootstrap only.
  > AC: Given runtime separation is required, when server-only code is inspected, then it is not imported into `packages/ui`, `packages/application/public`, or client bundles.
  > AC: Given future Ralph stories use these entrypoints, when they add behavior, then they do so without creating a separate top-level backend app or changing the approved structure.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-1-4
### Domain Model
> Goal: Model the business core so breach direction, target asset posture, execution plan, and execution state are explicit, deterministic, and impossible to hide in adapters or UI.

- [ ] Story 2.1: Model Positions, Range State, Breach Episodes, And Triggers
  > As a product team
  > I want position surveillance and trigger qualification concepts explicitly modeled
  > So that monitoring and actionable triggers are position-specific and direction-aware.
  > AC: Given a supported position, when the domain evaluates current price against range bounds, then the resulting range state distinguishes in-range, below-range, and above-range.
  > AC: Given an out-of-range observation, when confirmation rules are applied, then the domain can create an actionable trigger with position id, breach direction, trigger time, confirmation state, and confirmation evaluation timestamp.
  > AC: Given repeated observations inside a single breach episode, when trigger qualification is run again, then duplicate actionable triggers are suppressed for that episode.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-2-1
- [ ] Story 2.2: Model The Directional Exit Policy And Execution Plan
  > As a product team
  > I want the directional exit invariant encoded in pure domain services
  > So that no implementation path can collapse the core flow into a generic exit.
  > AC: Given a confirmed breach below the lower bound, when the domain builds an execution plan, then the resulting execution plan targets a USDC post-exit posture and the ordered steps are remove liquidity, collect fees, and swap SOL to USDC.
  > AC: Given a confirmed breach above the upper bound, when the domain builds an execution plan, then the resulting execution plan targets a SOL post-exit posture and the ordered steps are remove liquidity, collect fees, and swap USDC to SOL.
  > AC: Given either breach direction, when the execution plan is inspected, then breach direction, target post-exit asset posture, execution plan, and swap instruction are explicit domain concepts rather than inferred adapter logic.
  > AC: Given domain tests are run, when the lower-bound and upper-bound cases are executed, then both breach directions are covered independently.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-2-2
- [ ] Story 2.3: Model Preview Freshness, Lifecycle State, Retry Boundaries, And History Events
  > As a product team
  > I want preview, execution, retry, and history semantics modeled in the domain
  > So that stale-state handling and partial-completion behavior are deterministic.
  > AC: Given an execution preview snapshot, when freshness policy is evaluated, then the preview state is explicit as fresh, stale, or expired.
  > AC: Given an execution attempt with partial chain completion, when retry eligibility is evaluated, then blind full-sequence retry is rejected and allowed next actions remain explicit.
  > AC: Given history events are emitted for trigger, preview, signing, submission, reconciliation, and terminal states, when the domain reduces them into lifecycle state, then directional context is preserved in every relevant state transition.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-2-3
- [ ] Story 2.4: Lock The Domain Vocabulary Against Receipt-Style Concepts
  > As an implementation agent
  > I want the domain vocabulary explicitly bounded
  > So that future stories cannot reintroduce forbidden proof-style concepts under a different name.
  > AC: Given the domain package is reviewed, when entities and value objects are enumerated, then they include `BreachDirection`, `PostExitAssetPosture`, `ExecutionPlan`, and `SwapInstruction`.
  > AC: Given the off-chain history model exists, when transaction references are represented, then they are operational references only and not modeled as receipts, attestations, proofs, or claims.
  > AC: Given CI banned-concept rules are applied to domain code, when a forbidden receipt-style concept is introduced, then the change fails validation.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-2-4
### Application Use Cases
> Goal: Expose stable application-facing contracts and orchestration so UI and adapters can proceed independently without making architecture decisions.

- [ ] Story 3.1: Define Application Ports, DTOs, And Public Facades
  > As an implementation agent
  > I want the application layer to publish stable public contracts
  > So that UI and adapters can build against explicit APIs instead of deep imports.
  > AC: Given the application package is initialized, when ports are defined, then they cover storage, Solana reads, swap quoting, execution preparation/submission, wallet signing, notification dispatch, platform capability, notification permission, deep-link entry, clock, id generation, and execution session persistence.
  > AC: Given UI-facing contracts are published, when `packages/ui` integrates later, then it imports only from `packages/application/public`.
  > AC: Given the package boundary is reviewed, when application code is scanned, then no Solana SDK, React, React Native, browser API, or Expo API imports are present.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-3-1
- [ ] Story 3.2: Orchestrate Monitoring And Trigger Qualification Use Cases
  > As a backend operator
  > I want application use cases for breach scanning and trigger qualification
  > So that monitoring can create actionable triggers without embedding policy in adapters.
  > AC: Given position snapshots and range observations are supplied through ports, when `ScanPositionsForBreaches` runs, then it evaluates supported positions against lower and upper bounds only.
  > AC: Given a below-range or above-range observation, when `QualifyActionableTrigger` runs, then the resulting trigger retains explicit breach direction and confirmation metadata.
  > AC: Given duplicate observations in one breach episode, when trigger qualification is repeated, then the application layer does not create conflicting actionable states.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-3-2
- [ ] Story 3.3: Orchestrate Directional Preview Use Cases
  > As a user
  > I want preview use cases to preserve directional policy end to end
  > So that the preview remains explicit, fresh, and directionally correct before any signing occurs.
  > AC: Given a confirmed breach below the lower bound, when the application creates or refreshes a preview, then the resulting execution plan targets a USDC post-exit posture.
  > AC: Given a confirmed breach above the upper bound, when the application creates or refreshes a preview, then the resulting execution plan targets a SOL post-exit posture.
  > AC: Given either breach direction, when the execution preview DTO is produced, then it states the correct swap direction for each case: `SOL -> USDC` for downside and `USDC -> SOL` for upside.
  > AC: Given a preview becomes stale or expired, when refresh logic is evaluated, then the application layer requires refresh before signing and produces a refreshed preview DTO rather than reusing stale data.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-3-3
- [ ] Story 3.4: Orchestrate Execution Submission And Recovery Use Cases
  > As a user
  > I want execution submission and recovery use cases to preserve directional policy after approval
  > So that signing, submission, reconciliation, and retry behavior remain explicit and safe.
  > AC: Given a user declines to sign, when execution submission is attempted, then the application layer stops execution and records the decline path explicitly.
  > AC: Given a signed execution request, when submission and reconciliation are orchestrated, then submission is treated as distinct from confirmation and lifecycle states remain explicit.
  > AC: Given a partially completed execution attempt, when retry logic is evaluated, then the application layer prevents blind full replay and exposes the next allowed action only.
  > AC: Given domain tests and application/use-case tests are run, when both breach directions are exercised independently, then application/use-case tests verify that the correct adapter calls are orchestrated for each direction and in the correct order.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-3-4
- [ ] Story 3.5: Orchestrate History, Capability Sync, Deep-Link Resolution, And Resume
  > As a user
  > I want the application layer to resolve entry context and restore interrupted execution sessions
  > So that mobile-first wallet handoff and PWA re-entry stay coherent.
  > AC: Given a notification tap, deep link, or app relaunch, when `ResolveExecutionEntryContext` runs, then it resolves the user into trigger, preview, history, or degraded recovery context without platform-specific logic in the UI.
  > AC: Given an interrupted awaiting-signature session, when `ResumeExecutionAttempt` runs, then the authoritative source of truth is backend session state and client state is treated as cache only.
  > AC: Given history queries are requested, when `GetExecutionHistory` and `GetExecutionAttemptDetail` run, then they expose off-chain operational history with directional context and transaction references where available.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-3-5
### Infrastructure Adapters
> Goal: Implement the runtime adapters that satisfy the application ports while preserving the architecture boundaries and the off-chain-only history rule.

- [ ] Story 4.1: Implement Off-Chain Storage Adapters
  > As a backend operator
  > I want durable off-chain storage for triggers, previews, execution sessions, and history
  > So that execution state survives device loss and remains queryable as off-chain operational history.
  > AC: Given storage adapters are implemented, when trigger, preview, signing, submission, reconciliation, and terminal events are persisted, then they are stored off-chain only.
  > AC: Given an app reinstall or device change, when history is queried again, then the operational record remains available from backend storage.
  > AC: Given off-chain trigger, preview, execution session, and history records are persisted, when backend storage is configured, then persisted data at rest uses managed backend encryption controls.
  > AC: Given storage schema and adapter configuration are reviewed, when secrets handling is checked, then wallet private keys and signing authority are not stored in the backend.
  > AC: Given transaction references are stored, when the adapter schema is reviewed, then no receipt, attestation, proof, or claim subsystem is modeled.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-4-1
- [ ] Story 4.2: Implement Observability Adapters
  > As a backend operator
  > I want observability adapters that record operational timing and support diagnostics
  > So that support can troubleshoot breach detection, alert delivery, preview freshness, and reconciliation behavior.
  > AC: Given observability adapters are implemented, when breach detection and notification delivery events are recorded, then detection time and notification-delivery time are stored as separate fields for support analysis.
  > AC: Given trigger, preview, signing, submission, and reconciliation flows emit telemetry, when support diagnostics are reviewed, then the operational record supports debugging of trigger timing, preview freshness, submission attempts, and reconciliation updates.
  > AC: Given observability schemas and event names are reviewed, when support-facing terminology is inspected, then no receipt, attestation, proof, or claim subsystem is implied.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-4-2
- [ ] Story 4.3: Implement Supported Position Read And Range Observation Adapters
  > As a backend operator
  > I want Solana-backed read adapters normalized behind ports
  > So that position surveillance uses supported Orca data without leaking SDK types inward.
  > AC: Given Orca-backed position reads are implemented, when supported positions are fetched, then adapter outputs are translated immediately into application/domain DTOs.
  > AC: Given range observations are fetched, when lower-bound and upper-bound conditions are reported, then the adapter does not decide business policy or target posture.
  > AC: Given adapter contract tests are run, when external SDK shapes change or vary, then the port contract still returns normalized position and range data.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-4-3
- [ ] Story 4.4: Implement Swap Quote, Execution Preparation, And Submission Adapters
  > As a backend operator
  > I want infrastructure adapters for quoting and protocol execution
  > So that the application layer can orchestrate exits without owning chain-specific details.
  > AC: Given an execution plan generated by the application layer, when execution preparation runs, then the adapter preserves the provided step order and does not reinterpret breach direction.
  > AC: Given a downside execution plan, when quote or submission preparation runs, then the adapter receives a swap instruction for `SOL -> USDC` and does not rewrite it.
  > AC: Given an upside execution plan, when quote or submission preparation runs, then the adapter receives a swap instruction for `USDC -> SOL` and does not rewrite it.
  > AC: Given contract tests are run, when both directions are exercised, then adapter behavior proves it preserves the domain-generated `SwapInstruction` and ordered execution plan.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-4-4
- [ ] Story 4.5: Implement Wallet Signing Adapters
  > As a user
  > I want wallet signing adapters isolated at the edge
  > So that signing remains explicit, wallet-mediated, and non-custodial across supported platforms.
  > AC: Given native and browser wallet adapters are implemented, when a signature is requested, then explicit user approval remains wallet-mediated and no signing authority is stored by the backend.
  > AC: Given supported native and desktop-browser wallet contexts, when signing is invoked, then the adapter contract exposes a consistent application-facing signing result without leaking platform SDK types inward.
  > AC: Given wallet contract tests are run, when signing success, decline, and interruption cases are exercised, then the adapter behavior remains explicit and non-custodial.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-4-5
- [ ] Story 4.6: Implement Capability, Permission, And Deep-Link Adapters
  > As a user
  > I want platform capability, permission, and deep-link adapters isolated at the edge
  > So that mobile-native and PWA flows remain honest about what each platform can do.
  > AC: Given platform capability and notification-permission adapters are implemented, when capability state is synchronized, then native push capability, browser notification capability, native wallet capability, browser-wallet capability, and unsupported mobile web capability are distinguished explicitly.
  > AC: Given deep-link adapters are implemented, when alert or resume metadata is parsed, then they only parse platform entry metadata and do not decide application business outcomes.
  > AC: Given permission and deep-link contract tests are run, when native, desktop PWA, and unsupported mobile web cases are exercised, then degraded states and re-entry metadata are represented explicitly without inventing business policy in adapters.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-4-6
### Expo Universal App Shell
> Goal: Create the host shell and platform bootstrap for native mobile and web/PWA without weakening package ownership or runtime separation.

- [ ] Story 5.1: Create The Expo Host Shell And Route Skeleton
  > As an implementation agent
  > I want the Expo app shell and route files created in the approved host-shell boundary
  > So that native and web/PWA clients have a stable entry structure.
  > AC: Given `apps/app` is implemented, when its structure is inspected, then it contains route files, deep-link entrypoints, platform bootstrap, and no owned screen components.
  > AC: Given the route skeleton is created, when future UI stories are added, then screens are imported from `packages/ui/src/screens` rather than implemented in `apps/app`.
  > AC: Given the app shell is reviewed, when imports are scanned, then it does not directly import adapters outside the one approved composition bootstrap path.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-5-1
- [ ] Story 5.2: Wire The Client Composition Bootstrap To Application Public APIs
  > As an implementation agent
  > I want the app shell to compose UI and application contracts through one approved bootstrap
  > So that wallet handoff, query access, and execution flows are wired without boundary leakage.
  > AC: Given the composition bootstrap is implemented, when the app is started, then UI dependencies are resolved from `packages/application/public` contracts only.
  > AC: Given a wallet handoff return, when composition is resumed, then application resume and entry-context use cases can be invoked without direct adapter imports from screen code.
  > AC: Given composition boundaries are checked, when a screen or presenter is inspected, then infrastructure wiring does not appear there.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-5-2
- [ ] Story 5.3: Enable Web/PWA Bootstrap With Honest Degradation
  > As a desktop or mobile web user
  > I want the universal shell to expose only supported capabilities per platform
  > So that the product remains honest about native-first and PWA-secondary behavior.
  > AC: Given the web/PWA shell is bootstrapped, when a desktop browser with compatible wallet support is used, then review, history, and supported manual signed execution flows are available.
  > AC: Given mobile web or mobile PWA lacks native-equivalent capability, when the user enters an execution path, then the app degrades honestly rather than implying parity with native signing or native push.
  > AC: Given platform capability state is available, when the shell renders supported vs degraded experiences, then the decision is driven by application capability DTOs rather than UI heuristics.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-5-3
### Core Feature UI
> Goal: Deliver the mobile-first UI for the narrow breach-to-exit workflow and the supporting desktop PWA review surface.

- [ ] Story 6.1: Build Positions And Alerts Screens
  > As an active LP
  > I want to see supported positions and actionable alerts quickly
  > So that I can understand whether action is needed without browsing a generic dashboard.
  > AC: Given positions and alerts data are available, when the user opens the app, then actionable positions or alerts are reachable without a generic dashboard gate.
  > AC: Given the positions list is rendered, when supported positions are present, then each row shows the position identity, current range status, and latest operational state without unrelated portfolio analytics.
  > AC: Given the alerts list is rendered, when an actionable or recently degraded alert exists, then breach direction and urgency to review are visually primary.
  > AC: Given the user selects a position or alert, when navigation occurs, then the route enters the relevant position detail or preview path without forcing a dashboard hop.
  > AC: Given capability or notification delivery is degraded, when the user views the relevant positions or alerts state, then the app explains what is unavailable and what the user can still do.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-1
- [ ] Story 6.2: Build Position Detail Screen
  > As an active LP
  > I want position detail to explain current range state and fixed exit policy clearly
  > So that I can understand current posture and the directional action path before opening a preview.
  > AC: Given a position detail screen is rendered, when a breach exists, then breach direction is visually primary and current range status is shown before deeper detail.
  > AC: Given an actionable downside trigger, when position detail is rendered, then the screen pairs the breach state with the expected post-exit posture and explicitly shows `SOL -> USDC`.
  > AC: Given an actionable upside trigger, when position detail is rendered, then the screen pairs the breach state with the expected post-exit posture and explicitly shows `USDC -> SOL`.
  > AC: Given any position detail screen, when the user views the status block, then the fixed directional exit policy summary is visible and not editable.
  > AC: Given an out-of-range but not yet actionable state, when the screen renders, then the current likely one-sided posture is shown distinctly from the post-exit posture.
  > AC: Given a common mobile screen size, when the position detail screen renders for an actionable state, then breach direction, current posture, expected post-exit posture, and the primary next action are visible above the fold.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-2
- [ ] Story 6.3: Build The Directional Execution Preview Screen
  > As an active LP
  > I want the execution preview to explain the exact directional path before I sign
  > So that I know what asset posture I am moving toward and why.
  > AC: Given a confirmed breach below the lower bound, when the preview screen is shown, then the resulting execution plan targets a USDC post-exit posture.
  > AC: Given a confirmed breach above the upper bound, when the preview screen is shown, then the resulting execution plan targets a SOL post-exit posture.
  > AC: Given the preview is rendered for either case, when the step sequence is displayed, then the execution preview states the correct swap direction for each case.
  > AC: Given the screen is inspected, when the sequence block is read, then it shows trigger direction, remove liquidity, collect fees, swap direction, and post-exit posture in that order.
  > AC: Given a common mobile screen size, when the execution preview renders, then trigger direction, swap direction, post-exit posture, freshness state, and the primary review/sign action are visible without requiring the user to scroll.
  > AC: Given preview freshness, estimates, and risk details are available, when the screen renders, then freshness and estimate-vs-executed distinctions are explicit and compact.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-3
- [ ] Story 6.4: Build Signing And Submission State Screen
  > As an active LP or support reviewer
  > I want signing and submission-state views to be legible
  > So that I can preserve context across wallet handoff and understand the authoritative in-flight state.
  > AC: Given the user enters signing flow, when external wallet UI is active, then context is preserved and the return path stays tied to one authoritative execution attempt.
  > AC: Given the user returns from wallet signing, when the submission-state screen is shown, then a single authoritative lifecycle state is presented instead of conflicting local and remote states.
  > AC: Given submission has occurred but reconciliation is still pending, when the state screen renders, then submission is not labeled as final completion.
  > AC: Given the user declines to sign, when the state screen is shown, then the UI clearly distinguishes abandonment from submission or confirmation failure.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-4
- [ ] Story 6.5: Build Result And Recovery Screens
  > As an active LP or support reviewer
  > I want result and recovery views to be legible
  > So that I can understand the exact current state and next allowed action after signing or failure.
  > AC: Given a stale preview, submission failure, expiry, partial completion, or reconciliation delay, when the relevant view renders, then the state is named explicitly and the next allowed action is clear.
  > AC: Given the user declines to sign, when the result or recovery state is shown, then the UI clearly distinguishes abandonment from submission or confirmation failure.
  > AC: Given a result screen is shown after any execution attempt, when the user reviews the outcome, then estimated-versus-executed distinctions remain explicit.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-5
- [ ] Story 6.6: Build History List And History Detail Screens
  > As an active LP or support reviewer
  > I want history list and detail views to preserve directional operational context
  > So that I can review what happened without mistaking history for proof.
  > AC: Given history data is available, when the history list or detail screen renders, then each entry preserves directional context and clearly labels the record as off-chain operational history rather than proof.
  > AC: Given transaction references are available, when a history detail view is shown, then those references are visible as operational references and not framed as receipts or attestations.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-6
- [ ] Story 6.7: Build The Desktop PWA Review And Manual Execution Surface
  > As a desktop reviewer or LP
  > I want a useful secondary PWA surface for review, history, and supported manual execution
  > So that desktop remains helpful without becoming the primary execution model.
  > AC: Given a supported desktop browser with compatible wallet support, when the PWA is opened, then users can review positions, triggers, previews, history, and supported manual signed execution.
  > AC: Given desktop has more horizontal space, when the UI is rendered, then it uses the same narrow IA and does not introduce a broader analytics or dashboard shell.
  > AC: Given mobile web lacks equivalent support, when the same surface is visited there, then degradation is explicit and non-parity claims remain intact.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-6-7
### Notifications
> Goal: Deliver best-effort notifications and re-entry flows that are operationally useful without implying guaranteed protection.

- [ ] Story 7.1: Dispatch Actionable Notifications With Duplicate Suppression
  > As a user
  > I want actionable notifications only when a breach becomes truly actionable
  > So that I am not spammed with conflicting or duplicate alerts.
  > AC: Given a breach observation that has not passed confirmation rules, when notification logic runs, then no actionable notification is dispatched.
  > AC: Given an actionable trigger is created, when notification dispatch runs, then the notification identifies the affected position, breach direction, and the need to review the execution preview.
  > AC: Given repeated qualifying evaluations inside one breach episode, when notification dispatch runs again, then duplicates are suppressed for that episode.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-7-1
- [ ] Story 7.2: Implement Native Push And Deep-Link Re-Entry
  > As a mobile user
  > I want notification taps to open directly into the relevant execution context
  > So that I can move from alert to review with minimal friction.
  > AC: Given a native push notification is delivered, when the user taps it, then the app resolves into the affected trigger or preview context rather than a generic home screen.
  > AC: Given the app is resumed through a notification while a resumable execution session exists, when entry resolution runs, then the user lands in the appropriate current state.
  > AC: Given notification delivery is best-effort, when timestamps are stored, then detection time and delivery time remain separate for debugging and user support.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-7-2
- [ ] Story 7.3: Implement Desktop Browser Notifications, In-App Alerts, And Degraded-State Messaging
  > As a desktop or degraded-capability user
  > I want clear fallback alert behavior
  > So that I understand what alert coverage exists on my platform.
  > AC: Given browser notification permission is granted on desktop PWA, when an actionable trigger occurs, then a secondary browser notification path is available.
  > AC: Given push or browser notifications are unavailable or delayed, when the user opens the app, then in-app alerts still surface the actionable state.
  > AC: Given a degraded capability platform such as unsupported mobile web, when alert state is shown, then the UI explicitly explains degraded coverage and does not imply native parity.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-7-3
### Hardening And Smoke Tests
> Goal: Validate the integrated system against the architecture, the directional policy, and the core user journeys before story execution is considered complete.

- [ ] Story 8.1: Add Directional End-To-End Smoke Scenarios
  > As a release owner
  > I want end-to-end smoke scenarios for both breach directions
  > So that the most important product invariant is verified across layers.
  > AC: Given a confirmed breach below the lower bound, when the end-to-end smoke scenario is executed, then the resulting execution plan targets a USDC post-exit posture.
  > AC: Given a confirmed breach above the upper bound, when the end-to-end smoke scenario is executed, then the resulting execution plan targets a SOL post-exit posture.
  > AC: Given the preview is rendered in both scenarios, when assertions are evaluated, then the execution preview states the correct swap direction for each case.
  > AC: Given smoke tests are run, when both breach directions are exercised, then domain tests cover both breach directions independently and application/use-case tests verify that the correct adapter calls are orchestrated for each direction.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-8-1
- [ ] Story 8.2: Add Failure, Resume, And History Smoke Scenarios
  > As a release owner
  > I want smoke coverage for stale preview, partial completion, and resume behavior
  > So that high-risk recovery paths are validated before release.
  > AC: Given a stale preview before signing, when the smoke scenario runs, then refresh is required before execution can proceed.
  > AC: Given a partial execution state, when the smoke scenario runs, then blind full replay is blocked and the next allowed action is explicit.
  > AC: Given an interrupted awaiting-signature session, when the app is resumed, then execution session state is restored from backend state and history remains intact.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-8-2
- [ ] Story 8.3: Add Release-Blocking Architecture And Supportability Checks
  > As a release owner
  > I want final release-blocking checks for boundaries, banned concepts, and observability
  > So that the shipped baseline is supportable and architecture-compliant.
  > AC: Given the integrated repo is validated, when architecture checks run, then compile-graph, forbidden-import, and banned-concept rules all pass.
  > AC: Given supportability requirements are reviewed, when logs and history records are inspected, then trigger timing, delivery timing, preview freshness, submission attempts, and reconciliation updates are observable.
  > AC: Given the release checklist is executed, when forbidden concepts are scanned, then no on-chain receipt, attestation, claim, or proof subsystem exists anywhere in the implementation backlog or delivered baseline.
  > Spec: specs/planning-artifacts/21-epics-stories.md#story-8-3

## Completed

## Notes
- Follow TDD methodology (red-green-refactor)
- One story per Ralph loop iteration
- Update this file after completing each story
