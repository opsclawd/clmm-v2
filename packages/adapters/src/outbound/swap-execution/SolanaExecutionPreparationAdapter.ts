/**
 * SolanaExecutionPreparationAdapter
 *
 * Prepares an execution plan into a serialized transaction payload
 * ready for signing by the user's wallet.
 *
 * Uses @solana/kit for RPC and Orca/Jupiter for instructions.
 * The plan steps translate to:
 * - remove-liquidity: Orca close-position instruction
 * - collect-fees: Orca collect-fees instruction
 * - swap-assets: Jupiter swap instruction
 *
 * Note: Transaction building uses @solana/web3.js Transaction for wallet compatibility.
 * The signed payload format must match what wallets expect (MWA expects web3.js Transaction format).
 */
import { createSolanaRpc, address } from '@solana/kit';
import type { Address } from '@solana/kit';
import { Transaction, PublicKey } from '@solana/web3.js';
import { fetchPosition, fetchWhirlpool } from '@orca-so/whirlpools-client';
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, PositionId, ClockTimestamp, LiquidityPosition } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

const JUPITER_API_BASE = 'https://api.jup.ag/swap/v1';
const ORCA_API_BASE = 'https://api.mainnet.orca.so/v1';

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

    const instructions = await this.planToInstructions(plan, positionData, walletId);

    const transaction = new Transaction();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = new PublicKey(walletId);
    for (const ix of instructions) {
      transaction.add(ix);
    }

    const serialized = transaction.serialize();
    return {
      serializedPayload: Uint8Array.from(serialized),
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

  private async planToInstructions(
    plan: ExecutionPlan,
    positionData: LiquidityPosition,
    walletId: WalletId
  ): Promise<Transaction['instructions']> {
    const instructions: Transaction['instructions'] = [];

    for (const step of plan.steps) {
      if (step.kind === 'remove-liquidity') {
        const ix = await this.buildRemoveLiquidityInstruction(positionData, walletId);
        if (ix) instructions.push(ix);
      } else if (step.kind === 'collect-fees') {
        const ix = await this.buildCollectFeesInstruction(positionData, walletId);
        if (ix) instructions.push(ix);
      } else if (step.kind === 'swap-assets') {
        const ix = await this.buildSwapInstruction(step.instruction, walletId);
        if (ix) instructions.push(ix);
      }
    }

    return instructions;
  }

  private async buildRemoveLiquidityInstruction(
    positionData: LiquidityPosition,
    walletId: WalletId
  ): Promise<Transaction['instructions'][number] | null> {
    try {
      const positionMint = positionData.positionId;
      const response = await fetch(`${ORCA_API_BASE}/position/close-instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionMint,
          wallet: walletId,
          slippageTolerance: 100,
        }),
      });

      if (!response.ok) {
        console.error(`Orca close-position API error: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return this.parseInstruction(data.instruction);
    } catch (error) {
      console.error('Failed to build remove liquidity instruction:', error);
      return null;
    }
  }

  private async buildCollectFeesInstruction(
    positionData: LiquidityPosition,
    walletId: WalletId
  ): Promise<Transaction['instructions'][number] | null> {
    try {
      const rpc = this.getRpc();
      const positionAddress = address(positionData.positionId);
      const positionAccount = await fetchPosition(rpc, positionAddress);
      const position = positionAccount.data;
      const whirlpoolAddress = position.whirlpool;
      const whirlpoolAccount = await fetchWhirlpool(rpc, whirlpoolAddress);
      const whirlpool = whirlpoolAccount.data;

      const response = await fetch(`${ORCA_API_BASE}/position/collect-fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whirlpool: whirlpoolAddress.toString(),
          position: positionAddress.toString(),
          positionAuthority: walletId,
          tokenVaultA: whirlpool.tokenVaultA.toString(),
          tokenVaultB: whirlpool.tokenVaultB.toString(),
        }),
      });

      if (!response.ok) {
        console.error(`Orca collect-fees API error: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return this.parseInstruction(data.instruction);
    } catch (error) {
      console.error('Failed to build collect fees instruction:', error);
      return null;
    }
  }

  private async buildSwapInstruction(
    instruction: { fromAsset: string; toAsset: string; policyReason: string },
    walletId: WalletId
  ): Promise<Transaction['instructions'][number] | null> {
    try {
      const inputMint = instruction.fromAsset === 'SOL'
        ? 'So11111111111111111111111111111111111111112'
        : instruction.fromAsset;
      const outputMint = instruction.toAsset === 'SOL'
        ? 'So11111111111111111111111111111111111111112'
        : instruction.toAsset;

      const quoteResponse = await this.getJupiterQuote(inputMint, outputMint, '1000000');
      if (!quoteResponse) {
        return null;
      }

      const swapInstructions = await this.getJupiterSwapInstructions(quoteResponse, walletId);
      if (!swapInstructions || !swapInstructions.swapInstruction) {
        return null;
      }

      return this.parseInstruction(swapInstructions.swapInstruction);
    } catch (error) {
      console.error('Failed to build swap instruction:', error);
      return null;
    }
  }

  private parseInstruction(instructionData: any): Transaction['instructions'][number] | null {
    try {
      const { programId, keys, data: instructionDataBase64 } = instructionData;
      return {
        programId: new (require('@solana/web3.js').PublicKey)(programId),
        keys: keys.map((key: any) => ({
          pubkey: new (require('@solana/web3.js').PublicKey)(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instructionDataBase64, 'base64'),
      };
    } catch (error) {
      console.error('Failed to parse instruction:', error);
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

  private async getJupiterSwapInstructions(quoteResponse: any, userPublicKey: string): Promise<any | null> {
    try {
      const response = await fetch(`${JUPITER_API_BASE}/swap-instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
        }),
      });

      if (!response.ok) {
        console.error(`Jupiter swap-instructions API error: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      if (data.error) {
        console.error(`Jupiter swap error: ${data.error}`);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to get Jupiter swap instructions:', error);
      return null;
    }
  }
}
