## Comment by opsclawd

## Current state vs. desired future state

After reviewing the current `clmm-v2` and `regime-engine` integration, this issue should be deferred rather than implemented as written.

### Current state

Today, `regime-engine` is integrated with `clmm-v2` in two limited ways:

1. **Read-only market/advisory context**
   - `clmm-v2` reads general SOL/USDC market context from regime-engine:
     - `/v1/regime/current`
     - S/R levels / theses
     - PolicyInsights
   - These are pool/feed/pair-level insights, not position-specific instructions.
   - `/v1/regime/current` returns regime, telemetry, CLMM suitability, freshness, and reasons. It does not know a user's LP position ID, range bounds, range state, position value, fees, inventory skew, or distance to range edges.

2. **Async breach execution event reporting**
   - `clmm-v2` already posts terminal breach-exit results to regime-engine via `/v1/clmm-execution-result`.
   - That existing path reports what happened after `clmm-v2` executes/reconciles a breach-driven exit.
   - This should remain separate from the plan/execution-result lifecycle described in this issue.

The important limitation: `clmm-v2` currently supports a breach-driven exit execution model. Its execution domain is built around remove-liquidity, collect-fees, and swap-assets. It does not yet support opening new CLMM positions, adding liquidity, or full rebalance execution.

### Problem with implementing this issue as written

This issue currently treats regime-engine's plan actions as if `clmm-v2` can execute all of them:

- `REQUEST_ENTER_CLMM`
- `REQUEST_EXIT_CLMM`
- `REQUEST_REBALANCE`
- `HOLD`
- `STAND_DOWN`

That is not true yet.

`REQUEST_EXIT_CLMM`, `HOLD`, and `STAND_DOWN` are compatible with the current product direction, assuming exit maps cleanly to the existing preview/sign/submit flow.

`REQUEST_ENTER_CLMM` and `REQUEST_REBALANCE` are not simple integration work. They require new product and execution capabilities:

- position/range selection
- open-position transaction support
- add-liquidity support
- rebalance semantics
- mixed allocation handling
- additional safety checks
- UX for deploying or reshaping liquidity

Implementing the issue as-is would create a control loop where regime-engine can emit commands that `clmm-v2` cannot honestly execute. That would make the architecture look more advanced while making the product less precise and harder to reason about.

### Desired future state

The cleaner target architecture should be:

- `GET /v1/regime/current`
  - General market/feed-level insight.
  - No wallet state.
  - No position-specific action.
  - Used for market context and advisory display.

- `POST /v1/plan`
  - Position-aware actionable recommendation.
  - Receives the active CLMM position state from `clmm-v2`, including at minimum:
    - `positionId`
    - `poolAddress`
    - lower/upper bound prices
    - current price
    - range state
    - distance to bounds
    - position value/liquidity
    - fees or fee estimate
    - inventory skew if available
    - cooldown/stand-down/stopout state
  - Returns a scoped recommendation, e.g.:
    - `HOLD`
    - `STAND_DOWN`
    - `REQUEST_EXIT_CLMM` for a specific position
  - Should not return `REQUEST_ENTER_CLMM` or `REQUEST_REBALANCE` until `clmm-v2` actually supports those execution paths.

- `POST /v1/execution-result`
  - Audit closure for every returned plan.
  - Records whether `clmm-v2` executed, failed, skipped, or acknowledged the recommendation.

In this model, regime-engine becomes a position-aware recommendation engine, while `clmm-v2` remains the execution authority and wallet-signing safety gate.

### Recommendation

Defer this issue until regime-engine has a position-scoped plan contract.

A better follow-up decomposition would be:

1. **Regime-engine:** update `/v1/plan` or add a new position-plan endpoint that accepts active CLMM position state and returns position-scoped recommendations.
2. **Regime-engine:** initially restrict supported actions to `HOLD`, `STAND_DOWN`, and `REQUEST_EXIT_CLMM`.
3. **clmm-v2:** display the recommendation on the Position Detail page, not as a generic list-level command.
4. **clmm-v2:** wire `REQUEST_EXIT_CLMM` into the existing preview/sign/submit/reconcile flow.
5. **clmm-v2:** always post `/v1/execution-result` with `SUCCESS`, `FAILED`, or `SKIPPED`.
6. **Future:** add `REQUEST_ENTER_CLMM` and `REQUEST_REBALANCE` only after `clmm-v2` supports open-position/add-liquidity/rebalance execution honestly.

Until then, the current architecture is safer and more accurate: regime-engine provides market intelligence and records breach execution events; `clmm-v2` owns position-specific validation, execution preparation, user signing, transaction submission, and reconciliation.
