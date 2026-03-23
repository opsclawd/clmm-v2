# clmm-v2 — Project Context

## Project Goals

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

## Success Metrics

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

## Scope Boundaries

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
