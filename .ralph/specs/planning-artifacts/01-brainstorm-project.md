# CLMM V2 Brainstorm Project

## Product Seed

CLMM V2 is a mobile-first exit assistant for Solana concentrated liquidity positions. The narrow MVP is an Orca-first companion that detects when a supported LP position moves outside its configured range, prepares the correct exit path, alerts the user, shows an execution preview, and completes the exit only after the user signs.

Core preserved behavior:

- Connect wallet
- Read supported CLMM LP position
- Monitor active price against range
- If price breaches below lower bound: remove liquidity, collect fees, swap resulting SOL exposure to USDC
- If price breaches above upper bound: remove liquidity, collect fees, swap resulting USDC exposure to SOL
- Alert user when exit condition is met
- Show execution preview
- Require user signature for execution
- Record off-chain execution history and status

## 1. Possible Product Framings

### Framing A: LP Exit Guardrail

Position the product as a risk-control tool for CLMM LPs who do not want to babysit ranges all day. The value proposition is simple: "Know when your range breaks, see the exit, sign it fast."

Why it works:

- Clear and narrow promise
- Easy to explain in one screen
- Strong fit with user-signed, non-custodial trust model
- Avoids expanding into generalized strategy automation

### Framing B: Range Breach Rescue Tool

Position the app as a rescue workflow for LPs when a position stops behaving as intended. The emphasis is not optimization but fast recovery from an out-of-range state.

Why it works:

- Resonates with users who have already experienced unmanaged out-of-range losses
- Keeps product language anchored in execution, not speculation
- Supports alert-first mobile behavior

### Framing C: Mobile CLMM Exit Co-Pilot

Position the app as a lightweight co-pilot that watches the market, prepares the exit path, and leaves final control with the user.

Why it works:

- Balances convenience with explicit user control
- Aligns with preview-plus-sign interaction model
- Feels more trustworthy than "automation" while still sounding helpful

### Recommended MVP Framing

Lead with **LP Exit Guardrail**. It is the clearest framing, the least likely to imply autonomous execution, and the best match for a narrow, shippable Orca-first release.

## 2. Target User Segments

### Primary Segment: Active Solana CLMM LPs

Users who already provide liquidity on Orca and understand price ranges, fee collection, and impermanent loss. They want faster reactions when positions move out of range but do not want to hand custody to a bot.

### Secondary Segment: Mobile-Heavy DeFi Operators

Users who actively manage positions from their phone during the day and need fast signal-to-action flows. They care more about operational responsiveness than deep analytics.

### Tertiary Segment: Risk-Conscious Semi-Passive LPs

Users who are comfortable opening CLMM positions but not comfortable monitoring them continuously. They value alerts, clear previews, and guardrails over advanced strategy controls.

### Poor-Fit Segments

- First-time DeFi users who do not understand LP mechanics
- Pro traders looking for fully autonomous execution infrastructure
- Users seeking portfolio analytics, social signals, or copy trading

## 3. User Pain Points

### Monitoring Fatigue

LPs must manually check whether the active price is still inside range. That is tedious, easy to miss, and poorly suited to mobile usage.

### Slow Reaction Time

By the time a user notices a breach, market conditions may have moved further, making the unwind less favorable.

### Operational Complexity

Exiting an out-of-range CLMM position requires multiple coordinated steps. Users have to remember the correct sequence and still estimate the post-withdraw asset mix.

### Unclear Consequences Before Signing

Users often cannot quickly tell what assets they will end up holding, what fees were collected, what swap path will be used, and what slippage or network conditions may change the result.

### Trust Gap With Existing Automation

Many LPs dislike handing funds to autonomous bots or opaque systems. They want assistance, not delegated custody.

### Weak Mobile UX in Existing DeFi Tools

Most Solana LP management tools are desktop-first or data-dense. They are not optimized for a short alert-to-decision loop on a phone.

## 4. Key Product Risks

### Market Execution Risk

A breach alert can arrive, but execution quality may still vary because of slippage, liquidity depth, routing quality, and network congestion. Users may blame the product for market outcomes it does not control.

### False Confidence Risk

If messaging is careless, users may assume the app guarantees protection or optimal exits. It does not. It only helps detect, prepare, and execute a user-approved exit flow.

### Latency and Freshness Risk

Monitoring accuracy depends on timely market data and reliable wallet/session readiness. A stale quote or delayed alert weakens trust quickly.

### Integration Risk

An Orca-first MVP is good for scope control, but any Orca API, SDK, or pool-model changes can directly impact the product. Thin abstraction may be helpful later, but only after Orca execution is stable.

### Transaction Composition Risk

Bundling liquidity removal, fee collection, and swap preview into a comprehensible user flow is product-critical. Errors in preview accuracy or transaction sequencing create high-severity trust failures.

### Notification Delivery Risk

If the alert is late, missed, or noisy, the product loses its core value. Alert reliability is part of the product, not a secondary feature.

### Compliance and User Expectation Risk

Even without custody, a product that monitors positions and proposes exits can be perceived as automated financial tooling. Language, onboarding, and disclaimers need precision.

## 5. UX Priorities for Mobile-First Use

### Priority 1: Alert-to-Action Speed

The core mobile flow should minimize steps between "your range was breached" and "review and sign." Users should not dig through dashboards to find the affected position.

### Priority 2: High-Signal Position Status

The default view should answer four questions instantly:

- Which position is affected?
- Which side was breached?
- What assets will I end up with?
- What do I need to sign right now?

### Priority 3: Execution Preview Clarity

Preview must be simple and legible on a phone:

- Position and pool
- Breach direction
- Liquidity to remove
- Estimated fees collected
- Estimated resulting token balances
- Estimated swap outcome
- Slippage and network caveats

### Priority 4: Wallet and Signing Friction Reduction

Connection, re-connection, and signing should be resilient across mobile wallets and PWA contexts. Session recovery matters because breach events are time-sensitive.

### Priority 5: Calm, Trustworthy UI

Use clear severity states and precise wording. Avoid hype, trading jargon overload, or visuals that imply guaranteed safety.

### Priority 6: Actionable History

Execution history should be short and useful:

- Alert triggered
- Preview generated
- User signed or abandoned
- Execution succeeded or failed
- Key timestamps and result summary

This is operational memory, not a portfolio analytics module.

## 6. Trust-Model Implications

### User-Signed Only Must Be Obvious

The product should repeatedly reinforce that it never executes without the user's signature. This is central to differentiation and risk control.

### Non-Custodial Positioning Is a Feature

The app should frame itself as a monitoring and execution assistant, not a managed strategy vault. Wallet ownership remains with the user at all times.

### Preview Accuracy Is Trust Infrastructure

Because the user is asked to sign a consequential transaction, the preview is not cosmetic. It is part of the trust model. Estimates, caveats, and failure states need to be explicit.

### Off-Chain History Needs Careful Wording

Since there is no on-chain receipt or proof subsystem, the product must describe history as application-side records of alerts and execution status, not canonical proof.

### Failure Handling Must Be Transparent

If a quote expires, a swap cannot route, or a signature is rejected, the app should explain exactly what happened and what the user can retry. Ambiguity erodes trust faster than failure itself.

### Notifications Should Avoid Implied Agency

Alert copy should say the condition was detected and an exit is available to review. It should not imply the app already acted or will act automatically.

## 7. What The Product Must Explicitly Not Become

### Not a General Wallet

Do not expand into broad wallet balances, transfers, swaps, staking, or account management beyond what is needed for the exit flow.

### Not a Portfolio Analytics Platform

Avoid PnL dashboards, tax tooling, historical performance suites, and broad position intelligence unless a later phase proves they are essential to the exit workflow.

### Not a Full Automation Bot

Do not drift into delegated execution, key custody, autonomous triggers without signatures, or "set and forget" strategy marketing.

### Not a Broad CLMM Meta-Aggregator at MVP

Stay Orca-first unless a thin integration abstraction clearly improves delivery without slowing the MVP. Multi-protocol support is a later decision, not a launch requirement.

### Not a Social or Marketplace Product

No copy trading, leaderboards, strategy sharing, social feeds, or marketplace mechanics.

### Not a General DeFi Super-App

Any feature that does not directly improve breach detection, exit preparation, signing confidence, or execution history should face a high bar for inclusion.

## Suggested Product Boundary Statement

CLMM V2 should be defined as a **mobile-first, non-custodial exit assistant for supported Solana CLMM positions**. It watches for range breaches, prepares the correct unwind and rebalance path, alerts the user, and completes execution only after explicit user signature. It should remain a focused operational tool, not a generalized DeFi platform.
