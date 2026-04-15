# Product Scope

## What This Product Is

CLMM V2 is a mobile-first, non-custodial LP exit assistant for supported Solana Orca CLMM positions.
It detects when a supported position goes out of range, explains the directional exposure, prepares the correct unwind path, and executes only after explicit user signature.

This is not a generalized DeFi control panel, wallet, or analytics product.

## Core Product Invariant

Incorrect directional mapping is release-blocking:

```text
LowerBoundBreach -> RemoveLiquidity -> CollectFees -> Swap SOL->USDC -> ExitToUSDC posture
UpperBoundBreach -> RemoveLiquidity -> CollectFees -> Swap USDC->SOL -> ExitToSOL posture
```

The mapping lives only in `packages/domain/src/exit-policy/DirectionalExitPolicyService`.

## Non-Custodial Invariants

- Backend never stores wallet private keys, seeds, or signing authority.
- Backend never initiates execution without an explicit user-signed transaction.
- Backend never implies custody or guaranteed execution outcome.
- Any feature requiring backend signing authority is out of scope for MVP.

## What This Product Is Not

Stop and flag any request moving toward:

- Portfolio analytics, yield dashboards, or performance history
- Generic wallet features like arbitrary transfer, staking, or generic swaps
- Autonomous, scheduled, or delegated execution
- Multi-chain support
- Multi-CLMM protocol support beyond Orca for MVP
- On-chain receipts, attestations, proofs, or claim verification
- Social features, copy trading, or strategy marketplaces
