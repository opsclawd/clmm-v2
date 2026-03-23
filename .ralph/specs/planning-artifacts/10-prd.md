---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
inputDocuments:
  - _bmad-output/planning-artifacts/05-product-brief.md
workflowType: 'prd'
briefCount: 1
researchCount: 0
brainstormingCount: 0
projectDocsCount: 0
classification:
  projectType: mobile_app
  domain: fintech
  complexity: high
  projectContext: greenfield
date: 2026-03-21
author: BMad
---

# Product Requirements Document - clmm-v2

**Author:** BMad  
**Date:** 2026-03-21

## Executive Summary

CLMM V2 is a mobile-first, non-custodial exit assistant for supported Solana concentrated liquidity positions. Its purpose is narrow: detect when a supported CLMM position moves out of range, explain the resulting directional exposure, prepare the correct unwind path, and execute only after explicit user signature.

The MVP is intentionally not a generalized DeFi control panel. It is an operational LP exit guardrail for active Orca CLMM users who already understand concentrated liquidity mechanics and need a faster breach-to-exit workflow on mobile.

### What Makes This Special

The product differentiator is not generic monitoring and not generic execution. The differentiator is a user-signed, directionally opinionated out-of-range exit flow with a clear preview of what will happen next.

The core product invariant is explicit and non-negotiable:

- downside breach below range -> remove liquidity -> collect fees -> swap SOL to USDC
- upside breach above range -> remove liquidity -> collect fees -> swap USDC to SOL

This directional rule is core product behavior. It must not be abstracted into a generic "rebalance" concept or generalized away behind token-order logic.

### Project Classification

- Project Type: Mobile app with secondary PWA support
- Domain: Fintech / DeFi
- Complexity: High
- Project Context: Greenfield

## Product Objective

Enable supported Solana CLMM LPs to move from boundary breach detection to a clear, user-signed exit action quickly, safely, and with minimal interpretation burden, while preserving user custody and avoiding autonomous execution.

## Target Users

### Primary Users

- active Solana CLMM LPs, initially Orca users, who already understand concentrated liquidity mechanics
- mobile-heavy DeFi operators who need fast reaction to out-of-range conditions during the day

### Secondary Users

- users who primarily review alerts and history on desktop, but still want the same exit assistant workflow available through a PWA when wallet support permits
- support and operations personnel reviewing off-chain execution history for debugging and user support

### Explicit Poor-Fit Users

- first-time DeFi users who need CLMM education
- users seeking autonomous execution or delegated strategy management
- users primarily seeking analytics, portfolio tracking, or generic wallet features

## Jobs To Be Done

### Functional Jobs

- When my CLMM position goes out of range, tell me quickly and clearly.
- Tell me whether the breach happened below or above my configured range.
- Show me the asset posture I likely hold now and the posture I will likely hold after exit.
- Prepare the correct unwind path so I do not reconstruct the sequence under time pressure.
- Let me approve and sign the exit from my phone with minimal friction.
- Preserve an operational history of what happened before, during, and after the attempted exit.

### Trust And Emotional Jobs

- Help me act quickly without feeling I handed control to a bot.
- Make the consequences of signing understandable before I approve anything.
- Distinguish estimates from confirmed execution outcomes.
- Be transparent when a trigger, quote, transaction, or notification is stale, delayed, failed, or expired.

## Success Criteria

### User Success

- users can move from receiving a breach alert to viewing a usable execution preview in under 2 minutes on a typical mobile flow
- users can correctly identify the triggered breach direction and expected post-exit asset posture from the preview without consulting external tools
- users can complete the signed exit flow with clear transaction-state feedback and no ambiguity about whether execution is pending, partial, confirmed, failed, or expired

### Business Success

- early users view CLMM V2 as a focused exit assistant rather than a generic wallet or dashboard
- the MVP proves there is repeat usage around breach-response workflows for supported Orca LPs
- the product validates a wedge around operational speed and clarity for CLMM exits without expanding into portfolio sprawl

### Technical Success

- the system detects supported out-of-range states reliably enough to generate timely alert candidates
- execution previews consistently reflect the correct directional policy and show stale/estimate caveats clearly
- all execution attempts reconcile into an off-chain terminal status record suitable for support and user review

### Measurable MVP Outcomes

- at least 80% of acknowledged breach alerts lead to a preview being opened
- at least 70% of previewed exits reach a terminal state without abandonment caused by product-side ambiguity
- 100% of completed exits are explicitly user-signed; 0% autonomous execution
- at least 95% of submitted executions reconcile to a terminal history state within 5 minutes of chain submission
- duplicate or conflicting notifications for the same breach condition remain below 2% of alert events

## Product Scope

### MVP Scope

The MVP includes:

- wallet connection for supported user-controlled wallets
- reading supported Orca CLMM positions
- backend-supported monitoring of supported positions against their lower and upper range boundaries
- breach detection for below-lower-bound and above-upper-bound conditions
- confirmation-rule evaluation before an exit trigger becomes actionable
- alert delivery when an actionable exit condition is detected
- execution preview showing the triggered direction, liquidity removal step, fee collection step, swap direction, and expected post-exit asset posture
- user-signed execution only
- off-chain execution history and status tracking
- desktop-capable PWA support for review, history, and supported manual execution flows

### Supported Protocol Scope

- Orca-first CLMM position support for MVP
- Jupiter-first swap routing support for the required post-exit swap leg
- any abstraction around protocols must stay thin and exist only to isolate supported position reads and exit orchestration boundaries

### Post-MVP Growth Candidates

- expanded confirmation policies if justified by user feedback
- broader protocol support beyond Orca
- richer alert preferences and escalation policies
- deeper support tooling and diagnostics

### Vision, Not MVP

- autonomous or semi-autonomous exit execution
- portfolio analytics or strategy dashboards
- generalized wallet behavior
- multi-chain CLMM support

## Supported User Journeys

### Journey 1: First-Time Setup And Monitoring Readiness

An active Orca LP connects a supported wallet for the first time, discovers supported positions, grants or declines notification permission, and sees whether monitoring and alert delivery are fully active or operating in a degraded state. If notifications are unavailable, the app explains the degraded experience clearly without implying the position is fully protected.

### Journey 2: Primary Mobile Breach-To-Exit Path

An active Orca LP receives a breach alert on mobile, opens the app, sees the affected position and breach direction immediately, reviews the execution preview, signs the required transaction flow, and monitors the execution until it reaches a terminal state recorded in history.

### Journey 3: Quote Refresh And Re-Review Path

An LP opens an alert but finds that the preview is stale or expired. The app refreshes the preview, re-renders the directional steps and estimates, and asks for signature only after the refreshed preview is accepted.

### Journey 4: Partial Or Failed Execution Path

An LP signs the exit flow, but one or more steps fail or expire. The app records the exact status, shows what completed versus what did not, prevents misleading "retry all" behavior when partial chain actions already occurred, and guides the user into the next allowed action.

### Journey 5: Desktop Review, History, And Supported Manual Execution Path

An LP or support operator opens the desktop PWA to review prior triggers, preview attempts, submitted executions, terminal outcomes, and associated transaction references from the off-chain history log. Where compatible browser-wallet support is available, the LP can also complete the supported manual signed execution flow from the desktop PWA.

### Journey Requirements Summary

These journeys require fast alert-to-preview navigation, explicit directional explanation, transparent multi-step execution state handling, off-chain history reconciliation, and mobile-native first-run usability.

## Supported CLMM Monitoring Behavior

- Monitoring is backend-supported, not dependent on client background execution.
- Monitoring is position-specific, not pool-generic.
- The system evaluates whether current price is below the lower boundary or above the upper boundary for each supported position.
- The system must distinguish informational out-of-range observation from an actionable exit trigger.
- An actionable exit trigger requires the relevant confirmation rules to pass before alerting and preview creation.
- Confirmation rules are fixed, product-defined MVP rules applied uniformly to supported positions; they are not user-programmable strategy logic.
- Monitoring behavior must preserve the directional exit invariant and may not infer exit direction from token ordering alone.
- The product must support only the monitoring behavior required for out-of-range exit assistance; it must not become a generalized price-alert engine.

## Exit Trigger Behavior

- A downside trigger occurs when price breaks below the lower range boundary and confirmation rules pass.
- On a confirmed downside trigger, the system prepares an exit flow that removes liquidity, collects fees, and swaps SOL to USDC.
- An upside trigger occurs when price breaks above the upper range boundary and confirmation rules pass.
- On a confirmed upside trigger, the system prepares an exit flow that removes liquidity, collects fees, and swaps USDC to SOL.
- The product must treat downside and upside triggers as distinct, user-visible states.
- A trigger must reference the specific position, range boundaries, trigger direction, trigger time, fixed MVP confirmation-policy pass state, confirmation evaluation timestamp, and preview freshness window.
- Trigger generation must be idempotent within a single breach episode so users do not receive conflicting actionable states for the same position condition.

## Execution Preview Behavior

The execution preview is a core product surface and must show, at minimum:

- the affected position and pool
- the triggered direction: downside or upside
- the liquidity removal step
- the fee collection step
- the swap direction
- the expected post-exit asset posture
- estimated token amounts where available
- quote freshness or expiry state
- slippage and routing caveats
- a clear distinction between estimated outcome and executed outcome

The preview must not obscure the directional rule behind generic language. Users must be able to tell, before signing, whether the system is moving them toward USDC or toward SOL and why.
For downside triggers, the preview must show SOL -> USDC. For upside triggers, the preview must show USDC -> SOL.

## Signing And Execution Behavior

- Every execution requires explicit user approval and user signature.
- The product must not perform autonomous execution, unattended execution, or delegated signing.
- The guided execution flow may package the sequence as one guided action for the user, but the underlying steps remain logically distinct: remove liquidity, collect fees, then execute the required swap.
- The system must surface transaction lifecycle states including previewed, awaiting signature, submitted, confirmed, failed, expired, abandoned, and partially completed where applicable.
- Submission must not be presented as confirmation.
- If wallet or platform limitations require multiple signatures, the product must present the sequence clearly and maintain state continuity across prompts.

## Failure Handling And Retry Boundaries

- The product must clearly separate pre-signing failure, submission failure, expiry, and post-submission reconciliation failure.
- If a preview becomes stale before signing, the user must refresh or regenerate the preview before execution can proceed.
- If no on-chain step has been confirmed, the product may allow a full retry from refreshed preview state.
- If one or more on-chain steps have already completed, the product must not offer a misleading full replay of the original sequence.
- For partial execution states, the product must show what completed, what remains unresolved, and what next action is permitted.
- Retry behavior must stay within narrow operational boundaries:
  - preview refresh or quote refresh before signing
  - resubmission after expiry or submission failure when no chain step confirmed
  - explicit recovery guidance after partial completion rather than blind retry
- The MVP is not required to automate recovery from every partial state. It is required to make the state legible and preserve supportable history.

## Notification Behavior

- Notifications are best-effort and must never be framed as guaranteed protection.
- Native push notifications are the primary alert channel on mobile.
- In-app alerts are required when the user opens the application after a trigger occurs.
- Desktop PWA may use browser notifications when permission is granted, but this is secondary to native mobile delivery.
- Notifications must identify the affected position, breach direction, and urgency to review the execution preview.
- Notifications must avoid claiming that execution has occurred unless the user has signed and submission has been reconciled.
- Duplicate-notification suppression is required within a single breach episode.

## Execution History Behavior

- Execution history is off-chain only.
- History serves as an operational record for user review, support, and debugging.
- History must capture trigger creation, preview creation, preview refresh, signature request, user approval or abandonment, submission attempts, transaction references where available, reconciliation updates, and terminal outcome.
- History must preserve the directional context of each event.
- Execution history must be durably persisted off-device in backend storage and must survive app reinstall, device change, and local cache loss.
- History must not be presented as on-chain proof, attestation, claim, or canonical receipt.
- The MVP must not include any on-chain receipt, attestation, proof, claim, or verification subsystem.

## Domain-Specific Requirements

### Compliance And Regulatory

- The product must be framed as a user-controlled execution assistant, not as discretionary asset management.
- User-facing copy must avoid implying guaranteed protection, best execution, or autonomous management.
- The product must preserve clear user consent boundaries around signing.

### Technical Constraints

- Wallet connection and signing behavior differs materially across native mobile and web contexts; MVP requirements must favor the React Native path.
- Price, quote, and transaction timing can drift materially in DeFi conditions; stale-state detection and revalidation are required.
- Security and trust posture must assume users are handling financially meaningful positions.

### Integration Requirements

- Orca is the only CLMM position source in MVP.
- Jupiter-first routing is used only to satisfy the required post-exit swap leg.
- Protocol integration surfaces must remain thin and implementation-friendly.

### Risk Mitigations

- wrong breach-side mapping is a critical product failure and must be treated as a release blocker
- stale preview execution must be prevented through refresh or expiry handling
- notification latency must be disclosed as distinct from detection time

## Mobile App Specific Requirements

### Project-Type Overview

CLMM V2 is a React Native-first product with PWA support. Native mobile is the primary execution surface because breach-response speed, wallet integration quality, and push delivery matter more than broad web parity in MVP.

### Technical Architecture Considerations

- mobile execution flows must remain the reference experience for alert handling, preview review, and signing
- the product must preserve a shared domain and application core across native mobile and PWA surfaces
- native and web capability gaps must be acknowledged explicitly
- mobile web parity is not required for MVP

### Platform Requirements

- React Native is the primary UX surface
- desktop PWA is supported for review, history, and supported manual execution flows where compatible browser-wallet support is available
- mobile PWA is best-effort and not required to match native signing quality

### Device And Permission Considerations

- the app must request and manage notification permissions clearly
- the product must handle wallet handoff or deep-link behavior without losing execution context
- the app must preserve user state when returning from wallet-signing flows

### Implementation Considerations

- primary flows must be optimized for one-handed mobile use
- critical information must be visible without dense desktop-style dashboards
- platform-specific limitations must fail clearly rather than pretending parity

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** ship the smallest breach-to-exit assistant that proves users value alerting, directional preview clarity, and signed exit completion without portfolio or wallet sprawl.

**Resource Profile:** a small product and engineering team can ship the MVP if scope remains constrained to supported Orca positions, backend monitoring, preview generation, signature orchestration, and off-chain history.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**

- first-time setup and monitoring readiness
- alert to preview on mobile
- preview refresh before signature
- user-signed exit execution
- partial or failed execution review
- desktop PWA history, review, and supported manual execution

**Must-Have Capabilities:**

- supported wallet connection
- supported Orca position discovery
- backend breach detection
- directional trigger generation
- clear execution preview
- explicit user-signed execution
- execution status lifecycle and reconciliation
- off-chain history
- notification delivery

### Phase 2 (Post-MVP)

- broader alert controls
- more sophisticated recovery tooling
- broader protocol support if the Orca-first wedge is validated

### Phase 3 (Expansion)

- broader CLMM coverage across additional protocols
- richer operational tooling if it directly strengthens exit assistance

### Risk Mitigation Strategy

**Technical Risks:** prioritize correctness of directional mapping, preview freshness, and reconciliation over breadth.

**Market Risks:** validate whether active LPs value a dedicated exit assistant without bundling analytics.

**Resource Risks:** if constrained, preserve mobile alerting, preview, signing, and history before adding any extra surfaces or analytics.

## Functional Requirements

### Wallet And Position Access

- FR1: Users can connect a supported self-custody wallet to the product.
- FR2: Users can view supported Orca CLMM positions associated with the connected wallet.
- FR3: Users can view the pool, range boundaries, and current in-range or out-of-range state for each supported position.
- FR4: Users can select a supported position to view its breach status, trigger status, preview state, and execution history.
- FR5: The system can preserve user context across wallet handoff and return flows during signing.
- FR6: Users can see whether monitoring is active for their supported positions.
- FR7: Users can see notification permission state and whether alert delivery is fully active or degraded.

### Monitoring And Triggering

- FR8: The system can monitor supported positions against their lower and upper range boundaries.
- FR9: The system can detect downside breach conditions separately from upside breach conditions.
- FR10: The system can apply fixed MVP confirmation rules before promoting an observed breach into an actionable exit trigger.
- FR11: The system can create an actionable trigger record tied to a specific position, breach direction, trigger time, confirmation-policy pass state, and confirmation evaluation timestamp.
- FR12: The system can suppress duplicate actionable triggers within a single breach episode.

### Directional Exit Policy

- FR13: The system can prepare a downside exit flow that removes liquidity, collects fees, and swaps SOL to USDC.
- FR14: The system can prepare an upside exit flow that removes liquidity, collects fees, and swaps USDC to SOL.
- FR15: The system can expose the triggered direction as explicit product state throughout preview, signing, and history.
- FR16: The system can prevent a user from executing an exit flow whose directional logic is ambiguous or unresolved.

### Notifications And Re-Entry

- FR17: Users can receive a best-effort notification when a supported position reaches an actionable exit condition.
- FR18: Users can open the application from a notification and land in the affected position or preview context.
- FR19: Users can see in-app breach alerts even if push delivery was delayed or unavailable.
- FR20: The system can distinguish informational state from actionable trigger state in user-visible alerts.
- FR21: Users can see when notification delivery is unavailable or degraded and what that means for breach awareness.

### Execution Preview

- FR22: Users can review an execution preview before signing.
- FR23: Users can see the liquidity removal step in the preview.
- FR24: Users can see the fee collection step in the preview.
- FR25: Users can see the required swap direction in the preview.
- FR26: Users can see the expected post-exit asset posture in the preview.
- FR27: Users can see whether preview estimates are fresh, stale, or expired.
- FR28: Users can refresh or regenerate a stale preview before execution.
- FR29: Users can see a clear distinction between estimated outcomes and executed outcomes.

### Signing And Execution

- FR30: Users can explicitly approve and sign an exit execution from the product.
- FR31: The system can orchestrate the exit flow as a guided sequence while preserving the distinct logical steps involved.
- FR32: Users can see lifecycle states for previewed, awaiting signature, submitted, confirmed, failed, expired, abandoned, and partial executions.
- FR33: Users can see when submission succeeded but final confirmation is still pending.
- FR34: The system can stop execution if the user declines to sign.
- FR35: The system can require refreshed preview data when a preview is no longer valid for signing.

### Failure Handling And Recovery Boundaries

- FR36: Users can see whether a failure happened before signing, during submission, or after one or more chain actions completed.
- FR37: The system can allow full retry only when no prior chain step has been confirmed for that execution attempt.
- FR38: The system can prevent blind full-sequence retry after partial completion.
- FR39: Users can see recovery guidance appropriate to the current execution state.

### Execution History And Supportability

- FR40: Users can review off-chain history for trigger, preview, signing, submission, reconciliation, and terminal outcome events.
- FR41: Users can see the directional context associated with each history entry.
- FR42: Users can review transaction references linked to execution attempts when available.
- FR43: Support and operations users can use the history record to troubleshoot reported execution issues.
- FR44: The system can durably persist off-chain execution history in backend storage so it survives app reinstall, device change, and local cache loss.

### Platform Experience

- FR45: Users can complete the primary breach-to-exit workflow on React Native mobile.
- FR46: Users can access execution history, supported review flows, and supported manual signed execution through a desktop-capable PWA where compatible browser-wallet support is available.
- FR47: Users can experience degraded but honest behavior on unsupported mobile web flows rather than false parity claims.

## Non-Functional Requirements

### Performance

- alert-to-preview navigation should complete within 5 seconds under normal operating conditions once the user opens the app from a valid notification
- preview generation or refresh completes within 10 seconds for the 95th percentile under normal operating conditions
- critical breach context must render above the fold on common mobile screen sizes

### Reliability

- monitoring, trigger generation, and execution-state reconciliation must operate as separate, recoverable subsystems
- execution history must converge to a terminal state for submitted attempts even when intermediate callbacks are delayed
- the system must preserve idempotency for trigger creation and avoid duplicate actionable states for the same breach episode
- local-only persistence is not acceptable for execution history

### Security And Trust

- all signing remains user-controlled and wallet-mediated
- all sensitive data in transit must use encrypted transport and all persisted execution-history data at rest must be encrypted using managed backend key controls
- wallet secrets, private keys, and signing authority must never be stored by the product backend
- the product must never imply custody, autonomous control, or guaranteed execution outcome
- incorrect directional mapping is treated as a critical severity defect

### Observability And Supportability

- operational logs and user-visible history must support debugging of trigger timing, preview freshness, submission attempts, and reconciliation
- support staff must be able to distinguish user abandonment, expiry, protocol failure, routing failure, and reconciliation delay from the off-chain record
- the system must record breach-detection time and notification-delivery time separately for every alert event

### Accessibility And Usability

- the primary mobile flow must support readable hierarchy, strong contrast, and tap targets appropriate for common handheld devices
- the product must rely on plain directional language rather than protocol jargon alone when explaining the exit path
- critical states such as stale preview, partial execution, and failed submission must be understandable without requiring blockchain expertise beyond the target user's assumed CLMM knowledge

### Integration

- when Orca, Jupiter, wallet, or notification integrations fail, the product must surface a degraded-state notice in the affected flow within 30 seconds and preserve previously recorded history
- the product must isolate external integration failures in a way that preserves user-visible state and off-chain history integrity

## Mobile-First UX Requirements

- the breach alert entry point must open directly into the affected position or its actionable preview context
- breach direction, current posture, and expected post-exit posture must be visible before the user scrolls into deeper detail
- the preview must use a clear, ordered step sequence: remove liquidity, collect fees, swap, resulting posture
- signing flows must minimize context loss across wallet handoff and return
- the primary path from alert to signature should require as few screens and decisions as possible
- failure and partial-completion states must be explainable on small screens without collapsing into generic error copy
- the MVP must avoid analytics-heavy layouts, tab sprawl, or generic wallet navigation patterns

## PWA Requirements

- the product must provide an installable PWA for supported desktop browsers
- the PWA must support wallet connection where browser-wallet support is available
- the PWA must support review of supported positions, breach states, preview states, and execution history
- the desktop PWA must support supported manual signed execution flows where compatible browser-wallet support is available
- the PWA must not claim parity with native mobile push delivery or wallet-signing quality on mobile web
- the product must treat mobile web and mobile PWA as best-effort support, not the reference execution environment

## Explicit Non-Goals

- generic wallet behavior such as broad transfers, swaps, staking, or asset management
- broad portfolio analytics, yield dashboards, or historical performance reporting
- autonomous execution, scheduled execution, or delegated custody
- multi-chain support
- multi-CLMM protocol support beyond Orca in MVP
- social features, copy trading, or strategy marketplace behavior
- on-chain receipt, attestation, claim, proof, or verification subsystems
- broad operational dashboards that do not directly improve breach detection, preview clarity, execution completion, or history usefulness

## Acceptance Boundaries

The MVP is acceptable only if all of the following are true:

- supported Orca CLMM positions can be read and monitored against lower and upper boundaries
- the system can generate distinct downside and upside actionable triggers only after the fixed MVP confirmation policy passes
- downside exits always preview and execute as downside breach below range -> remove liquidity -> collect fees -> swap SOL to USDC
- upside exits always preview and execute as upside breach above range -> remove liquidity -> collect fees -> swap USDC to SOL
- the execution preview explicitly shows triggered direction, liquidity removal, fee collection, swap direction, and expected post-exit asset posture
- no execution can occur without explicit user signature
- failed, expired, abandoned, partial, submitted, and confirmed states are distinguishable in user-visible status and off-chain history
- retry behavior does not mislead the user after partial completion
- execution history remains off-chain only and is not framed as a canonical on-chain receipt
- execution history is durably persisted off-device and does not depend only on local device storage
- native mobile provides the primary end-to-end experience, while PWA support remains secondary and honest about limitations
- desktop PWA supports review, history, and supported manual signed execution where compatible browser-wallet support is available
- the product preserves a shared domain and application core across native mobile and PWA surfaces

The MVP is not acceptable if it:

- generalizes the directional exit rule into a protocol-agnostic abstraction that hides the actual posture change
- introduces autonomous execution or delegated control
- expands into dashboard, wallet, or analytics sprawl
- requires an on-chain proof or attestation subsystem to complete the core workflow
- depends on local-only storage for execution history
