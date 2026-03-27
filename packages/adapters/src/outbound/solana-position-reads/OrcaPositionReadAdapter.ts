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
import { fetchWhirlpool, fetchPosition } from '@orca-so/whirlpools-client';

import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId, PoolId } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeWalletId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';
import type { MonitoringReadiness } from '@clmm/domain';

export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  constructor(private readonly rpcUrl: string) {}

  private getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  private walletIdToAddress(walletId: WalletId): Address {
    return address(walletId);
  }

  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    const rpc = this.getRpc();
    const ownerAddress = this.walletIdToAddress(walletId);

    const positions = await fetchPositionsForOwner(rpc, ownerAddress);

    const liquidityPositions: LiquidityPosition[] = [];

    for (const positionData of positions) {
      if (positionData.isPositionBundle) {
        continue;
      }

      const position = positionData.data;
      const whirlpoolAddress = positionData.data.whirlpool;

      let whirlpoolData;
      try {
        whirlpoolData = await fetchWhirlpool(rpc, whirlpoolAddress);
      } catch {
        continue;
      }

      const poolId = makePoolId(whirlpoolAddress.toString()) as PoolId;
      const positionId = makePositionId(position.positionMint.toString());

      const bounds = {
        lowerBound: position.tickLowerIndex,
        upperBound: position.tickUpperIndex,
      };

      const currentTick = whirlpoolData.data.tickCurrentIndex;
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

    return liquidityPositions;
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition | null> {
    const rpc = this.getRpc();
    const positionAddress = address(positionId);

    let positionAccount;
    try {
      positionAccount = await fetchPosition(rpc, positionAddress);
    } catch {
      return null;
    }

    const position = positionAccount.data;
    const whirlpoolAddress = position.whirlpool;

    let whirlpoolData;
    try {
      whirlpoolData = await fetchWhirlpool(rpc, whirlpoolAddress);
    } catch {
      return null;
    }

    const poolId = makePoolId(whirlpoolAddress.toString()) as PoolId;

    const bounds = {
      lowerBound: position.tickLowerIndex,
      upperBound: position.tickUpperIndex,
    };

    const currentTick = whirlpoolData.data.tickCurrentIndex;
    const rangeState = evaluateRangeState(bounds, currentTick);

    return {
      positionId,
      walletId: makeWalletId(position.positionMint.toString()),
      poolId,
      bounds,
      lastObservedAt: makeClockTimestamp(Date.now()),
      rangeState,
      monitoringReadiness: { kind: 'active' },
    };
  }
}
