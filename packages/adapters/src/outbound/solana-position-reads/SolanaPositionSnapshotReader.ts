/**
 * SolanaPositionSnapshotReader
 *
 * Fetches a single position snapshot from Solana using @solana/kit and @orca-so/whirlpools-client.
 * This reader is used for detailed position inspection and is not responsible for
 * determining breach direction or exit posture - that lives in packages/domain.
 *
 * Docs: @solana/kit v6, @orca-so/whirlpools-client
 */
import { createSolanaRpc, address } from '@solana/kit';
import { getPositionAddress, fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';

import type { LiquidityPosition, WalletId, PositionId, PoolData, PositionFees, PositionRewardInfo } from '@clmm/domain';
import { makePoolId, makeClockTimestamp, evaluateRangeState } from '@clmm/domain';
import { KNOWN_TOKENS } from '../price/known-tokens.js';

export type WhirlpoolData = {
  tickCurrentIndex: number;
  sqrtPrice: bigint;
  tokenMintA: string;
  tokenMintB: string;
  feeRate: number;
  tickSpacing: number;
  liquidity: bigint;
};

export class SolanaPositionSnapshotReader {
  constructor(private readonly rpcUrl: string) {}

  getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async fetchSinglePosition(
    rpc: ReturnType<typeof createSolanaRpc>,
    positionId: PositionId,
    walletId: WalletId,
  ): Promise<LiquidityPosition | null> {
    try {
      const positionMint = address(positionId);
      const [positionAddress] = await getPositionAddress(positionMint);
      const positionAccount = await fetchPosition(rpc, positionAddress);
      const position = positionAccount.data;

      const isOwner = await this.verifyOwnership(rpc, walletId, positionId);
      if (!isOwner) {
        return null;
      }

      const whirlpoolAddress = position.whirlpool;
      const whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
      const whirlpool = whirlpoolAccount.data;

      const bounds = {
        lowerBound: position.tickLowerIndex,
        upperBound: position.tickUpperIndex,
      };

      const currentTick = whirlpool.tickCurrentIndex;
      const rangeState = evaluateRangeState(bounds, currentTick);

      return {
        positionId,
        walletId,
        poolId: makePoolId(whirlpoolAddress.toString()),
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      };
    } catch {
      return null;
    }
  }

  async verifyOwnership(
    rpc: ReturnType<typeof createSolanaRpc>,
    walletId: WalletId,
    positionId: PositionId,
  ): Promise<boolean> {
    try {
      const ownerAddress = address(walletId);
      const mintAddress = address(positionId);

      const response = await rpc
        .getTokenAccountsByOwner(
          ownerAddress,
          { mint: mintAddress },
          { encoding: 'jsonParsed' },
        )
        .send();

      return response.value.some(
        (account) => BigInt(account.account.data.parsed.info.tokenAmount.amount) > 0n,
      );
    } catch {
      return false;
    }
  }

  async fetchWhirlpoolsBatched(
    rpc: ReturnType<typeof createSolanaRpc>,
    whirlpoolAddresses: string[],
  ): Promise<Map<string, WhirlpoolData>> {
    const uniqueAddresses = [...new Set(whirlpoolAddresses)];
    const results = new Map<string, WhirlpoolData>();

    if (uniqueAddresses.length === 0) {
      return results;
    }

    const WHIRLPOOL_FETCH_BATCH_SIZE = 2;

    for (let i = 0; i < uniqueAddresses.length; i += WHIRLPOOL_FETCH_BATCH_SIZE) {
      const batch = uniqueAddresses.slice(i, i + WHIRLPOOL_FETCH_BATCH_SIZE);

      await Promise.all(batch.map(async (addr) => {
        try {
          const whirlpoolAccount = await fetchWhirlpool(rpc, address(addr));
          const w = whirlpoolAccount.data;
          results.set(addr, {
            tickCurrentIndex: w.tickCurrentIndex,
            sqrtPrice: w.sqrtPrice,
            tokenMintA: w.tokenMintA.toString(),
            tokenMintB: w.tokenMintB.toString(),
            feeRate: w.feeRate,
            tickSpacing: w.tickSpacing,
            liquidity: w.liquidity,
          });
        } catch {
          // Skip failed fetches — positions referencing this pool will be excluded.
        }
      }));
    }

    return results;
  }

  async fetchPositionDetail(
    rpc: ReturnType<typeof createSolanaRpc>,
    positionId: PositionId,
    walletId: WalletId,
  ): Promise<{
    position: LiquidityPosition;
    poolData: PoolData;
    fees: PositionFees;
    positionLiquidity: bigint;
  } | null> {
    try {
      const positionMint = address(positionId);
      const [positionAddress] = await getPositionAddress(positionMint);
      const positionAccount = await fetchPosition(rpc, positionAddress);
      const pos = positionAccount.data;

      const isOwner = await this.verifyOwnership(rpc, walletId, positionId);
      if (!isOwner) {
        return null;
      }

      const whirlpoolAddress = pos.whirlpool;
      const whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
      const w = whirlpoolAccount.data;

      const poolIdStr = whirlpoolAddress.toString();
      const mintA = w.tokenMintA.toString();
      const mintB = w.tokenMintB.toString();
      const knownA = KNOWN_TOKENS[mintA];
      const knownB = KNOWN_TOKENS[mintB];

      const poolData: PoolData = {
        poolId: makePoolId(poolIdStr),
        tokenPair: {
          mintA,
          mintB,
          symbolA: knownA?.symbol ?? mintA,
          symbolB: knownB?.symbol ?? mintB,
          decimalsA: knownA?.decimals ?? 0,
          decimalsB: knownB?.decimals ?? 0,
        },
        sqrtPrice: w.sqrtPrice,
        feeRate: w.feeRate,
        tickSpacing: w.tickSpacing,
        liquidity: w.liquidity,
        tickCurrentIndex: w.tickCurrentIndex,
      };

      const rewardInfos: PositionRewardInfo[] = pos.rewardInfos.map((ri, idx) => {
        const poolReward = w.rewardInfos[idx];
        const rewardMint = poolReward?.mint?.toString() ?? '';
        const known = KNOWN_TOKENS[rewardMint];
        return {
          mint: rewardMint,
          amountOwed: ri.amountOwed,
          decimals: known?.decimals ?? 0,
        };
      });

      const fees: PositionFees = {
        feeOwedA: pos.feeOwedA,
        feeOwedB: pos.feeOwedB,
        rewardInfos,
      };

      const bounds = {
        lowerBound: pos.tickLowerIndex,
        upperBound: pos.tickUpperIndex,
      };

      const rangeState = evaluateRangeState(bounds, w.tickCurrentIndex);

      const position: LiquidityPosition = {
        positionId,
        walletId,
        poolId: makePoolId(poolIdStr),
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      };

      return {
        position,
        poolData,
        fees,
        positionLiquidity: pos.liquidity,
      };
    } catch {
      return null;
    }
  }
}
