---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/planning-artifacts/01-brainstorm-project.md
  - _bmad-output/planning-artifacts/02-market-research.md
  - _bmad-output/planning-artifacts/03-domain-research.md
  - _bmad-output/planning-artifacts/04-technical-research.md
date: 2026-03-21
author: BMad
---

# Product Brief: CLMM V2

## Product Outcome

CLMM V2 is a mobile-first, non-custodial exit assistant for supported Solana concentrated liquidity positions. It helps LPs react quickly when a position moves out of range by detecting the breach, preparing a clear execution preview, and completing the exit flow only after explicit user signature.

The product outcome is not “better trading” in the abstract. The product outcome is a faster, clearer, and safer breach-to-exit workflow for users managing their own CLMM positions.

## Product Framing

CLMM V2 should be framed as an **LP Exit Guardrail**:

- it watches supported CLMM positions for boundary breaches
- it explains what the breach means
- it prepares the correct unwind path
- it leaves final execution control with the user

This framing is intentionally narrower than “automation”, “portfolio management”, or “yield optimization”.

## Problem Statement

Solana CLMM LPs today can monitor positions, claim fees, and manually exit through protocol UIs, but the critical breach-response job is still fragmented:

- users must notice the range breach in time
- users must interpret the resulting one-sided exposure
- users must decide the correct unwind sequence
- users must estimate what they will hold after exit
- users must execute under time pressure, often on mobile

Existing products cover protocol management, dashboards, alerts, or full automation. They do not strongly serve the middle category CLMM V2 targets: **mobile-first, user-signed breach execution assistance**.

## Target User

### Primary User

Active Solana CLMM LPs, initially Orca users, who already understand concentrated liquidity mechanics and want faster operational response without surrendering custody or autonomous control.

### Secondary User

Mobile-heavy DeFi operators who manage positions throughout the day and value alert-to-action speed more than deep analytics.

### Explicitly Poor-Fit Users

- first-time DeFi users who do not understand LP mechanics
- users seeking fully autonomous strategy execution
- users primarily seeking portfolio analytics, social features, copy trading, or generic wallet functionality

## Jobs To Be Done

### Functional Jobs

- When my CLMM position moves out of range, tell me quickly and clearly.
- Show me which side was breached and what asset exposure I now have.
- Prepare the correct exit flow so I do not have to reconstruct it manually.
- Show me what I am likely to receive before I sign.
- Let me approve the exit from my phone with minimal friction.
- Keep an operational record of what happened after the alert.

### Emotional / Trust Jobs

- Help me act without feeling I have handed control to a bot.
- Make the consequences of signing understandable.
- Do not imply guarantees you cannot provide.
- Be transparent when alerts, quotes, or transactions are delayed, stale, failed, or expired.

## Core Directional Exit Invariant

The product must preserve this exact directional exit policy:

- **Downside breach below the CLMM range -> remove liquidity -> collect fees -> swap SOL exposure into USDC**
- **Upside breach above the CLMM range -> remove liquidity -> collect fees -> swap USDC exposure into SOL**

This is a product policy and must be modeled explicitly. It must not be inferred indirectly from token ordering or generic CLMM terminology.
This swap leg is mandatory in the CLMM V2 exit flow and is not optional in MVP.

## MVP Scope

### In Scope For MVP

- wallet connection for supported user-controlled wallets
- support for reading supported Orca CLMM positions
- backend-supported monitoring of position price relative to configured range
- breach detection for below-lower-bound and above-upper-bound states
- user alerting when a supported position reaches an exit condition
- execution preview showing:
  - affected position and pool
  - breach direction
  - estimated liquidity removal outcome
  - estimated fees collected
  - estimated post-swap asset outcome
  - slippage / route / timing caveats
- user-signed execution flow only
- off-chain execution history and status tracking
- execution history is limited to an off-chain operational event log for user review, support, and debugging
- clear transaction lifecycle states such as previewed, awaiting signature, submitted, confirmed, failed, expired, or abandoned

### MVP Protocol Scope

- Orca-first for concentrated liquidity position support
- Jupiter-first for required post-exit swap routing / quote support to enforce the directional exit policy

### MVP UX Scope

- mobile-first primary flow
- desktop-capable PWA support for review, history, and supported manual execution
- best-effort mobile PWA support, but not equal to native mobile execution quality

## Explicit Non-Goals

- generic wallet behavior
- broad swap, transfer, staking, or portfolio-management features
- general portfolio analytics platform
- social features, copy trading, or strategy marketplace
- multi-chain support
- no multi-DEX or multi-CLMM position support in V1 beyond Orca-first LP support and the minimum swap-routing dependency required for the directional exit invariant
- autonomous custody
- autonomous execution without per-action user signature
- on-chain receipt, attestation, claim, proof, or verification subsystem
- broad DeFi “super app” behavior

## Platform Stance

CLMM V2 must preserve:

- **React Native primary experience**
- **PWA support**

The recommended platform stance is:

- one Expo universal app with shared domain and application core
- native mobile as the primary execution surface
- desktop web / PWA as a supported secondary surface
- mobile web / PWA as best-effort support, not parity with native mobile

The product brief must not imply equal platform behavior across Android, iOS, desktop web, and mobile web.

## Trust Model

CLMM V2 is explicitly:

- non-custodial
- user-signed execution only
- off-chain execution history only

The product must preserve:

- no autonomous custody
- no unattended trade execution
- no implied guarantee of protection, best execution, or optimal outcome
- no claim that off-chain history is canonical proof
- no signed receipts, attestation artifacts, proof exports, claim flows, or verification features derived from execution history

Trust in this product depends on:

- accurate breach-side explanation
- clear execution preview
- explicit distinction between estimate and executed result
- transparent transaction status reconciliation
- clear disclosure that notifications are best-effort

## Key Business Rules

- A position only earns fees while inside its configured range.
- When price leaves the range, the position becomes one-sided and does not auto-close.
- Breach evaluation is position-specific, not pool-generic.
- Liquidity removal, fee collection, and follow-on swap are distinct steps even if presented as one guided action.
- Submission is not confirmation; transaction reconciliation is required.
- Notification delivery time is not the same as breach detection time.
- Off-chain history is an operational record, not an on-chain attestation system.

## Success Criteria

### Product Success

- Users can move from breach alert to execution preview with very low friction on mobile.
- Users understand what they will likely hold after exit before signing.
- Users trust that the app assists execution without taking control away from them.
- The product is seen as a focused operational tool, not as a generalized DeFi platform.

### MVP Success Signals

- supported users can connect wallets and reliably view supported Orca CLMM positions
- breach alerts are generated and delivered with acceptable operational reliability
- preview generation is understandable and actionable
- user-signed exit flows complete successfully at acceptable rates
- execution history is useful for user review and support/debugging
- early users report reduced monitoring burden and faster response time

## Major Risks

### Product Risks

- users may expect guarantees the product cannot provide
- notification reliability may be perceived as product reliability
- product scope may drift into analytics, wallet, or automation behavior

### Market Risks

- existing protocol UIs and alerting features may be “good enough” for some users
- the addressable wedge may be narrower than a broad DeFi audience, which is acceptable only if scope remains tight

### Domain Risks

- wrong breach-side mapping or wrong token-role modeling would break the core promise
- stale quotes or misunderstood one-sided exposure would erode trust quickly

### Technical Risks

- client-side background monitoring is not reliable enough; backend monitoring is required
- wallet integration behavior differs materially across Android, iOS, desktop web, and mobile web
- previewed and executed outcomes can diverge because of slippage, routing, blockhash expiry, and transaction timing
- local-only persistence is insufficient for durable execution history

## Product Constraints That Must Remain Locked

- narrow, shippable MVP scope
- React Native primary experience
- PWA support
- shared domain and application core across platforms
- user-signed execution only
- off-chain execution history only
- no on-chain receipt / attestation / claim / proof subsystem
- clean architecture + DDD from the start
- Orca-first LP support in MVP; do not expand to additional CLMM protocols in V1

## What The Product Must Not Become

CLMM V2 must not become:

- a generic wallet
- a portfolio analytics suite
- a social or copy-trading product
- a strategy marketplace
- a broad CLMM management terminal
- a vault / delegated automation product
- a multi-chain DeFi platform
- an execution-certification, receipt, or proof-verification product

If a proposed feature does not directly improve breach detection, execution preview clarity, user-signed exit completion, or execution history usefulness, it should face a high bar for inclusion.

## Recommended MVP Boundary Statement

CLMM V2 is a **mobile-first, non-custodial exit assistant for supported Solana concentrated liquidity positions**. It detects when a supported position moves out of range, prepares the correct exit and rebalance path, alerts the user, shows a clear execution preview, and executes only after explicit user signature. It stores operational history off-chain and does not attempt to be a general wallet, analytics suite, or autonomous strategy platform.

## Source Inputs

- `_bmad-output/planning-artifacts/01-brainstorm-project.md`
- `_bmad-output/planning-artifacts/02-market-research.md`
- `_bmad-output/planning-artifacts/03-domain-research.md`
- `_bmad-output/planning-artifacts/04-technical-research.md`
