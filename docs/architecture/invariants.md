# Domain Invariants

## Directional Exit Policy

This rule is non-negotiable and release blocking:

```text
lower-bound-breach -> exit-to-usdc + SwapInstruction(SOL -> USDC)
upper-bound-breach -> exit-to-sol  + SwapInstruction(USDC -> SOL)
```

This mapping lives only in `packages/domain/src/exit-policy/DirectionalExitPolicyService`.
It must not be re-derived in adapters, UI, or any other layer.

## Core Domain Types

```ts
type BreachDirection =
  | { kind: 'lower-bound-breach' }
  | { kind: 'upper-bound-breach' };

type PostExitAssetPosture =
  | { kind: 'exit-to-usdc' }
  | { kind: 'exit-to-sol' };

type ExecutionLifecycleState =
  | { kind: 'previewed' }
  | { kind: 'awaiting-signature' }
  | { kind: 'submitted' }
  | { kind: 'confirmed' }
  | { kind: 'failed' }
  | { kind: 'expired' }
  | { kind: 'abandoned' }
  | { kind: 'partial' };
```

## Execution State Machine

Valid transitions:

```text
previewed          -> awaiting-signature
awaiting-signature -> submitted | abandoned | expired
submitted          -> confirmed | failed | partial
failed             -> previewed  (only if no chain step confirmed)
expired            -> previewed  (only if no chain step confirmed)
partial            -> no transitions
confirmed          -> no transitions
abandoned          -> no transitions
```

Forbidden:

- `partial -> previewed`
- `partial -> submitted`

## Layer Ownership

- `packages/domain`: entities, value objects, pure policies, lifecycle reducers
- `packages/application`: use cases and port-driven orchestration
- `packages/adapters`: SDK, storage, HTTP, background job, and platform implementations
- `packages/ui`: view-models, presenters, screens, and components
- `apps/app`: Expo shell and platform bootstrap only

## Non-Custodial Invariants

- Backend never stores wallet private keys, seeds, or signing authority.
- Backend never executes without an explicit user signature.
- Backend must not imply guaranteed execution or custody.
- Features requiring backend signing authority are out of scope.

## State Ownership

- Position snapshots: backend read model
- Range observations and breach episodes: backend worker state
- Actionable triggers: Postgres shared by mobile and web
- Preview freshness and estimates: backend-authored, client-cached
- Execution attempts and awaiting-signature sessions: backend-authored and resumable
- Terminal lifecycle state: reconciliation projection
- Execution history timeline: off-chain operational storage
- Private keys and signature authority: wallet only
