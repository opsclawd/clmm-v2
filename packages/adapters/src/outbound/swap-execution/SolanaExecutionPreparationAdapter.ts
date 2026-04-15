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
import { fetchWhirlpool } from '@orca-so/whirlpools-client';
import { closePositionInstructions, swapInstructions, setNativeMintWrappingStrategy } from '@orca-so/whirlpools';
import type { Instruction } from '@solana/kit';
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, PositionId, PoolId, ClockTimestamp, LiquidityPosition } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import { SolanaPositionSnapshotReader } from '../solana-position-reads/SolanaPositionSnapshotReader.js';

const JUPITER_SWAP_API_BASES = [
  'https://lite-api.jup.ag/swap/v1',
  'https://api.jup.ag/swap/v1',
] as const;
const JUPITER_API_KEY = (process.env as Record<string, string | undefined>)['JUPITER_API_KEY'];

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN_MINTS: Record<'SOL' | 'USDC', string> = {
  SOL: SOL_MINT,
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export class SolanaExecutionPreparationAdapter implements ExecutionPreparationPort {
  constructor(
    private readonly rpcUrl: string,
    private readonly snapshotReader: SolanaPositionSnapshotReader,
  ) {}

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

    // Orca SDK defaults to native SOL wrapping via ephemeral keypair, which introduces an
    // additional signer not available in this wallet-only signing flow.
    setNativeMintWrappingStrategy('ata');

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const positionData = await this.snapshotReader.fetchSinglePosition(rpc, positionId, walletId);
    if (!positionData) {
      throw new Error(`Position not found: ${positionId}`);
    }

    const orcaPreparation = await this.buildOrcaInstructions(rpc, positionData, walletId);
    const { instructions: orcaInstructions } = orcaPreparation;
    const swapPreparation = await this.buildSwapInstructions(
      rpc,
      plan,
      walletId,
      positionData.poolId,
      orcaPreparation,
    );
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
    rpc: ReturnType<typeof createSolanaRpc>,
    plan: ExecutionPlan,
    walletId: WalletId,
    poolId: PoolId,
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

    const fromAsset = swapStep.instruction.fromAsset;
    const toAsset = swapStep.instruction.toAsset;
    const inputMint = TOKEN_MINTS[fromAsset];
    const outputMint = TOKEN_MINTS[toAsset];
    if (!inputMint || !outputMint) {
      return {
        instructions: [],
        failureReason: `Unsupported swap pair ${fromAsset}->${toAsset}`,
      };
    }

    const sourceMint = TOKEN_MINTS[fromAsset];
    let swapAmount = 0n;
    if (tokenContext.tokenMintA === sourceMint) {
      swapAmount = tokenContext.tokenAmounts.tokenA;
    } else if (tokenContext.tokenMintB === sourceMint) {
      swapAmount = tokenContext.tokenAmounts.tokenB;
    } else {
      return {
        instructions: [],
        failureReason: `Swap source mint ${sourceMint} not found in whirlpool token mints`,
      };
    }
    if (swapAmount === 0n) {
      return {
        instructions: [],
        failureReason: `close-position quote produced zero ${fromAsset} balance`,
      };
    }

    try {
      const quoteResponse = await this.getJupiterQuote(inputMint, outputMint, swapAmount.toString());
      const swapTransaction = await this.getJupiterSwapTransaction(quoteResponse, walletId);

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
    } catch (jupiterError) {
      const jupiterMessage =
        jupiterError instanceof Error ? jupiterError.message : 'unknown Jupiter swap preparation error';
      // eslint-disable-next-line no-console
      console.error('Jupiter swap preparation failed, attempting Orca fallback:', jupiterError);

      try {
        const instructions = await this.buildOrcaSwapInstructions(rpc, poolId, walletId, inputMint, swapAmount);
        if (instructions.length === 0) {
          return {
            instructions: [],
            failureReason: `Jupiter failed (${jupiterMessage}); Orca fallback produced no instructions`,
          };
        }

        return { instructions };
      } catch (orcaError) {
        const orcaMessage = orcaError instanceof Error ? orcaError.message : 'unknown Orca fallback error';
        // eslint-disable-next-line no-console
        console.error('Orca fallback swap preparation failed:', orcaError);
        return {
          instructions: [],
          failureReason: `Jupiter failed (${jupiterMessage}); Orca fallback failed (${orcaMessage})`,
        };
      }
    }
  }

  private async buildOrcaSwapInstructions(
    rpc: ReturnType<typeof createSolanaRpc>,
    poolId: PoolId,
    walletId: WalletId,
    inputMint: string,
    inputAmount: bigint,
  ): Promise<Instruction[]> {
    const authority = createNoopSigner(address(walletId));
    const result = await swapInstructions(
      rpc,
      {
        mint: address(inputMint),
        inputAmount,
      },
      address(poolId),
      50,
      authority,
    );

    return result.instructions;
  }

  // boundary: Jupiter v6 REST /quote response is untyped — no official SDK types available
  private async getJupiterQuote(inputMint: string, outputMint: string, amount: string): Promise<unknown> {
    const errors: string[] = [];

    for (const base of JUPITER_SWAP_API_BASES) {
      try {
        const url = `${base}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
        const response = await fetch(url, {
          headers: JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : undefined,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          errors.push(`${base} -> HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
          continue;
        }

        // boundary: Jupiter REST /quote response is untyped JSON
        return (await response.json()) as unknown;
      } catch (error) {
        errors.push(`${base} -> ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }

    throw new Error(`Jupiter quote unavailable (${errors.join(' | ')})`);
  }

  // boundary: Jupiter v6 REST /swap expects the raw /quote response object — no official SDK types
  private async getJupiterSwapTransaction(quoteResponse: unknown, userPublicKey: string): Promise<string> {
    const errors: string[] = [];

    for (const base of JUPITER_SWAP_API_BASES) {
      try {
        const response = await fetch(`${base}/swap`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : {}),
          },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey,
            wrapAndUnwrapSol: true,
          }),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          errors.push(`${base} -> HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
          continue;
        }

        // boundary: Jupiter REST /swap response is untyped JSON
        const data: unknown = await response.json();
        const swapTx = data != null && typeof data === 'object' && 'swapTransaction' in data
          ? (data as { swapTransaction?: string }).swapTransaction
          : undefined;

        if (typeof swapTx === 'string' && swapTx.length > 0) {
          return swapTx;
        }

        errors.push(`${base} -> swapTransaction missing in response`);
      } catch (error) {
        errors.push(`${base} -> ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }

    throw new Error(`Jupiter swap transaction unavailable (${errors.join(' | ')})`);
  }
}
