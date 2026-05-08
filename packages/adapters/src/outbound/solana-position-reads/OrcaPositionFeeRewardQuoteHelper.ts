/**
 * OrcaPositionFeeRewardQuoteHelper
 *
 * Computes live fee + reward quotes for an Orca position using the Whirlpools
 * SDK direct quote path. Returns a discriminated `FeeRewardQuoteResult` union;
 * the caller decides what to log and how to surface unavailability.
 *
 * Docs: @orca-so/whirlpools-client v6.2.1, @orca-so/whirlpools-core v3.1.0
 */
import type { createSolanaRpc, Address } from '@solana/kit';
import { getTickArrayAddress, fetchAllTickArray } from '@orca-so/whirlpools-client';
import {
  getTickArrayStartTickIndex,
  getTickIndexInArray,
  collectFeesQuote,
  collectRewardsQuote,
} from '@orca-so/whirlpools-core';

import type { PositionFees, PositionRewardInfo } from '@clmm/domain';
import { KNOWN_TOKENS } from '../price/known-tokens.js';

type Rpc = ReturnType<typeof createSolanaRpc>;

export type FeeRewardQuoteResult =
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

type OrcaPosition = {
  tickLowerIndex: number;
  tickUpperIndex: number;
  liquidity: bigint;
  feeGrowthCheckpointA: bigint;
  feeGrowthCheckpointB: bigint;
  feeOwedA: bigint;
  feeOwedB: bigint;
  rewardInfos: ReadonlyArray<{ amountOwed: bigint; growthInsideCheckpoint: bigint }>;
};

type OrcaWhirlpool = {
  tokenMintA: { toString: () => string };
  tokenMintB: { toString: () => string };
  tickSpacing: number;
  feeRate: number;
  liquidity: bigint;
  sqrtPrice: bigint;
  tickCurrentIndex: number;
  feeGrowthGlobalA: bigint;
  feeGrowthGlobalB: bigint;
  rewardLastUpdatedTimestamp: bigint;
  rewardInfos: ReadonlyArray<{ mint: { toString: () => string } }>;
};

export type QuoteArgs = {
  readonly rpc: Rpc;
  readonly position: OrcaPosition;
  readonly positionMint: string;
  readonly whirlpool: OrcaWhirlpool;
  readonly whirlpoolAddress: Address | string;
};

const ERROR_MESSAGE_MAX_LENGTH = 200;

function describeError(err: unknown): { errorName?: string; errorMessage?: string } {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message.slice(0, ERROR_MESSAGE_MAX_LENGTH),
    };
  }
  return { errorMessage: String(err).slice(0, ERROR_MESSAGE_MAX_LENGTH) };
}

export class OrcaPositionFeeRewardQuoteHelper {
  async quote(args: QuoteArgs): Promise<FeeRewardQuoteResult> {
    const { rpc, position, whirlpool, whirlpoolAddress } = args;

    const lowerStart = getTickArrayStartTickIndex(position.tickLowerIndex, whirlpool.tickSpacing);
    const upperStart = getTickArrayStartTickIndex(position.tickUpperIndex, whirlpool.tickSpacing);

    let lowerTickArray: { data: { ticks: ReadonlyArray<unknown> } };
    let upperTickArray: { data: { ticks: ReadonlyArray<unknown> } };
    try {
      const [lowerAddr] = await getTickArrayAddress(whirlpoolAddress as Address, lowerStart);
      const [upperAddr] = await getTickArrayAddress(whirlpoolAddress as Address, upperStart);
      const [lower, upper] = await fetchAllTickArray(rpc, [lowerAddr, upperAddr]);
      lowerTickArray = lower as never;
      upperTickArray = upper as never;
    } catch (err) {
      return { kind: 'unavailable', reason: 'tick-array-fetch-failed', ...describeError(err) };
    }

    const lowerIdx = getTickIndexInArray(
      position.tickLowerIndex,
      lowerStart,
      whirlpool.tickSpacing,
    );
    const upperIdx = getTickIndexInArray(
      position.tickUpperIndex,
      upperStart,
      whirlpool.tickSpacing,
    );
    const lowerTick = lowerTickArray.data.ticks[lowerIdx];
    const upperTick = upperTickArray.data.ticks[upperIdx];
    if (lowerTick == null || upperTick == null) {
      return { kind: 'unavailable', reason: 'tick-data-missing' };
    }

    let feesQuote: { feeOwedA: bigint; feeOwedB: bigint };
    try {
      feesQuote = collectFeesQuote(
        whirlpool as never,
        position as never,
        lowerTick as never,
        upperTick as never,
      );
    } catch (err) {
      return { kind: 'unavailable', reason: 'fee-quote-failed', ...describeError(err) };
    }

    let rewardsQuote: { rewards: ReadonlyArray<{ rewardsOwed: bigint }> };
    try {
      const currentUnixTimestamp = BigInt(Math.floor(Date.now() / 1000));
      rewardsQuote = collectRewardsQuote(
        whirlpool as never,
        position as never,
        lowerTick as never,
        upperTick as never,
        currentUnixTimestamp,
      );
    } catch (err) {
      return { kind: 'unavailable', reason: 'reward-quote-failed', ...describeError(err) };
    }

    const rewardInfos: PositionRewardInfo[] = position.rewardInfos.map((_, idx) => {
      const poolReward = whirlpool.rewardInfos[idx];
      const rewardMint = poolReward?.mint?.toString() ?? '';
      const known = KNOWN_TOKENS[rewardMint];
      const rewardsOwed = rewardsQuote.rewards[idx]?.rewardsOwed ?? 0n;
      return {
        mint: rewardMint,
        amountOwed: rewardMint === '' ? 0n : rewardsOwed,
        decimals: known?.decimals ?? null,
      };
    });

    const fees: PositionFees = {
      feeOwedA: feesQuote.feeOwedA,
      feeOwedB: feesQuote.feeOwedB,
      rewardInfos,
    };

    return { kind: 'ok', fees };
  }
}
