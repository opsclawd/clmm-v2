# Design: Solana Read Path — Fix Query Shapes, Batch Whirlpool Fetches

**Date:** 2026-04-13
**Status:** Draft

---

## Problem

The Solana position read path has three structural defects that compound into excessive on-chain I/O:

1. **`getPosition()` triggers a full wallet scan.** `OrcaPositionReadAdapter.getPosition(walletId, positionId)` calls `listSupportedPositions(walletId)` and filters the result in memory. A single position detail request causes `fetchPositionsForOwner` (1 RPC call) plus a sequential `fetchWhirlpool` for every position the wallet owns (N RPC calls). For a wallet with 5 positions, that is 6 RPC calls to read one position.

2. **`listActionableTriggers()` re-reads on-chain positions.** `OperationalStorageAdapter.listActionableTriggers(walletId)` calls `positionReadPort.listSupportedPositions(walletId)` just to derive the wallet's current position IDs before querying trigger rows. This is wasted chain I/O because the database already tracks wallet-position ownership in the `wallet_position_ownership` table.

3. **`listSupportedPositions()` fetches whirlpools sequentially.** After `fetchPositionsForOwner` returns all positions, the adapter fetches each position's whirlpool one at a time in a nested loop. Positions that share a whirlpool (common for concentrated liquidity) result in duplicate fetches. This is the hot path for wallet-wide scans and scales as O(N) sequential RPC calls.

A single user flow — list positions, view position detail, list alerts — can hit Solana 3+ times for the same wallet with redundant sequential fetches. For a free-tier RPC target, this is expensive in both request count and latency.

## Goals

- Eliminate the full-wallet rescan from `getPosition()` — a single position detail should cost 2-3 RPC calls (position + whirlpool + ownership verification if needed), not 1+N.
- Eliminate on-chain reads from `listActionableTriggers()` — trigger listing should be a pure database operation.
- Reduce the wallet-wide scan from O(N) sequential whirlpool fetches to O(unique pools) batched fetches.
- Extract a shared server-side position snapshot reader to eliminate duplicated position-reading logic between `OrcaPositionReadAdapter` and `SolanaExecutionPreparationAdapter`.
- Preserve wallet-ownership verification in the direct single-position path.

## Non-Goals

- Adding a general-purpose position cache or memoization layer (that is a potential follow-on optimization, not the primary fix).
- Changing the `SupportedPositionReadPort` interface contract.
- Modifying the domain types for `LiquidityPosition`.
- Changing the execution preparation flow beyond consuming the shared reader.

---

## Design

### New Shared Module: `SolanaPositionSnapshotReader`

**Location:** `packages/adapters/src/outbound/solana-position-reads/SolanaPositionSnapshotReader.ts`

This is a stateless, server-side read primitive. It is not an adapter — it does not implement a port. It is a building block that adapters consume. It has two responsibilities:

#### 1. `fetchSinglePosition(rpc, positionId, walletId): Promise<LiquidityPosition | null>`

Direct single-position fetch that:

1. Derives the position PDA from `positionId` (the mint) via `getPositionAddress(positionMint)` — this is a derivation, no RPC.
2. Fetches the position account via `fetchPosition(rpc, positionAddress)` — 1 RPC call.
3. **Verifies ownership:** confirms that the position is owned by the provided `walletId`. For Orca Whirlpool positions, ownership is determined by who holds the position mint NFT. The implementation must verify that the token account for the position mint is owned by `walletId` (e.g., by checking the associated token account or using the SDK's ownership data). This is critical because the current `getPosition()` implicitly verifies ownership by filtering results from an owner-scoped `fetchPositionsForOwner()` call. The new direct-fetch path must not accidentally return a position the wallet does not own. If ownership cannot be confirmed, returns `null`.
4. Fetches the whirlpool for the position via `fetchWhirlpool(rpc, whirlpoolAddress)` — 1 RPC call.
5. Derives bounds and range state using the domain's `evaluateRangeState()`.
6. Returns a `LiquidityPosition` with the real `walletId`.

Total cost: 2-3 RPC calls depending on ownership verification strategy (see Ownership Verification below).

Returns `null` on: position not found, whirlpool fetch failure, or ownership mismatch.

#### Ownership Verification Strategy

The current `getPosition()` implicitly verifies ownership because it calls `fetchPositionsForOwner(ownerAddress)` and only returns positions from that owner-scoped result. The new direct-fetch path bypasses that owner-scoped scan, so it must verify ownership explicitly.

For Orca Whirlpool positions, ownership is determined by who holds the position mint NFT. The implementation must confirm that the wallet holds the position mint token. There are several possible mechanisms:

1. **ATA lookup (likely 1 additional RPC call):** Derive the wallet's associated token account (ATA) for the position mint, fetch it, and verify it exists with a non-zero balance. This is the most straightforward approach but adds a third RPC call.
2. **SDK helper:** If the `@orca-so/whirlpools` or `@orca-so/whirlpools-client` SDK exposes an ownership check that uses data already available from the `fetchPosition` call (e.g., if the position account stores an authority or the SDK bundles token account data), this may avoid the extra call.
3. **`getTokenAccountsByOwner` filter:** Query the wallet's token accounts filtered by the position mint. This also costs 1 RPC call but is more general.

The implementation plan must investigate which mechanism is available and lock in the exact cost. The spec intentionally does not hardcode "2 RPC calls" because the ownership verification strategy may require a third. The upper bound is 3 RPC calls, which is still a massive improvement over the current 1+N.

#### 2. `fetchWhirlpoolsBatched(rpc, whirlpoolAddresses): Promise<Map<string, WhirlpoolData>>`

Batched whirlpool fetcher that:

1. Deduplicates the input addresses.
2. Fetches all unique whirlpools with bounded concurrency (e.g., `Promise.all` over chunks, or `getMultipleAccounts` if available via the SDK).
3. Returns a `Map<string, WhirlpoolData>` keyed by address string.
4. Whirlpools that fail to fetch are omitted from the map (matching current skip-on-failure behavior).

### Consumer Changes

#### `OrcaPositionReadAdapter.getPosition(walletId, positionId)`

**Before:** Calls `this.listSupportedPositions(walletId)` then filters by `positionId`. Cost: 1 + N RPC calls.

**After:** Calls `SolanaPositionSnapshotReader.fetchSinglePosition(rpc, positionId, walletId)`. Cost: 2-3 RPC calls (position + whirlpool + ownership verification if needed). Ownership is explicitly verified inside `fetchSinglePosition`.

#### `OrcaPositionReadAdapter.listSupportedPositions(walletId)`

**Before:** Calls `fetchPositionsForOwner`, then for each position entry, calls `fetchWhirlpool` sequentially in a nested loop. Cost: 1 + N sequential RPC calls.

**After:**

1. Calls `fetchPositionsForOwner(rpc, ownerAddress)` — 1 RPC call.
2. Extracts all owned position entries (same logic as current `getOwnedPositionEntries`).
3. Collects unique whirlpool addresses from all entries.
4. Calls `SolanaPositionSnapshotReader.fetchWhirlpoolsBatched(rpc, uniqueAddresses)` — 1 batched call.
5. Iterates position entries, looks up whirlpool data from the map, builds `LiquidityPosition[]`. Positions whose whirlpool is missing from the map are skipped.

Cost: 1 + ceil(uniquePools / batchSize) RPC calls. For a wallet with 5 positions across 2 pools, that is 2 RPC calls instead of 6.

#### `OperationalStorageAdapter.listActionableTriggers(walletId)`

**Before:** Calls `this.positionReadPort.listSupportedPositions(walletId)` to derive position IDs, then queries `exit_triggers`. Cost: 1 + N RPC calls + 1 DB query.

**After:**

1. Queries `wallet_position_ownership WHERE walletId = ?` — 1 DB query.
2. Extracts `positionId[]` from the rows.
3. Queries `exit_triggers` joined with `breach_episodes` where `positionId IN (...)` and `episode.status = 'open'` — 1 DB query.

Cost: 0 RPC calls, 2 DB queries.

**Important: `wallet_position_ownership` reliability for trigger listing.**

The `wallet_position_ownership` table was originally designed as a historical observation for history queries — it records "this wallet interacted with this position" and is written only from `RequestWalletSignature` (when a wallet approves execution). It is not currently maintained as a current-ownership snapshot:

- Positions are **never removed** from the table when a wallet no longer owns them.
- Ownership rows are **only written during execution approval**, not during wallet scans or position listing.

For history queries (`getWalletHistory`), this is fine — you want to see history for positions you ever owned. For actionable trigger listing, stale ownership is more dangerous because it could return triggers for positions the wallet no longer owns.

However, for this specific use case, the staleness risk is bounded:

1. **Triggers are scoped to open breach episodes.** A trigger only exists if the system detected an out-of-range breach and the episode is still open. If the wallet no longer owns the position, no new breach episodes will be created for it (the monitoring loop scans via `fetchPositionsForOwner`, which is owner-scoped).
2. **The trigger's `positionId` must match a row in `wallet_position_ownership`.** If a position was transferred to another wallet, the old wallet's ownership row still exists but the new wallet's does not. This means a transferred position's existing triggers might still appear for the old owner — but no new triggers will be created.

To make `wallet_position_ownership` reliable as a current-ownership source, the following changes are required:

1. **Write ownership on scan:** When `listSupportedPositions()` completes a wallet-wide scan, upsert ownership rows for every position found. This ensures the table reflects the latest known state from actual on-chain data.
2. **Consider a `last_scan_at` column** on a per-wallet basis (or per-row `lastSeenAt` which already exists) to allow consumers to distinguish "recently confirmed" from "historically observed."
3. **Do NOT delete stale rows** — positions that no longer appear in a scan may still have relevant history or open episodes. Instead, consumers should be aware that the table is an append-only observation log that is kept fresh by scan-time writes.

The combination of scan-time writes + open-episode scoping makes the DB-only trigger query safe for the current single-user LP monitor use case. For multi-wallet scenarios, a dedicated `current_wallet_positions` table with explicit lifecycle management would be the right evolution.

#### `SolanaExecutionPreparationAdapter.fetchPositionData()`

**After Issue 3 patch lands:** This method is extracted out of the prep adapter and replaced with a call to `SolanaPositionSnapshotReader.fetchSinglePosition()`. The prep adapter becomes a consumer, not an owner, of position-reading logic.

### Dependency Changes

- `OperationalStorageAdapter` constructor changes from `(db, ids, positionReadPort)` to `(db, ids)`. The `SupportedPositionReadPort` dependency is removed.
- `AdaptersModule.ts` stops passing `orcaPositionRead` to `OperationalStorageAdapter`.
- `OrcaPositionReadAdapter` gains a `SolanaPositionSnapshotReader` instance (constructed from the same `rpcUrl`).
- `SolanaExecutionPreparationAdapter` gains a `SolanaPositionSnapshotReader` instance (constructed from the same `rpcUrl`).

### Data Flow — Before vs. After

**Single position detail:**

| | Before | After |
|---|---|---|
| Path | `getPosition` → `listSupportedPositions` → filter | `getPosition` → `fetchSinglePosition` |
| RPC calls | 1 + N (wallet scan + N whirlpool fetches) | 2-3 (position + whirlpool + ownership check) |
| Ownership check | Implicit (owner-scoped scan) | Explicit (position mint token account ownership) |

**Trigger listing:**

| | Before | After |
|---|---|---|
| Path | `listActionableTriggers` → `listSupportedPositions` → DB query | `listActionableTriggers` → 2 DB queries |
| RPC calls | 1 + N | 0 |
| Data source for position IDs | On-chain | `wallet_position_ownership` table |

**Wallet-wide scan:**

| | Before | After |
|---|---|---|
| Path | `fetchPositionsForOwner` → sequential `fetchWhirlpool` per position | `fetchPositionsForOwner` → `fetchWhirlpoolsBatched` |
| RPC calls | 1 + N sequential | 1 + ceil(uniquePools / batchSize) batched |
| Deduplication | None (same pool fetched multiple times) | Deduplicated by address |

---

## Error Handling

- `fetchSinglePosition`: returns `null` on position-not-found, whirlpool-fetch failure, or ownership mismatch. Callers already handle `null` returns.
- `fetchWhirlpoolsBatched`: skips individual whirlpool failures. Positions whose whirlpool data is missing are excluded from results. This matches the current behavior where `fetchWhirlpool` failures result in `continue`.
- `listActionableTriggers` DB-only path: if `wallet_position_ownership` has no rows for the wallet, returns empty array (same as current behavior when no positions are found on-chain).

## Testing

- **`SolanaPositionSnapshotReader.fetchSinglePosition()`:** Mock RPC to return position + whirlpool data, verify correct `LiquidityPosition` shape with real `walletId`. Test ownership mismatch returns `null`. Test position-not-found returns `null`. Test whirlpool-fetch failure returns `null`.
- **`fetchWhirlpoolsBatched()`:** Verify deduplication (5 positions referencing 2 pools produces 2 fetches). Verify partial failure handling (1 of 2 pools fails, the other is returned).
- **`OrcaPositionReadAdapter.getPosition()`:** Verify it calls `fetchSinglePosition`, not `listSupportedPositions`. Verify ownership check prevents returning positions owned by a different wallet.
- **`OrcaPositionReadAdapter.listSupportedPositions()`:** Verify batched whirlpool fetching. Verify positions with failed whirlpool lookups are excluded.
- **`OperationalStorageAdapter.listActionableTriggers()`:** Verify zero calls to any position read port. Verify correct DB query against `wallet_position_ownership`. Verify empty result when no ownership rows exist.
- **Integration test:** End-to-end flow of list → detail → triggers with mocked RPC, verify total RPC call count matches expected (not N+1).

## Implementation Order

1. Extract `SolanaPositionSnapshotReader` with `fetchSinglePosition` and `fetchWhirlpoolsBatched`.
2. Refactor `OrcaPositionReadAdapter.getPosition()` to use `fetchSinglePosition`.
3. Refactor `OrcaPositionReadAdapter.listSupportedPositions()` to use `fetchWhirlpoolsBatched`.
4. Refactor `OperationalStorageAdapter.listActionableTriggers()` to use `wallet_position_ownership` and remove `positionReadPort` dependency.
5. Refactor `SolanaExecutionPreparationAdapter.fetchPositionData()` to use `fetchSinglePosition` (after Issue 3 patch).
6. Update `AdaptersModule.ts` wiring.

Note: Issue 3 (walletId contamination patch) should land before step 5, as a separate commit.
