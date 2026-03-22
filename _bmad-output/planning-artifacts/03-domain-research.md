# CLMM V2 Domain Research

**Research date:** March 21, 2026  
**Product:** CLMM V2  
**Domain:** Solana concentrated liquidity position management focused on out-of-range exit behavior

## Scope Note

This document separates three things:

1. **Protocol facts** from current official Solana / Orca / Raydium / Jupiter documentation
2. **Product policy** specific to CLMM V2
3. **Design inferences** for off-chain history, auditability, and user workflow

That separation matters. Several failures in this product class come from treating product policy as if it were a protocol fact.

## Executive Read

The core domain truth is simple:

- A CLMM position only earns while price is inside its configured range.
- When price leaves the range, the position becomes fully one-sided.
- The position does **not** auto-close.
- Fees accrue continuously while in-range, but transfer to the wallet only when liquidity is modified or explicitly harvested according to protocol behavior.
- Removing liquidity and performing a follow-on swap are separate concepts, even if the product presents them as one guided action.

For CLMM V2, the important product rule is:

- **Below lower bound:** exit and normalize resulting SOL exposure into USDC
- **Above upper bound:** exit and normalize resulting USDC exposure into SOL

That swap direction is a **product invariant**, not a generic CLMM rule.

## 1. Domain Glossary

### CLMM

Concentrated Liquidity Market Maker. Liquidity is provided only across a chosen price range instead of across the full curve.

### Position

A user’s liquidity allocation inside a specific pool and price range. On Solana CLMM systems this is commonly represented by an NFT or tokenized position account.

### Position NFT

The tokenized ownership record of the position. In Raydium, the position NFT controls the liquidity and any uncollected fees and rewards. Ownership transfer changes control of the position.

### Pool

The token pair market where swaps occur and LP liquidity is deployed.

### Token A / Token B

Protocol-level token ordering for a pool. This ordering is not interchangeable with the product’s human-friendly idea of “base”, “quote”, “risk asset”, or “defensive asset”.

### Price Range

The lower bound and upper bound within which the position is active and fee-earning.

### Lower Bound / Upper Bound

The minimum and maximum prices selected for the position.

### In-Range

Current price is inside the position’s lower and upper bounds. The position participates in trades and earns fees.

### Out-of-Range

Current price is below the lower bound or above the upper bound. The position stops participating in trades and stops earning fees.

### Boundary Breach

The moment the monitored price crosses below the lower bound or above the upper bound according to the product’s chosen observation rules.

### One-Sided Exposure

Once the position is outside range, its liquidity has effectively converted into one of the two pool tokens. For Orca’s SOL/USDC example:

- Above range -> 100% USDC
- Below range -> 100% SOL

### Tick / Tick Spacing

Discrete price steps used by CLMM systems. Bounds are chosen from valid ticks, not arbitrary floating-point prices.

### Liquidity Removal / Decrease Liquidity

The action that withdraws some or all liquidity from the position. Full removal exits the LP exposure; protocol-specific close behavior may additionally burn or retain the position NFT.

### Harvest / Fee Collection

The action that transfers accrued fees and rewards to the wallet. On some Solana CLMM systems, fee transfer is coupled to liquidity modification.

### Close Position

A stronger action than “remove liquidity” when supported. It can include fee collection, liquidity removal, and closing the position record or burning the NFT. Product logic must not assume this always means the same thing across protocols.

### Swap Direction

The post-exit asset conversion selected by the product. In CLMM V2 this is not “whatever token was withdrawn”; it is a deterministic rebalance policy based on breach side.

### Slippage

The tolerated difference between expected token amounts and actual executed amounts. There are at least two separate slippage domains here:

- liquidity removal slippage
- swap slippage

### Price Impact

Execution quality degradation caused by trade size relative to available liquidity. This is especially relevant for the follow-on swap.

### Quote

An estimate used for preview and transaction construction. A quote is not a guarantee.

### Context Slot

The Solana ledger slot used by the quoting or observation process. It matters because previews can become stale relative to chain state.

### Recent Blockhash

A transaction freshness marker used by Solana. If it expires before landing, the transaction cannot be processed.

### lastValidBlockHeight

The latest block height at which a transaction built from a fetched blockhash remains valid.

### Preflight

Simulation and signature verification performed before transaction submission, unless explicitly skipped.

### Commitment Level

The finality target used when reading chain state or tracking transaction outcome, typically `processed`, `confirmed`, or `finalized`.

### Signature Status

The observed processing state of a submitted Solana transaction signature. This must be tracked separately from “send succeeded”.

### Off-Chain Execution History

Application-maintained records of breach detection, preview generation, signing attempts, submissions, confirmations, failures, and user decisions. This is not an on-chain proof system.

## 2. Critical Business Rules

### CLMM range participation rule

A position earns trading fees only while current price is inside the configured range.

### Out-of-range exposure rule

When price leaves the range, the position becomes fully one-sided. For the Orca SOL/USDC example:

- above range -> all USDC
- below range -> all SOL

This is the direct protocol mechanic that makes CLMM V2’s exit logic meaningful.

### No auto-close rule

Out-of-range does not mean closed. The position remains open until the owner modifies or closes it. If price returns to range, earning can resume.

### Fee realization rule

Fees accrue over time but transfer to the wallet only through protocol-defined collection behavior. On Raydium, fees are transferred when liquidity is removed or when `decrease_liquidity` is called with zero liquidity.

### Exit sequencing rule

For CLMM V2, the guided exit sequence is:

1. remove liquidity
2. collect fees
3. swap resulting one-sided exposure into the policy target asset

The product may present this as one flow, but the domain must still model these as distinct steps.

### Product-directional rebalance rule

CLMM V2 preserves the following product policy:

- if breach is below lower bound, normalize resulting SOL exposure into USDC
- if breach is above upper bound, normalize resulting USDC exposure into SOL

This rule should be modeled explicitly as product policy, not inferred indirectly from token order.

### User-signature rule

Execution requires explicit user approval. Wallet connection may require a sign-message flow before transaction signing, but that does not authorize future autonomous exits.

### Notification timing rule

Detected breach time and delivered notification time are different facts. Delivery can lag or fail. Product logic must treat chain-observed breach state as authoritative, not the push arrival time.

### Preview integrity rule

Execution preview must disclose:

- breach side
- expected withdrawal amounts
- estimated fees collected
- expected swap output
- slippage / price impact caveats

Preview is operational guidance, not a guarantee.

### Transaction finality rule

A successful `sendTransaction` call only means the signed transaction was accepted by an RPC node for forwarding. It does **not** mean the exit executed successfully. Status reconciliation is mandatory.

### Expiration rule

Transaction attempts are blockhash-bound and can expire quickly. Preview, signature, send, retry, and status tracking must all account for `lastValidBlockHeight`.

### Ownership rule

Position control depends on current wallet ownership of the position record or NFT. If ownership changes, any stale execution intent is invalid.

## 3. Core Domain Invariants

### Invariant 1: Breach side determines product exit policy

CLMM V2 must preserve:

- **Downside breach below lower bound -> remove liquidity -> collect fees -> swap SOL to USDC**
- **Upside breach above upper bound -> remove liquidity -> collect fees -> swap USDC to SOL**

### Invariant 2: Breach evaluation is position-specific

A breach is evaluated against the specific position’s configured lower and upper bounds, not against generic pool volatility, recent candles, or another position in the same pool.

### Invariant 3: One wallet may hold multiple independent positions

Multiple positions in the same pool can exist with different ranges. The product must never collapse them into one logical position.

### Invariant 4: Remove-liquidity output and swap output are different facts

The tokens returned from liquidity removal are not the same as the tokens expected after the swap. The domain must model both separately.

### Invariant 5: Quote != executed result

All preview numbers are estimates bounded by slippage, price impact, route quality, timing, and landing conditions.

### Invariant 6: Submission != confirmation

Transaction lifecycle must include at least:

- prepared
- awaiting signature
- signed
- submitted
- confirmed / finalized / failed / expired / abandoned

### Invariant 7: Off-chain history is operational evidence, not on-chain attestation

Application history can be useful and auditable, but it is not a cryptographic proof subsystem.

### Invariant 8: Native SOL handling must be explicit

The product policy speaks in terms of SOL, but swap infrastructure may require wrapped SOL semantics. The domain must distinguish user-facing SOL from execution-layer token handling.

### Invariant 9: Position exit and NFT close are not identical

A position may have zero liquidity while its NFT or position record still exists. CLMM V2 must not confuse “capital exited” with “position artifact destroyed”.

## 4. Likely Edge Cases

### Price oscillates around the boundary

The position can rapidly flip between in-range and out-of-range. Without hysteresis or dedupe logic, the product may generate repeated alerts and conflicting execution intents.

### User opens the app after the position is already out of range

This is not a new breach, but the product still needs to surface an actionable exit state.

### Quote stales during review

Liquidity removal and swap outputs can drift between preview generation and user signature.

### Blockhash expires while the user is deciding

The user can approve a transaction that is already no longer sendable without refresh / rebuild.

### RPC or commitment mismatch

Observation, simulation, and sending through inconsistent RPC state can trigger false “blockhash not found”, stale preview, or mismatched status reconciliation.

### Multiple positions in the same pool

The user may receive an alert for one position while viewing another. Position identity must remain unambiguous.

### Partial removal exists at the protocol layer

The product wants a full exit assistant, but CLMM protocols support partial liquidity changes. Domain rules must explicitly disallow or separately model partial exits.

### Fee-only claim without exit

Protocols may support fee collection without full removal. The product must not accidentally treat a fee-only action as completed exit behavior.

### Position NFT retained after exit

The user may keep the NFT / position shell for re-entry into the same range later. Off-chain history should mark liquidity exited even if the position artifact persists.

### Position ownership changed

The position NFT may have been moved, sold, or burned since last observation. Any pending execution plan for the old owner becomes invalid.

### Reward tokens present

Some pools may include rewards in addition to trading fees. The product should decide whether rewards are previewed, ignored, or included in history.

### Insufficient SOL for fees or priority fees

Even if the position itself is valuable, the wallet may lack enough SOL to send the transaction.

### Swap route unavailable or unsafe

The LP exit can succeed while the follow-on swap cannot obtain an acceptable route or exceeds configured price impact / slippage thresholds.

### Wallet connection breaks on mobile

Because mobile signing often occurs inside an in-app browser, reconnect and session loss are real operational edge cases.

### Duplicate submission or retry ambiguity

The app may not know whether to retry, refresh, or reconcile an already-submitted signature. This is a common failure class if send and status logic are modeled weakly.

## 5. Risky Assumptions

### Assumption: token ordering can be used as business meaning

This is dangerous. `tokenA`, `tokenB`, “base”, “quote”, “risk asset”, and “defensive asset” are not automatically interchangeable. If modeled incorrectly, the swap direction can invert.

### Assumption: downside always means the same one-sided asset across every supported protocol and pair

For the Orca SOL/USDC example, below-range becomes SOL and above-range becomes USDC. That mapping must be validated per supported pool model and pair normalization.

### Assumption: all protocols combine removal and fee collection identically

They do not. Even when behavior is similar, the product should model protocol-specific execution semantics.

### Assumption: remove liquidity + swap is always one transaction

This is not guaranteed. The product should model a multi-step execution plan even if later optimization compresses it.

### Assumption: push notification arrival equals breach time

This is false. Notifications are delivery artifacts, not authoritative market-state timestamps.

### Assumption: send success means exit success

This is false on Solana. Submission and confirmation are distinct lifecycle stages.

### Assumption: users will sign quickly enough for ephemeral transactions

This is risky in mobile contexts, especially when wallets require context switching or app/browser handoff.

### Assumption: a swap route will always exist with acceptable quality

This may fail because of liquidity fragmentation, price impact, or routing restrictions.

### Assumption: off-chain history can be lightweight without structured provenance

If the history lacks quote context, timestamps, signatures, and state transitions, it will be unhelpful in support, debugging, or dispute resolution.

### Assumption: the product only needs “current price”

Actually it needs a coherent observation model:

- which source
- at what slot
- at what commitment
- compared against which normalized range

Without that, breaches and previews can be inconsistent.

## 6. Concepts That Must Exist In The Eventual Domain Model

### WalletIdentity

The connected wallet that owns or is expected to sign for the position.

### WalletSession

The current connection state, mobile/browser context, and signing availability.

### PositionRef

A stable identifier for the monitored LP position, including protocol, pool, and position NFT / mint / account reference.

### PoolRef

Token pair, protocol, fee tier, and any protocol-specific identifiers needed for monitoring and exit.

### RangeDefinition

Lower bound, upper bound, tick indexes if relevant, and the pool’s price convention.

### PriceObservation

Observed pool price, source, slot, commitment, and timestamp.

### BreachState

At minimum:

- in_range
- below_lower_bound
- above_upper_bound

### ExposureState

The expected token composition at the current price, including whether the position is one-sided and which asset dominates.

### ExitPolicy

The CLMM V2 policy layer that maps breach side to target post-exit asset.

### LiquidityExitQuote

Estimated withdrawal amounts, fees, rewards, slippage assumptions, quote timestamp, and source slot.

### SwapQuote

Input token, output token, amount, route plan, slippage basis points, price impact, context slot, and expiry sensitivity.

### ExecutionPlan

The concrete ordered steps:

- remove liquidity
- collect fees / rewards
- perform swap
- optionally close / keep position NFT artifact

### SigningRequest

The exact user approval prompt for each signable action.

### TransactionAttempt

Serialized transaction payload or equivalent metadata, blockhash, lastValidBlockHeight, submission metadata, and retry lineage.

### TransactionStatus

Observed confirmation state, error state, expiration state, and relevant timestamps.

### NotificationEvent

Detection timestamp, channel, delivery timestamp, and dedupe key.

### ExecutionRecord

The off-chain audit object linking breach, preview, user approval, transaction attempts, and final outcome.

### ReconciliationResult

Post-send verification that checks whether the intended state change actually happened on-chain.

### NativeAssetNormalization

A domain concept for presenting SOL to the user while handling wrapped SOL or associated token account behavior internally.

## 7. Anything That Would Break The Product If Modeled Incorrectly

### Breaker 1: Wrong breach-side to swap-direction mapping

If the system reverses the mapping, the product will execute the wrong rebalance and betray its core promise.

### Breaker 2: Confusing token order with business asset role

If `tokenA/tokenB` are used directly as “risk asset / defensive asset”, the model will eventually fail on a real pool.

### Breaker 3: Treating alert delivery as authoritative

If alert delivery time drives business logic, the product will mis-sequence exits and produce misleading history.

### Breaker 4: Treating preview outputs as guaranteed

This will create false trust, incorrect history, and support failures when actual withdrawal or swap outputs differ.

### Breaker 5: Treating send success as completion

This will cause false-positive success history and possible duplicate or conflicting retries.

### Breaker 6: Ignoring blockhash expiry

The product will generate unusable signing experiences and ambiguous failed states.

### Breaker 7: Collapsing multi-step execution into a single opaque “exit”

If remove, collect, and swap are not modeled distinctly, the system cannot explain partial failure correctly.

### Breaker 8: Failing to distinguish liquidity exit from NFT closure

The system may report a position as closed when only liquidity was removed, or vice versa.

### Breaker 9: Not modeling multiple positions independently

The user may sign an exit for the wrong range or wrong position.

### Breaker 10: Not storing enough off-chain provenance

Without breach-side, quote snapshot, tx signatures, timestamps, and status transitions, the product will be impossible to support and hard to trust.

### Breaker 11: Ignoring mobile wallet context

If the model assumes desktop-style continuous connectivity, the signing workflow will be brittle in the actual usage environment.

### Breaker 12: Ignoring native SOL execution nuances

If user-facing SOL and execution-layer wrapped SOL are conflated, balances, approvals, and resulting history can become inconsistent.

## Recommended Domain Modeling Principle

Model CLMM V2 around **three separate but linked state machines**:

1. **Position state**  
   In-range / below / above / exited / re-entered

2. **Execution state**  
   Previewed / awaiting signature / submitted / confirmed / failed / expired / abandoned

3. **Notification state**  
   Detected / queued / delivered / acknowledged / deduped

This separation is the safest way to preserve domain truth while still shipping a narrow product.

## Source Notes

Primary sources used:

- Orca narrow vs wide liquidity ranges: https://docs.orca.so/liquidity/concepts/liquidity-ranges
- Orca alerts: https://docs.orca.so/liquidity/manage/alerts
- Orca harvest: https://docs.orca.so/liquidity/manage/harvest
- Orca close position: https://docs.orca.so/liquidity/manage/close
- Orca SDK close position: https://docs.orca.so/developers/sdks/positions/close-position
- Orca SDK adjust liquidity: https://docs.orca.so/developers/sdks/positions/adjust-liquidity
- Orca SDK monitor positions: https://docs.orca.so/developers/sdks/positions/monitor-positions
- Raydium CLMM concentrated liquidity docs: https://docs.raydium.io/raydium/for-liquidity-providers/pool-types/clmm-concentrated
- Jupiter swap quote docs: https://dev.jup.ag/docs/swap/v1/get-quote
- Jupiter swap instructions API reference: https://dev.jup.ag/api-reference/swap/v1/swap-instructions
- Phantom app connection guidance: https://help.phantom.com/hc/en-us/articles/29995498642195-Connect-Phantom-to-an-app-or-site
- Solflare mobile dApp connection guidance: https://help.solflare.com/en/articles/6176657-how-to-connect-to-dapps-using-solflare-mobile
- Solana `sendTransaction`: https://solana.com/docs/rpc/http/sendtransaction
- Solana `getLatestBlockhash`: https://solana.com/docs/rpc/http/getlatestblockhash
- Solana transaction confirmation and expiration guide: https://solana.com/uk/developers/guides/advanced/confirmation
- Solana production readiness guidance: https://solana.com/docs/payments/production-readiness

Design inferences in this document:

- recommended off-chain audit fields
- suggested state-machine separation
- explicit CLMM V2 domain-model concepts

Those inferences are based on the transaction lifecycle and trust expectations described in the sources above.
