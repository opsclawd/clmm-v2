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
  pipe,
  getTransactionDecoder,
  getBase64Encoder,
  getBase64Decoder,
  getCompiledTransactionMessageDecoder,
  decompileTransactionMessageFetchingLookupTables,
  getBase64EncodedWireTransaction,
  compileTransaction,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  prependTransactionMessageInstructions,
} from '@solana/kit';
import type { Address } from '@solana/kit';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import { closePositionInstructions } from '@orca-so/whirlpools';
import type { Instruction } from '@solana/kit';
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, PositionId, ClockTimestamp, LiquidityPosition } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2ZbiBci8f9aa211KkZg4fDqM9N';

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

    const orcaInstructions = await this.buildOrcaInstructions(rpc, positionData, walletId);
    const swapInstruction = await this.buildSwapInstruction(plan, walletId);

    const allInstructions: Instruction[] = [...orcaInstructions];
    if (swapInstruction) {
      allInstructions.push(swapInstruction);
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
      const positionAddress = address(positionId);
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
        poolId: whirlpoolAddress.toString() as any,
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
  ): Promise<Instruction[]> {
    try {
      const positionMintAddress = address(positionData.positionId);

      const orcaResult = await closePositionInstructions(rpc, positionMintAddress, 100);

      return orcaResult.instructions;
    } catch (error) {
      console.error('Failed to build Orca instructions:', error);
      return [];
    }
  }

  private async buildSwapInstruction(
    plan: ExecutionPlan,
    walletId: WalletId
  ): Promise<Instruction | null> {
    const swapStep = plan.steps.find((s) => s.kind === 'swap-assets');
    if (!swapStep || swapStep.kind !== 'swap-assets') {
      return null;
    }

    try {
      const inputMint = swapStep.instruction.fromAsset === 'SOL' ? SOL_MINT : swapStep.instruction.fromAsset;
      const outputMint = swapStep.instruction.toAsset === 'SOL' ? SOL_MINT : swapStep.instruction.toAsset;

      const quoteResponse = await this.getJupiterQuote(inputMint, outputMint, '1000000');
      if (!quoteResponse) {
        return null;
      }

      const swapTransaction = await this.getJupiterSwapTransaction(quoteResponse, walletId);
      if (!swapTransaction) {
        return null;
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

      if (transactionMessage.instructions.length > 0) {
        return transactionMessage.instructions[0];
      }

      return null;
    } catch (error) {
      console.error('Failed to build swap instruction:', error);
      return null;
    }
  }

  private async getJupiterQuote(inputMint: string, outputMint: string, amount: string): Promise<any | null> {
    try {
      const url = `${JUPITER_API_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    }
  }

  private async getJupiterSwapTransaction(quoteResponse: any, userPublicKey: string): Promise<string | null> {
    try {
      const response = await fetch(`${JUPITER_API_BASE}/swap`, {
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

      const data = await response.json();
      return data.swapTransaction || null;
    } catch (error) {
      console.error('Failed to get Jupiter swap transaction:', error);
      return null;
    }
  }
}
