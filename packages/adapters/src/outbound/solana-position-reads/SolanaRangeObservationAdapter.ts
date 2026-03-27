/**
 * SolanaRangeObservationAdapter
 *
 * Observes the current range state of a position by fetching
 * the current tick index from the associated whirlpool.
 *
 * Uses @solana/kit for RPC calls as required by AGENTS.md.
 */
import { createSolanaRpc, address } from '@solana/kit';
import type { Address } from '@solana/kit';
import { fetchWhirlpool, fetchPosition } from '@orca-so/whirlpools-client';
import type { RangeObservationPort } from '@clmm/application';
import type { PositionId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class SolanaRangeObservationAdapter implements RangeObservationPort {
  constructor(private readonly rpcUrl: string) {}

  private getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async observeRangeState(positionId: PositionId): Promise<{
    positionId: PositionId;
    currentPrice: number;
    observedAt: ClockTimestamp;
  }> {
    const rpc = this.getRpc();
    const positionAddress = address(positionId);

    let positionAccount;
    try {
      positionAccount = await fetchPosition(rpc, positionAddress);
    } catch {
      throw new Error(`SolanaRangeObservationAdapter: could not fetch position ${positionId}`);
    }

    const position = positionAccount.data;
    const whirlpoolAddress = position.whirlpool;

    let whirlpoolData;
    try {
      whirlpoolData = await fetchWhirlpool(rpc, whirlpoolAddress);
    } catch {
      throw new Error(`SolanaRangeObservationAdapter: could not fetch whirlpool ${whirlpoolAddress}`);
    }

    const currentTick = whirlpoolData.data.tickCurrentIndex;

    return {
      positionId,
      currentPrice: currentTick,
      observedAt: makeClockTimestamp(Date.now()),
    };
  }
}