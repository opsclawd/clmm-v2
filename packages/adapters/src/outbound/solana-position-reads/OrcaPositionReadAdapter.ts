/**
 * OrcaPositionReadAdapter
 *
 * Translates Orca whirlpool position data into domain LiquidityPosition DTOs.
 * This adapter NEVER decides breach direction or target posture.
 * All direction decisions happen in packages/domain via DirectionalExitPolicyService.
 *
 * Docs: @orca-so/whirlpools SDK v7, @orca-so/whirlpools-client, @orca-so/whirlpools-core, @solana/kit v6
 */
import { createSolanaRpc, address } from '@solana/kit';
import type { Address } from '@solana/kit';
import { fetchPositionsForOwner } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';

import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId, PoolId, PoolData, PositionDetail } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';

import { SolanaPositionSnapshotReader } from './SolanaPositionSnapshotReader.js';
import type { Db } from '../storage/db.js';
import { walletPositionOwnership } from '../storage/schema/index.js';
import { KNOWN_TOKENS } from '../price/known-tokens.js';

export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  private readonly poolDataCache = new Map<
    string,
    { data: PoolData | null; staleAt: number }
  >();
  private readonly POOL_DATA_CACHE_TTL_MS = 5_000;

  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
    private readonly db: Db,
  ) {}

  private isOwnedPositionEntry(value: unknown): value is {
    whirlpool: Address | string;
    tickLowerIndex: number;
    tickUpperIndex: number;
    positionMint: Address | string;
  } {
    if (typeof value !== 'object' || value == null) {
      return false;
    }

    if (!("whirlpool" in value) || !("tickLowerIndex" in value) || !("tickUpperIndex" in value) || !("positionMint" in value)) {
      return false;
    }

    return (
      (typeof value.whirlpool === 'string' || typeof value.whirlpool === 'object') &&
      typeof value.tickLowerIndex === 'number' &&
      typeof value.tickUpperIndex === 'number' &&
      (typeof value.positionMint === 'string' || typeof value.positionMint === 'object')
    );
  }

  private getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  private getBundleEntryData(bundlePosition: unknown): unknown {
    if (typeof bundlePosition !== 'object' || bundlePosition == null || !('data' in bundlePosition)) {
      return null;
    }

    return bundlePosition.data;
  }

  private walletIdToAddress(walletId: WalletId): Address {
    return address(walletId);
  }

  private getOwnedPositionEntries(positionData: unknown): Array<{
    whirlpool: Address | string;
    tickLowerIndex: number;
    tickUpperIndex: number;
    positionMint: Address | string;
  }> {
    if (typeof positionData !== 'object' || positionData == null) {
      return [];
    }

    if (!('isPositionBundle' in positionData)) {
      return [];
    }

    if (positionData.isPositionBundle === true) {
      if (!('positions' in positionData) || !Array.isArray(positionData.positions)) {
        return [];
      }

      return positionData.positions
        .map((bundlePosition) => this.getBundleEntryData(bundlePosition))
        .filter((entry): entry is {
          whirlpool: Address | string;
          tickLowerIndex: number;
          tickUpperIndex: number;
          positionMint: Address | string;
        } => this.isOwnedPositionEntry(entry));
    }

    if (!('data' in positionData) || !this.isOwnedPositionEntry(positionData.data)) {
      return [];
    }

    return [positionData.data];
  }

  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    const rpc = this.getRpc();
    const ownerAddress = this.walletIdToAddress(walletId);

    const positions = await fetchPositionsForOwner(rpc, ownerAddress);

    const allEntries: Array<{
      whirlpool: string;
      tickLowerIndex: number;
      tickUpperIndex: number;
      positionMint: string;
    }> = [];

    for (const positionData of positions) {
      for (const entry of this.getOwnedPositionEntries(positionData)) {
        allEntries.push({
          whirlpool: entry.whirlpool.toString(),
          tickLowerIndex: entry.tickLowerIndex,
          tickUpperIndex: entry.tickUpperIndex,
          positionMint: entry.positionMint.toString(),
        });
      }
    }

    const whirlpoolAddresses = allEntries.map((e) => e.whirlpool);
    const whirlpoolMap = await this.snapshotReader.fetchWhirlpoolsBatched(rpc, whirlpoolAddresses);

    const liquidityPositions: LiquidityPosition[] = [];

    for (const entry of allEntries) {
      const whirlpoolData = whirlpoolMap.get(entry.whirlpool);
      if (!whirlpoolData) {
        continue;
      }

      const poolId = makePoolId(entry.whirlpool);
      const positionId = makePositionId(entry.positionMint);

      const bounds = {
        lowerBound: entry.tickLowerIndex,
        upperBound: entry.tickUpperIndex,
      };

      const currentTick = whirlpoolData.tickCurrentIndex;
      const rangeState = evaluateRangeState(bounds, currentTick);

      liquidityPositions.push({
        positionId,
        walletId,
        poolId,
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      });
    }

    const now = Date.now();
    for (const entry of allEntries) {
      await this.db
        .insert(walletPositionOwnership)
        .values({
          walletId,
          positionId: makePositionId(entry.positionMint),
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
          set: { lastSeenAt: now },
        });
    }

    for (const [poolIdStr, w] of whirlpoolMap) {
      const poolId = makePoolId(poolIdStr);
      const mintA = w.tokenMintA;
      const mintB = w.tokenMintB;
      const knownA = KNOWN_TOKENS[mintA];
      const knownB = KNOWN_TOKENS[mintB];
      const data: PoolData = {
        poolId,
        tokenPair: {
          mintA,
          mintB,
          symbolA: knownA?.symbol ?? mintA,
          symbolB: knownB?.symbol ?? mintB,
          decimalsA: knownA?.decimals ?? null,
          decimalsB: knownB?.decimals ?? null,
        },
        sqrtPrice: w.sqrtPrice,
        feeRate: w.feeRate,
        tickSpacing: w.tickSpacing,
        liquidity: w.liquidity,
        tickCurrentIndex: w.tickCurrentIndex,
      };
      this.poolDataCache.set(poolId, { data, staleAt: Date.now() + this.POOL_DATA_CACHE_TTL_MS });
    }

    return liquidityPositions;
  }

  async getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null> {
    const rpc = this.getRpc();
    const position = await this.snapshotReader.fetchSinglePosition(rpc, positionId, walletId);
    if (!position) {
      return null;
    }

    const now = Date.now();
    await this.db
      .insert(walletPositionOwnership)
      .values({
        walletId,
        positionId,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
        set: { lastSeenAt: now },
      });

    return position;
  }

  private async fetchPoolData(poolId: PoolId): Promise<PoolData | null> {
    const cached = this.poolDataCache.get(poolId);
    if (cached && Date.now() < cached.staleAt) {
      return cached.data;
    }

    const rpc = this.getRpc();
    try {
      const whirlpoolAccount = await fetchWhirlpool(rpc, address(poolId));
      const w = whirlpoolAccount.data;
      const mintA = w.tokenMintA.toString();
      const mintB = w.tokenMintB.toString();
      const knownA = KNOWN_TOKENS[mintA];
      const knownB = KNOWN_TOKENS[mintB];
      const data: PoolData = {
        poolId,
        tokenPair: {
          mintA,
          mintB,
          symbolA: knownA?.symbol ?? mintA,
          symbolB: knownB?.symbol ?? mintB,
          decimalsA: knownA?.decimals ?? null,
          decimalsB: knownB?.decimals ?? null,
        },
        sqrtPrice: w.sqrtPrice,
        feeRate: w.feeRate,
        tickSpacing: w.tickSpacing,
        liquidity: w.liquidity,
        tickCurrentIndex: w.tickCurrentIndex,
      };
      this.poolDataCache.set(poolId, { data, staleAt: Date.now() + this.POOL_DATA_CACHE_TTL_MS });
      return data;
    } catch {
      this.poolDataCache.set(poolId, { data: null, staleAt: Date.now() + this.POOL_DATA_CACHE_TTL_MS });
      return null;
    }
  }

  async getPoolData(poolId: PoolId): Promise<PoolData | null> {
    return this.fetchPoolData(poolId);
  }

  async getPositionDetail(walletId: WalletId, positionId: PositionId): Promise<PositionDetail | null> {
    const rpc = this.getRpc();
    const detail = await this.snapshotReader.fetchPositionDetail(rpc, positionId, walletId);
    if (!detail) return null;
    const now = Date.now();
    await this.db
      .insert(walletPositionOwnership)
      .values({
        walletId,
        positionId,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [walletPositionOwnership.walletId, walletPositionOwnership.positionId],
        set: { lastSeenAt: now },
      });
    return detail;
  }
}
