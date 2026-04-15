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

import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import { makePoolId, makeClockTimestamp, evaluateRangeState } from '@clmm/domain';

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
  ): Promise<Map<string, { tickCurrentIndex: number }>> {
    const uniqueAddresses = [...new Set(whirlpoolAddresses)];
    const results = new Map<string, { tickCurrentIndex: number }>();

    if (uniqueAddresses.length === 0) {
      return results;
    }

    const fetches = uniqueAddresses.map(async (addr) => {
      try {
        const whirlpoolAccount = await fetchWhirlpool(rpc, address(addr));
        results.set(addr, { tickCurrentIndex: whirlpoolAccount.data.tickCurrentIndex });
      } catch {
        // Skip failed fetches — positions referencing this pool will be excluded
      }
    });

    await Promise.all(fetches);
    return results;
  }
}
