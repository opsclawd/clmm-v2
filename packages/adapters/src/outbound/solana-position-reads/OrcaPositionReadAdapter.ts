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
import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeWalletId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';

export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  constructor(private readonly rpcUrl: string) {}

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

    const liquidityPositions: LiquidityPosition[] = [];

    for (const positionData of positions) {
      for (const position of this.getOwnedPositionEntries(positionData)) {
        const whirlpoolAddress = position.whirlpool;

        let whirlpoolData;
        try {
          whirlpoolData = await fetchWhirlpool(rpc, address(whirlpoolAddress.toString()));
        } catch {
          continue;
        }

        const poolId = makePoolId(whirlpoolAddress.toString());
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
    }

    return liquidityPositions;
  }

  async getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null> {
    const positions = await this.listSupportedPositions(walletId);
    return positions.find((position) => position.positionId === positionId) ?? null;
  }
}
