# Domain Model

## Glossary

| Term                         | Meaning                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| LowerBoundBreach             | Price moved below the position's lower range boundary                              |
| UpperBoundBreach             | Price moved above the position's upper range boundary                              |
| ExitTrigger                  | Confirmed actionable record after confirmation policy passes                       |
| ExecutionPlan                | Ordered sequence: remove liquidity -> collect fees -> directional swap             |
| ExecutionPreview             | Signable snapshot with freshness, estimates, and visible direction                 |
| ExecutionAttempt             | One user-approved execution flow                                                   |
| Partial                      | Execution state where one or more chain steps confirmed but sequence is incomplete |
| HistoryTimeline              | Append-only off-chain operational event log                                        |
| ConfirmationPolicy           | Fixed MVP rules that must pass before an observation becomes a trigger             |
| BreachEpisode                | Continuous out-of-range period for a position and direction                        |
| DirectionalExitPolicyService | Domain service encoding the mandatory exit mapping                                 |

## Value Objects

```ts
type BreachDirection = { kind: 'lower-bound-breach' } | { kind: 'upper-bound-breach' };

type PostExitAssetPosture = { kind: 'exit-to-usdc' } | { kind: 'exit-to-sol' };

type SwapInstruction = {
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  policyReason: string;
  amountBasis: TokenAmount;
};

type ExecutionStep = RemoveLiquidity | CollectFees | SwapAssets;

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

## Critical Mapping Law

```text
lower-bound-breach -> exit-to-usdc + SwapInstruction(SOL -> USDC)
upper-bound-breach -> exit-to-sol  + SwapInstruction(USDC -> SOL)
```

## Domain Services

| Service                        | Responsibility                                                           |
| ------------------------------ | ------------------------------------------------------------------------ |
| `DirectionalExitPolicyService` | Maps breach direction to posture, swap direction, and execution skeleton |
| `TriggerQualificationService`  | Applies confirmation rules and breach-episode idempotency                |
| `ExecutionPlanFactory`         | Builds `ExecutionPlan` from position, trigger, and policy output         |
| `PreviewFreshnessPolicy`       | Determines fresh, stale, or expired preview state                        |
| `RetryBoundaryPolicy`          | Determines retry eligibility from partial completion and lifecycle state |
| `ExecutionStateReducer`        | Reduces execution events into the authoritative lifecycle state          |

Time, IDs, network reads, and persistence enter only through application-layer ports.

## Execution State Machine

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

## Regime Engine Integration & Execution-Origin Model

### Execution-Origin Model

Every execution preview and attempt carries an explicit `ExecutionOrigin`:

- `qualified-breach`: Triggered by deterministic breach qualification.
- `regime-plan`: Triggered by advisory Regime Engine plan response.

### Audit Loop Closure

Every plan request that results in a received plan must close the audit loop by persisting and delivering a terminal execution result (`SUCCESS`, `FAILED`, `USER_DECLINED`, `EXPIRED`, or `ABANDONED`) exactly once.

### Breach Precedence Invariant

Deterministic qualified breach triggers outrank advisory regime plans. When a qualified breach trigger exists, any incoming or requested plan is superseded in favor of the actionable breach workflow.
