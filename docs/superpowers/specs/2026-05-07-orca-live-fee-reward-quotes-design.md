# Orca Live Fee And Reward Quotes Design

## Goal

Fix issue #61 by stopping the detail and insights read paths from exposing Orca checkpointed fee and reward account fields as if they were current unclaimed values.

The fix computes live fee and reward quotes for position detail reads using Orca's direct quote path. If live quote computation cannot complete, the detail read fails closed for that request. It must not fall back to stale `feeOwedA`, `feeOwedB`, or `rewardInfos[].amountOwed` values from the Orca position account.

## Scope

In scope:

- Add a reusable adapter-local live quote helper.
- Wire the helper only into `SolanaPositionSnapshotReader.fetchPositionDetail`.
- Preserve the existing domain-facing `PositionFees` shape.
- Preserve existing application DTOs and HTTP contracts.
- Add structured observability for quote computation failures.
- Add focused adapter and existing endpoint behavior tests.

Out of scope:

- Redesigning `listSupportedPositions`.
- Adding fee or reward data to summary DTOs.
- Changing list-card API contracts.
- Introducing partial detail responses or `feeQuoteStatus`.
- Using `harvestPositionInstructions` or harvest instruction generation for this read path.

## Current Problem

`packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts` currently maps raw Orca position account fields into returned `PositionFees`:

```ts
feeOwedA: pos.feeOwedA,
feeOwedB: pos.feeOwedB,
```

It also maps `pos.rewardInfos[].amountOwed` into reward entries. These fields are checkpointed on-chain values. They only reflect fees and rewards recorded during the last position-modifying interaction or fee/reward update. Between interactions they can remain zero even when the Orca app shows pending fees or rewards.

The affected read path feeds:

- `GET /positions/:walletId/:positionId`
- `GET /insights/sol-usdc/positions/:walletId`
- `GET /insights/sol-usdc/bundle/:walletId`

## Architecture

Keep the fix entirely in `packages/adapters`.

`packages/domain` continues to own only the existing `PositionFees` shape. `packages/application` continues to consume `PositionDetail` without knowing how Orca live fee/reward quotes are computed.

Add a small adapter-local helper near the existing Solana position reader:

```text
packages/adapters/src/outbound/solana-position-reads/OrcaPositionFeeRewardQuoteHelper.ts
```

The helper accepts the RPC client plus already-fetched Orca position and whirlpool data. It derives and fetches the lower and upper tick data required by Orca's quote utilities, calls the direct fee and reward quote path, and maps successful output into the existing domain-facing `PositionFees` shape.

`SolanaPositionSnapshotReader.fetchPositionDetail` delegates fee/reward computation to this helper. It may still fetch and pass the Orca position account, but it must no longer map raw checkpointed `pos.feeOwedA`, `pos.feeOwedB`, or `pos.rewardInfos[].amountOwed` into returned detail data.

`listSupportedPositions`, summary DTOs, and list-card contracts remain unchanged.

Quote failure fails closed. The helper returns an explicit result union. On unavailable quote computation, the detail read path logs structured context and returns unavailable/null through the existing contract. It must not fall back to stale Orca account owed fields.

Composition changes are limited to giving the detail read path a lightweight logger/observability dependency, preferably by passing the existing `ObservabilityPort` from the adapter composition layer. No domain/application DTO contract changes are introduced in this issue.

## Components And Data Flow

The helper exposes one method with this result union:

```ts
type FeeRewardQuoteResult =
  | { kind: 'ok'; fees: PositionFees }
  | {
      kind: 'unavailable';
      reason:
        | 'tick-array-fetch-failed'
        | 'tick-data-missing'
        | 'fee-quote-failed'
        | 'reward-quote-failed';
      errorName?: string;
      errorMessage?: string;
    };
```

`fetchPositionDetail` flow becomes:

1. Fetch position PDA/account and verify wallet ownership.
2. Fetch whirlpool account and build `PoolData` as it does today.
3. Call `OrcaPositionFeeRewardQuoteHelper.quote({ rpc, position: pos, positionMint, whirlpool: w, whirlpoolAddress })`.
4. If `ok`, use `fees` in the returned `PositionDetail`.
5. If `unavailable`, log a structured warning from the caller with `positionId`, `walletId`, `poolId`, `lowerTick`, `upperTick`, `tickSpacing`, `reason`, and sanitized `errorName`/`errorMessage` if available, then return `null`.

The helper owns all Orca-specific quote plumbing:

- tick-array address derivation
- lower/upper tick extraction
- `collectFeesQuote`
- `collectRewardsQuote`
- conversion of reward quote entries into `PositionRewardInfo[]` using pool reward mints and `KNOWN_TOKENS` decimals

Inactive or empty reward mints preserve the existing empty-mint/null-decimals behavior and must not create fake reward entries.

No raw checkpointed `pos.feeOwedA`, `pos.feeOwedB`, or `pos.rewardInfos[].amountOwed` values are mapped into returned `PositionFees`.

## Error Handling And Observability

Fail closed is the behavioral rule. Any inability to compute the live quote makes the detail unavailable for that read, even if the raw Orca position account has checkpointed values.

The helper catches expected quote plumbing failures and classifies them into the result-union reasons. Unexpected Orca/RPC/SDK errors inside the quote helper are also classified as `unavailable`; they do not fall through to stale field mapping.

The helper should avoid logging itself unless there is a strong local reason. The caller has the request context and emits the operational log once.

The structured warning uses the existing `ObservabilityPort.log('warn', ...)` path with this stable event name:

```text
orca_position_fee_reward_quote_unavailable
```

The log context should include:

- `positionId`
- `walletId`
- `poolId`
- `lowerTick`
- `upperTick`
- `tickSpacing`
- `reason`
- `errorName`, if available
- sanitized, length-capped `errorMessage`, if available

Do not log raw RPC responses, SDK response blobs, account data, or full error objects.

Existing endpoint behavior remains:

- `/positions/:walletId/:positionId`: quote failure currently flows through the existing `null` contract and is returned as 404. This is a known semantic compromise to avoid widening the contract in this issue. Operational logs must distinguish quote failure from true position absence.
- `/insights/sol-usdc/positions/:walletId` and `/insights/sol-usdc/bundle/:walletId`: position detail unavailable maps to the existing 503 `position_detail_unavailable`.

This issue does not introduce `feeQuoteStatus`, partial detail responses, or a new HTTP status contract. That belongs in a later API-contract issue.

## Testing

Testing stays narrow and mostly adapter-level. No live Orca or Solana RPC calls in tests.

Required tests:

- quote helper returns `ok` with `PositionFees` built from mocked `collectFeesQuote` and `collectRewardsQuote`
- quote helper returns `unavailable` for tick-array fetch failure
- quote helper returns `unavailable` for missing lower or upper tick data
- quote helper returns `unavailable` for fee quote failure
- quote helper returns `unavailable` for reward quote failure
- quote helper preserves inactive/empty reward mints without fake reward entries
- `fetchPositionDetail` returns `null` when the helper returns `unavailable`
- raw checkpointed Orca `pos.feeOwedA`, `pos.feeOwedB`, and `pos.rewardInfos[].amountOwed` are not used as fallback when quote fails
- caller emits exactly one `orca_position_fee_reward_quote_unavailable` warning with identifiers, reason, and capped sanitized error fields
- insights positions and bundle preserve existing 503 `position_detail_unavailable` behavior when detail is unavailable

Suggested verification:

- `pnpm --filter @clmm/adapters test`
- `pnpm --filter @clmm/application test`
- `pnpm --filter @clmm/adapters typecheck`
- `pnpm typecheck` if implementation touches shared exported types or composition in a way that broadens risk

## References

- GitHub issue: `https://github.com/opsclawd/clmm-v2/issues/61`
- Orca harvest docs: `https://github.com/orca-so/whirlpools/blob/main/docs/whirlpool/docs/03-SDKs/04-Position%20Management/03-Harvest.mdx`
- Orca Whirlpools SDK README: `https://github.com/orca-so/whirlpools/blob/main/ts-sdk/whirlpool/README.md`
