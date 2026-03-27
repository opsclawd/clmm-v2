/**
 * OrcaPositionReadAdapter
 *
 * Translates Orca whirlpool position data into domain LiquidityPosition DTOs.
 * This adapter NEVER decides breach direction or target posture.
 * All direction decisions happen in packages/domain via DirectionalExitPolicyService.
 *
 * Docs: @orca-so/whirlpools SDK v7, @orca-so/whirlpools-client, @solana/kit v6
 * Uses fetchPositionsForOwner to list positions and fetchWhirlpool to get current tick.
 */
import { fetchPositionsForOwner } from '@orca-so/whirlpools';
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { createSolanaRpc, address } from '@solana/kit';
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';
import type { MonitoringReadiness } from '@clmm/domain';

function tickIndexToPrice(tickIndex: number, decimalsA: number, decimalsB: number): number {
  return Math.pow(1.0001, tickIndex) * Math.pow(10, decimalsA - decimalsB);
}

export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  private readonly rpc: ReturnType<typeof createSolanaRpc>;

  constructor(private readonly rpcUrl: string) {
    this.rpc = createSolanaRpc(this.rpcUrl);
  }

  private async fetchPoolTick(whirlpoolAddress: string): Promise<number> {
    try {
      const whirlpool = await fetchWhirlpool(this.rpc, address(whirlpoolAddress));
      return whirlpool.data.tickCurrentIndex;
    } catch {
      return 0;
    }
  }

  private async mapPosition(
    positionAddress: string,
    posData: {
      whirlpool: string;
      tickLowerIndex: number;
      tickUpperIndex: number;
    },
    walletId: WalletId,
  ): Promise<LiquidityPosition> {
    const decimalsA = 9;
    const decimalsB = 6;

    const lowerPrice = tickIndexToPrice(posData.tickLowerIndex, decimalsA, decimalsB);
    const upperPrice = tickIndexToPrice(posData.tickUpperIndex, decimalsA, decimalsB);
    const currentTick = await this.fetchPoolTick(posData.whirlpool);
    const currentPrice = tickIndexToPrice(currentTick, decimalsA, decimalsB);

    const bounds = {
      lowerBound: lowerPrice,
      upperBound: upperPrice,
    };

    const rangeState = evaluateRangeState(bounds, currentPrice);
    const monitoringReadiness: MonitoringReadiness = { kind: 'active' };

    return {
      positionId: makePositionId(positionAddress),
      walletId,
      poolId: makePoolId(posData.whirlpool),
      bounds,
      lastObservedAt: makeClockTimestamp(Date.now()),
      rangeState,
      monitoringReadiness,
    };
  }

  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    const ownerAddress = address(walletId);
    const positions = await fetchPositionsForOwner(this.rpc, ownerAddress);

    const result: LiquidityPosition[] = [];

    for (const position of positions) {
      if (position.isPositionBundle) continue;

      const mapped = await this.mapPosition(position.address, position.data, walletId);
      result.push(mapped);
    }

    return result;
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition | null> {
    return null;
  }
}
