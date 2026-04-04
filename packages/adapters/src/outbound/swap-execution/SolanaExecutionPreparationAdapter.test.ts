import { describe, it, expect, vi } from 'vitest';
import type { Instruction } from '@solana/kit';
import type { ExecutionPlan, PoolId, WalletId } from '@clmm/domain';
import { SolanaExecutionPreparationAdapter } from './SolanaExecutionPreparationAdapter';

const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm' as unknown as PoolId;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('SolanaExecutionPreparationAdapter', () => {
  it('falls back to Orca swap instructions when Jupiter quote is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const adapter = new SolanaExecutionPreparationAdapter('https://api.mainnet-beta.solana.com');
    const internal = adapter as unknown as {
      getJupiterQuote: (inputMint: string, outputMint: string, amount: string) => Promise<unknown>;
      buildSwapInstructions: (
        rpc: unknown,
        plan: ExecutionPlan,
        walletId: WalletId,
        poolId: PoolId,
        tokenContext: {
          tokenAmounts: { tokenA: bigint; tokenB: bigint };
          tokenMintA: string;
          tokenMintB: string;
        },
      ) => Promise<{ instructions: Instruction[]; failureReason?: string }>;
      buildOrcaSwapInstructions?: (...args: unknown[]) => Promise<Instruction[]>;
    };

    vi.spyOn(internal, 'getJupiterQuote').mockRejectedValue(new Error('Jupiter quote unavailable'));
    const fallbackInstruction = { programAddress: SOL_MINT } as unknown as Instruction;
    const fallbackSpy = vi.fn<[...unknown[]], Promise<Instruction[]>>().mockResolvedValue([fallbackInstruction]);
    internal.buildOrcaSwapInstructions = fallbackSpy;

    const plan = {
      steps: [
        {
          kind: 'swap-assets',
          instruction: {
            fromAsset: 'SOL',
            toAsset: 'USDC',
          },
        },
      ],
    } as unknown as ExecutionPlan;

    const result = await internal.buildSwapInstructions({} as object, plan, MOCK_WALLET, MOCK_POOL, {
      tokenAmounts: { tokenA: 12_057_701n, tokenB: 0n },
      tokenMintA: SOL_MINT,
      tokenMintB: USDC_MINT,
    });

    expect(fallbackSpy).toHaveBeenCalled();
    expect(result.failureReason).toBeUndefined();
    expect(result.instructions).toEqual([fallbackInstruction]);
  });
});
