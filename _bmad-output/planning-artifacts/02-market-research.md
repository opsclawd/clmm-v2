# CLMM V2 Market Research

**Research date:** March 21, 2026  
**Product under study:** CLMM V2  
**Scope:** Mobile-first CLMM exit assistant for Solana concentrated liquidity positions with user-signed execution and off-chain execution history  
**Core invariant preserved:**  
- Downside breach: remove liquidity -> collect fees -> swap resulting SOL exposure to USDC  
- Upside breach: remove liquidity -> collect fees -> swap resulting USDC exposure to SOL  

## Research Method

This research used current official docs, product sites, and support content from the relevant Solana ecosystem products as of **March 21, 2026**. Where the document says a team appears to lack a feature, that is an **inference from currently published official materials**, not proof that no internal or unreleased feature exists.

## Executive Summary

The Solana LP market already has strong products for:

- **Direct CLMM/DLMM position management**: Orca, Raydium, Meteora
- **Automated CLMM outsourcing**: Kamino
- **Alert infrastructure and wallet-native notification rails**: Dialect, Jupiter Radar
- **Mobile wallet access**: Phantom, Solflare, Jupiter Mobile

What is still weakly served is the space between manual LP management and full automation:

- A product that detects a **breach event**
- Explains the **exact exit consequence**
- Prepares a **user-signed transaction flow**
- Optimizes the flow for **mobile response speed**
- Keeps a clean **off-chain operational record**

That gap is especially visible for users managing **out-of-range exits** rather than users seeking yield optimization, vault automation, or general portfolio tooling.

The best narrow wedge for CLMM V2 is therefore:

**Orca-first, mobile-first, non-custodial breach-to-exit assistance for user-owned concentrated liquidity positions.**

## 1. Competitive Landscape

### A. Direct Solana CLMM / DLMM Position Managers

#### Orca

Orca is the most relevant direct comparison for an Orca-first MVP.

What Orca already does well:

- Native Whirlpools position management
- Position details with token balances, range, current price, in-range status, and fee harvesting
- Withdrawal flow where fees are harvested automatically during withdrawal
- Official out-of-range alerts via in-app, Telegram, and email
- SDK support for monitoring positions and generating close-position flows

Key evidence:

- Orca documents a dedicated **Alerts** feature for out-of-range positions and explicitly frames it as a way to stop constantly watching charts. It supports **in-app, Telegram, and email** notifications.  
  Source: [Orca Alerts](https://docs.orca.so/liquidity/manage/alerts)
- Orca’s position sidebar centralizes monitoring, harvesting, deposit, and withdrawal, with **fees harvested automatically** on withdrawal.  
  Source: [Orca Position Details Sidebar](https://docs.orca.so/liquidity/manage/sidebar)
- Orca’s SDK docs describe a close-position flow that collects fees and rewards, decreases liquidity, and closes the position.  
  Source: [Orca Close Position SDK Guide](https://docs.orca.so/developers/sdks/positions/close-position)
- Orca’s monitoring docs explicitly support fetching wallet positions and building systems that alert when positions require attention.  
  Source: [Orca Monitor Positions SDK Guide](https://docs.orca.so/developers/sdks/positions/monitor-positions)

Strategic reading:

- Orca covers **position visibility** and **basic alerting**
- Orca does **not** present a dedicated product flow for the exact breach-response sequence CLMM V2 is targeting
- Orca still centers the user on the **protocol UI**, not on a focused **incident-response workflow**

Main weakness relative to CLMM V2:

- Alerting exists, but the product does not appear to be specialized around a **mobile-first, breach-to-exit assistant flow**

#### Raydium CLMM

Raydium is a major direct comparison for Solana concentrated liquidity, but its official materials emphasize manual position management rather than alert-driven assistance.

What Raydium clearly supports:

- Creating and managing CLMM positions
- NFT-based positions
- Manual add/remove liquidity
- Out-of-range state awareness
- Fee collection when liquidity is modified

Key evidence:

- Raydium’s docs state that if a position goes out of range, it stops earning, becomes fully one-sided, and **there is no auto-close mechanism**.  
  Source: [Raydium CLMM (Concentrated)](https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/clmm-concentrated)
- Raydium’s LP guide explains that if the user wants to adjust the price range, they must create a new position.  
  Source: [Providing Concentrated Liquidity (CLMM)](https://docs.raydium.io/raydium/for-liquidity-providers/providing-concentrated-liquidity-clmm)
- Raydium also explains that fee collection happens when liquidity is reduced, including a zero-liquidity reduction.  
  Source: [Raydium CLMM (Concentrated)](https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/clmm-concentrated)

Strategic reading:

- Raydium is strong as a **protocol venue**
- Raydium is weak as a **guided exit assistant**
- Raydium’s materials reinforce the manual burden that CLMM V2 is trying to reduce

Important market signal:

- Raydium’s own docs highlight that an out-of-range CLMM becomes one-sided and remains open. That is exactly the operating problem CLMM V2 is designed to address.

#### Meteora DLMM

Meteora is not CLMM in the Orca/Raydium sense, but it is adjacent because it serves active range-based LPs on Solana and shapes user expectations for advanced LP tooling.

What Meteora already does well:

- Dense LP terminal experience
- Real-time position tracking
- Quick actions and management controls
- Rich charting and analytics

Key evidence:

- Meteora describes its DLMM Dynamic Terminal as a unified command center with charting, real-time position tracking, and position management.  
  Source: [Meteora Dynamic Terminal](https://docs.meteora.ag/user-guide/guides/how-to-use-dlmm/dynamic-terminal)
- Meteora’s docs state that out-of-range positions stop earning fees and that the user can wait or rebalance.  
  Source: [Meteora Dynamic Terminal](https://docs.meteora.ag/user-guide/guides/how-to-use-dlmm/dynamic-terminal)
- Meteora also emphasizes that LPs should closely monitor positions and adjust based on market conditions.  
  Source: [What’s DLMM?](https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm)

Strategic reading:

- Meteora is closer to a **power-user terminal**
- It is useful evidence that LP users value rich monitoring and quick actions
- It still does not occupy the narrow space of **mobile-first breach execution assistance**

#### MizuFi

MizuFi is a relevant niche signal because it explicitly positions itself as one-click DLMM liquidity management on Solana and is non-custodial.

What MizuFi claims:

- One-click DLMM management on Meteora
- Portfolio dashboard
- Fee claims
- Jupiter swap integration
- Transaction history
- Non-custodial, read-only plus signed actions

Key evidence:

- MizuFi’s site highlights pool explorer, portfolio dashboard, Jupiter swap integration, fee claiming, and transaction history.  
  Source: [MizuFi Home](https://www.mizufi.finance/)
- MizuFi explicitly states it is non-custodial and that it reads data publicly while the user signs all transactions.  
  Source: [MizuFi Home](https://www.mizufi.finance/)
- Its docs describe positions, claims, and remove actions in a single portfolio dashboard.  
  Source: [MizuFi Docs](https://www.mizufi.finance/docs)

Strategic reading:

- This is the strongest evidence that there is room for **narrow LP operations software** beyond the major DEX UIs
- However, MizuFi is Meteora-specific and oriented toward **DLMM management**, not a dedicated **out-of-range exit assistant**

### B. Automated LP Management Instead of Assisted Exit

#### Kamino

Kamino is the strongest adjacent competitor in terms of user job-to-be-done, but it solves the problem by **outsourcing LP management into vaults**, not by helping users manage their own direct LP positions.

What Kamino already does:

- Automated CLMM liquidity vaults
- Auto-rebalancing
- Auto-compounding
- Auto-swap for single-sided deposits and withdrawals

Key evidence:

- Kamino docs frame manual range management and manual fee harvesting as the CLMM problem, then present automated rebalancing, auto-compounding, and auto-swap as the solution.  
  Source: [Kamino Automated Liquidity Intro](https://docs.kamino.finance/automated-liquidity)
- Kamino’s docs state that range rebalancing is fully automated.  
  Source: [Kamino Ranges & Rebalancing](https://docs.kamino.finance/automated-liquidity/liquidity-vaults/ranges-and-rebalancing)
- Kamino also documents auto-swap for single-sided deposits and withdrawals.  
  Source: [Kamino Auto-swap](https://docs.kamino.finance/automated-liquidity/liquidity-vaults/liquidity-vault-overview/auto-swap)

Strategic reading:

- Kamino proves the demand for “I do not want to babysit CLMM positions”
- But Kamino is the **wrong trust model** for CLMM V2’s invariant
- It targets users comfortable with **delegated strategy infrastructure**, not users who want **explicit per-exit signing on their own LP**

Implication:

- Kamino is not the product to copy
- Kamino is the product to position against: “assistance without giving up control”

### C. Alerts, Notification Rails, and Wallet-Connected Assistants

#### Dialect and Jupiter Radar

These are important not because they are direct CLMM competitors, but because they shape current user expectations around wallet-native alerts and actionability.

Key evidence:

- Orca’s alerts are powered by Dialect.  
  Source: [Orca Alerts](https://docs.orca.so/liquidity/manage/alerts)
- Dialect markets alerts as multi-channel infrastructure for in-app, email, Telegram, mobile push, and a universal inbox.  
  Source: [Dialect Alerts](https://docs.dialect.to/alerts)
- Dialect’s July 7, 2025 launch of Universal Inbox put Radar inside Jupiter Mobile and listed ecosystem teams such as Raydium, Kamino, and Meteora as participating notification senders.  
  Source: [Dialect Universal Inbox, July 7, 2025](https://www.dialect.to/blog/presenting-the-universal-inbox)
- Jupiter Mobile’s official help center says Radar provides push notifications for swaps, trigger orders, sends, magic links, and updates from leading ecosystem projects. It also explicitly says push notifications are provided on a **best-effort basis** and can be delayed or missed.  
  Source: [Jupiter Mobile Radar Notifications](https://support.jup.ag/hc/en-us/articles/22633262114332-How-can-I-get-notifications-in-Jupiter-Mobile)

Strategic reading:

- Users already expect wallet-native alerts and mobile push in the Solana ecosystem
- They also expect that notifications are **not guaranteed**
- CLMM V2 can plug into a known behavior pattern without pretending alerts are infallible

## 2. Likely Target Customer Needs

Based on the current product landscape, the likely customer for CLMM V2 needs:

### Immediate breach detection

The user wants to know quickly when a position is no longer earning and has become operationally exposed to one side of the pair.

### Fast explanation of what the exit will do

Users do not just need “out of range.” They need:

- Which side was breached
- What token exposure now dominates
- What the app proposes to do next
- What token they are expected to end with after the unwind

### Fewer moving parts on mobile

Existing LP tooling is still mostly chart-first, terminal-first, or general dashboard-first. The user wants:

- Alert
- Review
- Sign
- Done

### Control without automation anxiety

The user wants operational help, but not custody transfer or autonomous transaction execution.

### Confidence before signature

Before signing, the user needs:

- Estimated liquidity removal outcome
- Fees expected to be collected
- Swap route / quote visibility
- Slippage caveats
- Failure or retry clarity

### Lightweight execution memory

Users need a clean operational history answering:

- When was the breach detected?
- Was a preview shown?
- Did the user sign?
- Did the execution succeed, fail, or expire?

## 3. Unmet User Pain

### The market has a gap between “alert” and “action”

Orca demonstrates there is demand for range alerts. But the alert itself is still not the whole job. The user still has to:

- interpret the state,
- decide the exact unwind,
- manage the swap consequence,
- and execute manually.

### Existing direct LP tools are management tools, not incident tools

Raydium and Orca expose position details and controls, but their interfaces are fundamentally **position-management surfaces**. CLMM V2’s opportunity is to be an **incident-response surface**.

### The “what will I end up holding?” question is still under-served

For out-of-range exits, users care less about APR math at that moment and more about:

- whether they will end up mostly in SOL or USDC,
- how much will be swapped,
- and how the final state aligns with their defensive objective.

### Mobile workflows remain awkward

Phantom’s official guidance says mobile dApp connection works only in its in-app browser, not in standard mobile browsers. Solflare similarly routes users through the wallet’s mobile browser.  
Sources: [Phantom mobile connection](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site), [Solflare mobile dApp connection](https://help.solflare.com/en/articles/6176657-how-to-connect-to-dapps-using-solflare-mobile)

This means users often face:

- wallet-browser context constraints,
- reconnect friction,
- and fragile alert-to-sign journeys.

### History is usually either raw chain activity or too broad

Existing products tend to provide either:

- blockchain transaction visibility,
- broad portfolio views,
- or terminal-style position pages.

There is still room for a simple **operational log of breach-response attempts**.

## 4. Patterns Competitors Handle Poorly

### Poor Pattern 1: Too much dashboard, not enough decision support

Competitors often answer “what is happening?” but not “what should I do right now?”

### Poor Pattern 2: Alerting disconnected from execution

Alerting and execution are usually separate features, not one coherent flow.

### Poor Pattern 3: Protocol-centric UX instead of task-centric UX

Users managing an out-of-range exit care about a task:

- exit cleanly,
- convert resulting side exposure,
- and move on.

Most products instead anchor the user in the DEX’s generic portfolio or pool model.

### Poor Pattern 4: Mobile is wallet-accessible, not truly mobile-first

The ecosystem supports mobile access, but much of it is still just a web workflow routed through a wallet browser. That is not the same as a deliberately designed mobile operating flow.

### Poor Pattern 5: Automation is all-or-nothing

Current products lean toward either:

- full manual control, or
- strategy-level automation.

The “human-in-the-loop execution assistant” category is still underdeveloped.

## 5. Trust and Safety Expectations

The market evidence points to a clear trust baseline for CLMM V2.

### Expectation 1: Non-custodial by default

Users expect to retain control of funds and sign actions themselves. This is reinforced by Phantom, Solflare, and MizuFi’s official positioning.  
Sources: [Phantom connection guidance](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site), [Solflare mobile wallet guidance](https://help.solflare.com/en/articles/5797200-how-to-get-started-with-solflare), [MizuFi security positioning](https://www.mizufi.finance/)

### Expectation 2: Never ask for secret recovery phrases

Wallet vendors repeatedly stress that legitimate app connections never require entering the recovery phrase into a website.  
Source: [Phantom connection guidance](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site)

### Expectation 3: Verify URLs and app authenticity

Both Phantom and Solflare emphasize using trusted apps and verifying URLs.  
Sources: [Phantom connection guidance](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site), [Solflare mobile dApp connection](https://help.solflare.com/en/articles/6176657-how-to-connect-to-dapps-using-solflare-mobile)

### Expectation 4: Alerts are helpful, not guaranteed

Jupiter explicitly states mobile notifications are best-effort and may be delayed or missed. CLMM V2 should adopt the same honesty.  
Source: [Jupiter Mobile Radar Notifications](https://support.jup.ag/hc/en-us/articles/22633262114332-How-can-I-get-notifications-in-Jupiter-Mobile)

### Expectation 5: Transaction transparency matters

Users expect clear signing prompts and visible transaction consequences. MizuFi also makes explorer-linked transparency part of its trust story.  
Source: [MizuFi Home](https://www.mizufi.finance/)

### Expectation 6: No fake guarantees

Given impermanent loss, slippage, routing, and latency risk, the product cannot imply guaranteed protection or optimality.

## 6. Opportunities for a Narrow, Differentiated MVP

### Opportunity A: Own the breach-to-exit workflow on Orca

Start with one protocol where:

- the LP model is well-understood,
- alerts already validate the need,
- and the position mechanics are explicit.

This keeps scope tight and makes product messaging clear.

### Opportunity B: Build a task-specific mobile flow, not another dashboard

The MVP should be optimized around one moment:

**A position breached. Review the unwind. Sign if acceptable.**

That is more differentiated than competing on charts, analytics, or pool discovery.

### Opportunity C: Provide a better execution preview than generic DEX UI

This is likely the single best product wedge.

Preview should make the user feel:

- “I understand what will happen”
- “I understand what I’ll hold afterward”
- “I know what risks remain before I sign”

### Opportunity D: Position against both extremes

CLMM V2 can occupy a useful middle:

- better than manual dashboard clicking
- safer-feeling than handing strategy control to an automated vault

### Opportunity E: Make off-chain execution history operational, not analytical

A concise history of:

- breach detected,
- preview prepared,
- signature requested,
- execution success or failure,

is differentiated enough without becoming a portfolio analytics platform.

### Opportunity F: Use existing notification expectations instead of inventing a new behavior

Users already understand:

- Telegram / email / in-app alerts from Orca
- wallet-native push from Jupiter Radar

CLMM V2 should fit into those expectations rather than trying to educate the market on a new alert behavior model.

## 7. Risks of Overbuilding Beyond the Real Market Need

### Risk 1: Becoming a general CLMM manager

If CLMM V2 starts adding:

- advanced analytics,
- pool discovery,
- strategy simulators,
- broad liquidity deployment tools,

it will drift into competing directly with larger protocol UIs and terminal-style products.

### Risk 2: Becoming a vault or automation product

If the product starts promising automatic range management or unsupervised execution, it stops being the product defined here and starts colliding with Kamino-like expectations.

### Risk 3: Building multi-protocol support too early

Orca-first is strategically sound. A thin abstraction may become useful later, but premature support for Raydium and Meteora would increase product and QA complexity before the core workflow is proven.

### Risk 4: Over-investing in analytics before proving the core action loop

The market does not appear to be missing another place to stare at LP metrics. It is missing a sharper path from signal to action.

### Risk 5: Building a custom notification stack from scratch

The ecosystem already has mature patterns and infrastructure for alerts. CLMM V2 should not spend early product energy reinventing generic messaging infrastructure if the real wedge is the exit workflow.

### Risk 6: Expanding beyond the breach-response job

If the product starts chasing:

- broad portfolio visibility,
- social features,
- yield discovery,
- strategy marketplaces,
- or generalized DeFi operations,

it will dilute the message and the onboarding value proposition.

## Product Positioning Recommendation

The most defensible market position is:

**CLMM V2 is a mobile-first, non-custodial exit assistant for supported Solana concentrated liquidity positions. It does not manage your whole portfolio. It does not take custody. It does not auto-trade for you. It detects breach events, prepares the exact unwind path, shows a clear execution preview, and executes only when you sign.**

## Bottom-Line Recommendation

Proceed with a **narrow Orca-first MVP** focused on:

- wallet connection
- supported Orca LP position detection
- out-of-range monitoring
- breach alerting
- execution preview
- user-signed remove + collect + swap flow
- off-chain execution history

Do **not** expand the MVP into:

- general LP analytics
- multi-DEX breadth
- autonomous strategy automation
- generalized wallet or portfolio product behavior

That narrow wedge is where the market gap appears most credible.

## Sources

- [Orca Alerts](https://docs.orca.so/liquidity/manage/alerts)
- [Orca Position Details Sidebar](https://docs.orca.so/liquidity/manage/sidebar)
- [Orca Close Position SDK Guide](https://docs.orca.so/developers/sdks/positions/close-position)
- [Orca Monitor Positions SDK Guide](https://docs.orca.so/developers/sdks/positions/monitor-positions)
- [Raydium: Providing Concentrated Liquidity (CLMM)](https://docs.raydium.io/raydium/for-liquidity-providers/providing-concentrated-liquidity-clmm)
- [Raydium: CLMM (Concentrated)](https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/clmm-concentrated)
- [Meteora: DLMM Dynamic Terminal](https://docs.meteora.ag/user-guide/guides/how-to-use-dlmm/dynamic-terminal)
- [Meteora: What’s DLMM?](https://docs.meteora.ag/overview/products/dlmm/what-is-dlmm)
- [Kamino Automated Liquidity Intro](https://docs.kamino.finance/automated-liquidity)
- [Kamino Ranges & Rebalancing](https://docs.kamino.finance/automated-liquidity/liquidity-vaults/ranges-and-rebalancing)
- [Kamino Auto-swap](https://docs.kamino.finance/automated-liquidity/liquidity-vaults/liquidity-vault-overview/auto-swap)
- [Dialect Alerts](https://docs.dialect.to/alerts)
- [Dialect Universal Inbox, July 7, 2025](https://www.dialect.to/blog/presenting-the-universal-inbox)
- [Jupiter Mobile Radar Notifications](https://support.jup.ag/hc/en-us/articles/22633262114332-How-can-I-get-notifications-in-Jupiter-Mobile)
- [Jupiter Mobile availability](https://support.jup.ag/hc/en-us/articles/22632806628252-How-do-I-download-and-install-Jupiter-Mobile)
- [Jupiter Developer Platform](https://dev.jup.ag/)
- [Jupiter Wallet Kit](https://dev.jup.ag/tool-kits/wallet-kit)
- [Phantom: Connect to an app or site](https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site)
- [Solflare: How to Connect to dApps using Solflare (Mobile)](https://help.solflare.com/en/articles/6176657-how-to-connect-to-dapps-using-solflare-mobile)
- [Solflare: How To Get Started](https://help.solflare.com/en/articles/5797200-how-to-get-started-with-solflare)
- [MizuFi Home](https://www.mizufi.finance/)
- [MizuFi Docs](https://www.mizufi.finance/docs)
