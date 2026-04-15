import { describe, it, expect, vi } from 'vitest';
import type { Instruction } from '@solana/kit';
import type { ExecutionPlan, PoolId, WalletId } from '@clmm/domain';
import { SolanaExecutionPreparationAdapter } from './SolanaExecutionPreparationAdapter';
import { SolanaPositionSnapshotReader } from '../solana-position-reads/SolanaPositionSnapshotReader';

const MOCK_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T' as WalletId;
const MOCK_POSITION_ID = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const MOCK_POOL = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm' as unknown as PoolId;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

vi.mock('@orca-so/whirlpools-client', () => ({
  getPositionAddress: vi.fn(),
  fetchPosition: vi.fn(),
  fetchWhirlpool: vi.fn(),
}));

vi.mock('../solana-position-reads/SolanaPositionSnapshotReader', () => ({
  SolanaPositionSnapshotReader: vi.fn().mockImplementation(() => ({
    fetchSinglePosition: vi.fn(),
    fetchWhirlpoolsBatched: vi.fn(),
    getRpc: vi.fn(() => ({})),
  })),
}));

describe('SolanaExecutionPreparationAdapter', () => {
  it('falls back to Orca swap instructions when Jupiter quote is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockReader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
    const adapter = new SolanaExecutionPreparationAdapter('https://api.mainnet-beta.solana.com', mockReader);
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

  it('uses the snapshot reader when preparing execution', async () => {
    const mockReader = new SolanaPositionSnapshotReader('https://api.mainnet-beta.solana.com');
    vi.mocked(mockReader.fetchSinglePosition).mockResolvedValue({
      positionId: MOCK_POSITION_ID as any,
      walletId: MOCK_WALLET,
      poolId: MOCK_POOL,
      bounds: { lowerBound: -100, upperBound: 100 },
      lastObservedAt: 1_000_000 as any,
      rangeState: { kind: 'in-range', currentPrice: 50 },
      monitoringReadiness: { kind: 'active' },
    });

    const adapter = new SolanaExecutionPreparationAdapter('https://api.mainnet-beta.solana.com', mockReader);
    const internal = adapter as unknown as {
      getRpc: () => {
        getLatestBlockhash: () => { send: () => Promise<{ value: { blockhash: string; lastValidBlockHeight: bigint } }> };
      };
      buildOrcaInstructions: (...args: unknown[]) => Promise<{
        instructions: Instruction[];
        tokenAmounts: { tokenA: bigint; tokenB: bigint };
        tokenMintA: string;
        tokenMintB: string;
      }>;
      buildSwapInstructions: (...args: unknown[]) => Promise<{ instructions: Instruction[]; failureReason?: string }>;
    };

    vi.spyOn(internal, 'getRpc').mockReturnValue({
      getLatestBlockhash: () => ({
        send: async () => ({
          value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1n },
        }),
      }),
    } as never);

    vi.spyOn(internal, 'buildOrcaInstructions').mockResolvedValue({
      instructions: [],
      tokenAmounts: { tokenA: 0n, tokenB: 0n },
      tokenMintA: SOL_MINT,
      tokenMintB: USDC_MINT,
    });

    vi.spyOn(internal, 'buildSwapInstructions').mockResolvedValue({ instructions: [] });

    await expect(adapter.prepareExecution({
      plan: { steps: [] } as unknown as ExecutionPlan,
      walletId: MOCK_WALLET,
      positionId: MOCK_POSITION_ID as any,
    })).resolves.toEqual(expect.objectContaining({
      serializedPayload: expect.any(Uint8Array),
    }));

    expect(mockReader.fetchSinglePosition).toHaveBeenCalledOnce();
    expect(mockReader.fetchSinglePosition).toHaveBeenCalledWith(
      expect.anything(),
      MOCK_POSITION_ID,
      MOCK_WALLET,
    );
  });
});
