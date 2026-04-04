/**
 * SolanaExecutionPreparationAdapter
 *
 * Prepares an execution plan into a serialized transaction payload
 * ready for signing by the user's wallet.
 *
 * Uses @solana/kit for RPC and transaction building, and Orca/Jupiter for instructions.
 * The plan steps translate to:
 * - remove-liquidity: Orca close-position instruction (kit-native via SDK)
 * - collect-fees: Orca collect-fees instruction (kit-native via SDK)
 * - swap-assets: Jupiter swap instruction (via /swap/v1/swap returning base64)
 *
 * This adapter is fully @solana/kit-native except for:
 * - Orca SDK returns kit-native Instruction[] (no format conversion needed)
 * - Jupiter returns base64 transaction (decoded with getTransactionDecoder)
 */
import {
  createSolanaRpc,
  address,
  createNoopSigner,
  pipe,
  getTransactionDecoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessageFetchingLookupTables,
  getBase64EncodedWireTransaction,
  compileTransaction,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  prependTransactionMessageInstructions,
} from '@solana/kit';
import { fetchPosition, fetchWhirlpool, getPositionAddress } from '@orca-so/whirlpools-client';
import { closePositionInstructions } from '@orca-so/whirlpools';
import type { Instruction } from '@solana/kit';
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, PositionId, PoolId, ClockTimestamp, LiquidityPosition } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

const JUPITER_QUOTE_API_BASE = 'https://quote-api.jup.ag/v6';
const JUPITER_SWAP_API_BASE = 'https://api.jup.ag/swap/v1';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_MINTS: Record<'SOL' | 'USDC', string> = {
  SOL: SOL_MINT,
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export class SolanaExecutionPreparationAdapter implements ExecutionPreparationPort {
  constructor(private readonly rpcUrl: string) {}

  private getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async prepareExecution(params: {
    plan: ExecutionPlan;
    walletId: WalletId;
    positionId: PositionId;
  }): Promise<{
    serializedPayload: Uint8Array;
    preparedAt: ClockTimestamp;
  }> {
    const { plan, walletId, positionId } = params;
    const rpc = this.getRpc();
    const payer = address(walletId);

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const positionData = await this.fetchPositionData(rpc, positionId);
    if (!positionData) {
      throw new Error(`Position not found: ${positionId}`);
    }

    const orcaPreparation = await this.buildOrcaInstructions(rpc, positionData, walletId);
    const { instructions: orcaInstructions } = orcaPreparation;
    const swapPreparation = await this.buildSwapInstructions(plan, walletId, orcaPreparation);
    const swapInstructions = swapPreparation.instructions;

    const allInstructions: Instruction[] = [...orcaInstructions];
    if (swapInstructions.length > 0) {
      allInstructions.push(...swapInstructions);
    }

    const requiresSwapStep = plan.steps.some((step) => step.kind === 'swap-assets');
    if (requiresSwapStep && swapInstructions.length === 0) {
      throw new Error(
        `Swap step is required by the execution plan but no swap instructions were prepared${
          swapPreparation.failureReason ? `: ${swapPreparation.failureReason}` : ''
        }`,
      );
    }

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => prependTransactionMessageInstructions(allInstructions, m),
    );

    const transaction = compileTransaction(message);
    const base64 = getBase64EncodedWireTransaction(transaction);
    const serializedBytes = Uint8Array.from(Buffer.from(base64, 'base64'));

    return {
      serializedPayload: serializedBytes,
      preparedAt: makeClockTimestamp(Date.now()),
    };
  }

  private async fetchPositionData(rpc: ReturnType<typeof createSolanaRpc>, positionId: PositionId): Promise<LiquidityPosition | null> {
    try {
      const positionMint = address(positionId);
      const [positionAddress] = await getPositionAddress(positionMint);
      const positionAccount = await fetchPosition(rpc, positionAddress);
      const position = positionAccount.data;
      const whirlpoolAddress = position.whirlpool;

      const whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
      const whirlpool = whirlpoolAccount.data;

      const bounds = {
        lowerBound: position.tickLowerIndex,
        upperBound: position.tickUpperIndex,
      };

      const currentTick = whirlpool.tickCurrentIndex;
      const rangeState = this.evaluateRangeState(bounds, currentTick);

      return {
        positionId,
        walletId: position.positionMint.toString() as WalletId,
        // boundary: Orca SDK returns Address type; domain uses branded PoolId
        poolId: whirlpoolAddress.toString() as unknown as PoolId,
        bounds,
        lastObservedAt: makeClockTimestamp(Date.now()),
        rangeState,
        monitoringReadiness: { kind: 'active' },
      };
    } catch {
      return null;
    }
  }

  private evaluateRangeState(
    bounds: { lowerBound: number; upperBound: number },
    currentTick: number
  ): { kind: 'in-range' | 'below-range' | 'above-range'; currentPrice: number } {
    if (currentTick < bounds.lowerBound) {
      return { kind: 'below-range', currentPrice: currentTick };
    }
    if (currentTick > bounds.upperBound) {
      return { kind: 'above-range', currentPrice: currentTick };
    }
    return { kind: 'in-range', currentPrice: currentTick };
  }

  private async buildOrcaInstructions(
    rpc: ReturnType<typeof createSolanaRpc>,
    positionData: LiquidityPosition,
    walletId: WalletId
  ): Promise<{
    instructions: Instruction[];
    tokenAmounts: { tokenA: bigint; tokenB: bigint };
    tokenMintA: string;
    tokenMintB: string;
  }> {
    const positionMintAddress = address(positionData.positionId);
    const authority = createNoopSigner(address(walletId));
    const orcaResult = await closePositionInstructions(rpc, positionMintAddress, 100, authority);
    const whirlpoolAccount = await fetchWhirlpool(rpc, address(positionData.poolId));

    return {
      instructions: orcaResult.instructions,
      tokenAmounts: {
        tokenA: orcaResult.quote.tokenEstA + orcaResult.feesQuote.feeOwedA,
        tokenB: orcaResult.quote.tokenEstB + orcaResult.feesQuote.feeOwedB,
      },
      tokenMintA: whirlpoolAccount.data.tokenMintA.toString(),
      tokenMintB: whirlpoolAccount.data.tokenMintB.toString(),
    };
  }

  private async buildSwapInstructions(
    plan: ExecutionPlan,
    walletId: WalletId,
    tokenContext: {
      tokenAmounts: { tokenA: bigint; tokenB: bigint };
      tokenMintA: string;
      tokenMintB: string;
    },
  ): Promise<{ instructions: Instruction[]; failureReason?: string }> {
    const swapStep = plan.steps.find((s) => s.kind === 'swap-assets');
    if (!swapStep || swapStep.kind !== 'swap-assets') {
      return { instructions: [], failureReason: 'execution plan has no swap step' };
    }

    try {
      const fromAsset = swapStep.instruction.fromAsset;
      const toAsset = swapStep.instruction.toAsset;
      const inputMint = TOKEN_MINTS[fromAsset];
      const outputMint = TOKEN_MINTS[toAsset];
      if (!inputMint || !outputMint) {
        throw new Error(`Unsupported swap pair ${fromAsset}->${toAsset} for Jupiter quote`);
      }

      const sourceMint = TOKEN_MINTS[fromAsset];
      let swapAmount = 0n;
      if (tokenContext.tokenMintA === sourceMint) {
        swapAmount = tokenContext.tokenAmounts.tokenA;
      } else if (tokenContext.tokenMintB === sourceMint) {
        swapAmount = tokenContext.tokenAmounts.tokenB;
      } else {
        throw new Error(`Swap source mint ${sourceMint} not found in whirlpool token mints`);
      }
      if (swapAmount === 0n) {
        return {
          instructions: [],
          failureReason: `close-position quote produced zero ${fromAsset} balance`,
        };
      }

      const quoteResponse = await this.getJupiterQuote(inputMint, outputMint, swapAmount.toString());
      if (!quoteResponse) {
        return {
          instructions: [],
          failureReason: `Jupiter quote unavailable for ${inputMint}->${outputMint} amount ${swapAmount.toString()}`,
        };
      }

      const swapTransaction = await this.getJupiterSwapTransaction(quoteResponse, walletId);
      if (!swapTransaction) {
        return {
          instructions: [],
          failureReason: 'Jupiter swap transaction unavailable',
        };
      }

      const encoder = getBase64Encoder();
      const transactionBytes = encoder.encode(swapTransaction);
      const decoder = getTransactionDecoder();
      const transaction = decoder.decode(transactionBytes);

      const messageDecoder = getCompiledTransactionMessageDecoder();
      const compiledMessage = messageDecoder.decode(transaction.messageBytes);
      const transactionMessage = await decompileTransactionMessageFetchingLookupTables(
        compiledMessage,
        this.getRpc(),
      );

      const instructions = [...transactionMessage.instructions];
      if (instructions.length === 0) {
        return {
          instructions: [],
          failureReason: 'Decoded Jupiter swap transaction contained no instructions',
        };
      }

      return { instructions };
    } catch (error) {
      console.error('Failed to build swap instruction:', error);
      return {
        instructions: [],
        failureReason: error instanceof Error ? error.message : 'unknown swap preparation error',
      };
    }
  }

  // boundary: Jupiter v6 REST /quote response is untyped — no official SDK types available
  private async getJupiterQuote(inputMint: string, outputMint: string, amount: string): Promise<unknown> {
    try {
      const url = `${JUPITER_QUOTE_API_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      // boundary: Jupiter v6 REST /quote response is untyped JSON
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }

  // boundary: Jupiter v6 REST /swap expects the raw /quote response object — no official SDK types
  private async getJupiterSwapTransaction(quoteResponse: unknown, userPublicKey: string): Promise<string | null> {
    try {
      const response = await fetch(`${JUPITER_SWAP_API_BASE}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
        }),
      });

      if (!response.ok) {
        console.error(`Jupiter swap API error: ${response.statusText}`);
        return null;
      }

      // boundary: Jupiter v6 REST /swap response is untyped JSON
      const data: unknown = await response.json();
      const swapTx = data != null && typeof data === 'object' && 'swapTransaction' in data
        ? (data as { swapTransaction?: string }).swapTransaction
        : undefined;
      return swapTx ?? null;
    } catch (error) {
      console.error('Failed to get Jupiter swap transaction:', error);
      return null;
    }
  }
}
