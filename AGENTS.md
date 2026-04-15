# CLMM V2 Agent Instructions

## Product Scope

CLMM V2 is a mobile-first, non-custodial LP exit assistant for supported Solana Orca CLMM positions.
It detects supported positions that move out of range, explains the directional exposure, prepares the correct unwind path, and executes only after explicit user signature.

This is not a general wallet, analytics dashboard, autonomous trading system, or multi-protocol DeFi control panel.

## Release-Blocker Invariant

Incorrect directional mapping is critical severity. Do not abstract, generalize, or re-derive this from token order:

```text
LowerBoundBreach -> RemoveLiquidity -> CollectFees -> Swap SOL->USDC -> ExitToUSDC posture
UpperBoundBreach -> RemoveLiquidity -> CollectFees -> Swap USDC->SOL -> ExitToSOL posture
```

This mapping lives only in `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
It must not be re-derived in adapters, UI, or anywhere outside the domain layer.
If you are uncertain about direction, stop and ask. Do not infer.

## Hard Repo Boundaries

- `packages/domain` depends only on itself and contains pure business logic.
- `packages/application` may depend only on `packages/domain` and application port contracts.
- `packages/adapters` implements ports and isolates external SDKs.
- `packages/ui` may depend only on `packages/application/public` and its own UI code.
- `apps/app` is an Expo shell and must not own screens or business logic.
- `packages/testing` uses package public APIs only; no deep imports into private internals.

Forbidden:

- `packages/domain` importing any external SDK or framework
- `packages/application` importing adapters, Solana SDKs, React, React Native, browser APIs, or Expo APIs
- `packages/ui` importing adapters, storage SDKs, or Solana SDKs
- `apps/app` importing `packages/adapters` directly except the approved composition bootstrap
- Any implementation using `@solana/web3.js` `Connection`, `PublicKey`, or `Transaction`
- Any package introducing on-chain receipt, attestation, proof, or claim-verification concepts

## Solana Rules

- Use `@solana/kit` for Solana implementation logic.
- `@solana/web3.js` v1 exists only for mobile wallet adapter type compatibility.
- Before writing adapter code that touches Orca, Jupiter, `@solana/kit`, MWA, wallet adapter, or Expo platform APIs, use `context7` or current official docs first.
- Detailed adapter and library guidance lives in `docs/adapter-rules.md`.

## Fresh Worktree Bootstrap

Agents regularly start in fresh worktrees where dependencies or build outputs are missing. Do not assume the workspace is ready.

Before deeper investigation in a fresh worktree:

1. Check whether root `node_modules` is present.
2. If dependencies are missing, run `pnpm install --frozen-lockfile`.
3. If package `dist/` outputs or workspace builds are missing, run `pnpm build`.
4. When in doubt, run `pnpm bootstrap` from the repo root.

## Validation Expectations

Before claiming substantial work is complete, run the narrowest relevant checks and then the repo-level checks when the change is broad:

- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm boundaries`
- `pnpm test`

## Compound Engineering

- This repo accumulates reusable engineering knowledge over time using Compound Engineering.
- Before starting new implementation or debugging work, check `docs/solutions/` for existing learnings relevant to the task.
- After completing a story or bugfix, capture durable learnings with Compound Engineering when the work produced reusable insight.
- Use `/ce:compound` for patterns, pitfalls, debugging discoveries, architectural constraints, or process improvements that should help future sessions.
- If there is no durable learning worth preserving, say so explicitly instead of creating low-signal notes.
- Supporting guidance lives in `docs/compound-engineering.md`.

## What To Read Next

- Setup and worktree bootstrap: `README.md`, `docs/setup.md`
- Compound workflow expectations: `docs/compound-engineering.md`
- Product definition and out-of-scope requests: `docs/product-scope.md`
- Architecture overview: `docs/architecture.md`
- Domain invariants and lifecycle rules: `docs/architecture/invariants.md`, `docs/architecture/domain-model.md`
- Repo structure, ports, and state ownership: `docs/architecture/repo-map.md`
- Implementation order and sequencing rules: `docs/architecture/implementation-sequence.md`
- Release verification checklist: `docs/architecture/release-checklist.md`

## When In Doubt

1. Choose narrower implementation over generalized abstraction.
2. Preserve the directional invariant over convenience or DRY.
3. Keep business logic in `packages/domain` and orchestration in `packages/application`.
4. Surface stale or uncertain state instead of silently proceeding.
5. Ask before making an architectural move not covered by the architecture docs.
