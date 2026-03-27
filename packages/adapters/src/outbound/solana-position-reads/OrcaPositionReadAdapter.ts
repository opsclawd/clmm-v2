/**
 * OrcaPositionReadAdapter
 *
 * Translates Orca whirlpool position data into domain LiquidityPosition DTOs.
 * This adapter NEVER decides breach direction or target posture.
 * All direction decisions happen in packages/domain via DirectionalExitPolicyService.
 *
 * ⚠️ Use solana-adapter-docs skill before editing — @orca-so/whirlpools API changes
 */
import { createSolanaRpc } from '@solana/kit';
import { address, type Address } from '@solana/kit';
import { fetchPositionsForOwner } from '@orca-so/whirlpools';
import { fetchWhirlpool, fetchPosition } from '@orca-so/whirlpools-client';
import { sqrtPriceToTickIndex } from '@orca-so/whirlpools-core';

import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeWalletId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';
import type { PoolId } from '@clmm/domain';

const SOL_DECIMALS = 9;
const USDC_DECIMALS = 6;

const SOL_MINT = address('So11111111111111111111111111111111111111112');
const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

function getTokenDecimals(mint: Address): number {
  const mintStr = mint.toString();
  if (mintStr === SOL_MINT.toString()) {
    return SOL_DECIMALS;
  }
  if (mintStr === USDC_MINT.toString()) {
    return USDC_DECIMALS;
  }
  return 9;
}

function identifyTokenSymbol(mint: Address): 'SOL' | 'USDC' {
  const mintStr = mint.toString();
  if (mintStr === USDC_MINT.toString()) {
    return 'USDC';
  }
  return 'SOL';
}

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
      const currentTick = whirlpoolData.data.tickCurrentIndex;
      const sqrtPrice = whirlpoolData.data.sqrtPrice;

      const bounds = {
        lowerBound: position.tickLowerIndex,
        upperBound: position.tickUpperIndex,
      };

      const currentPrice = sqrtPriceToTickIndex(sqrtPrice);
      const rangeState = evaluateRangeState(bounds, currentPrice);

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
    const currentTick = whirlpoolData.data.tickCurrentIndex;
    const sqrtPrice = whirlpoolData.data.sqrtPrice;

    const bounds = {
      lowerBound: position.tickLowerIndex,
      upperBound: position.tickUpperIndex,
    };

    const currentPrice = sqrtPriceToTickIndex(sqrtPrice);
    const rangeState = evaluateRangeState(bounds, currentPrice);

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
