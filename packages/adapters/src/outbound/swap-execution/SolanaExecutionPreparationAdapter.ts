/**
 * SolanaExecutionPreparationAdapter
 *
 * Prepares an execution plan into a serialized transaction payload
 * ready for signing by the user's wallet.
 *
 * Uses @solana/kit for transaction building and Orca/Jupiter for instructions.
 * The plan steps translate to:
 * - remove-liquidity: Orca close-position instruction
 * - collect-fees: Orca collect-fees instruction
 * - swap-assets: Jupiter swap instruction
 */
import { createSolanaRpc, address } from '@solana/kit';
import type { Address } from '@solana/kit';
import { Transaction, PublicKey } from '@solana/web3.js';
import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class SolanaExecutionPreparationAdapter implements ExecutionPreparationPort {
  constructor(private readonly rpcUrl: string) {}

  private getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async prepareExecution(plan: ExecutionPlan, walletId: WalletId): Promise<{
    serializedPayload: Uint8Array;
    preparedAt: ClockTimestamp;
  }> {
    const rpc = this.getRpc();
    const payer = new PublicKey(walletId);

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const instructions = this.planToInstructions(plan);

    const transaction = new Transaction();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = payer;
    for (const ix of instructions) {
      transaction.add(ix);
    }

    const serialized = transaction.serialize();
    return {
      serializedPayload: Uint8Array.from(serialized),
      preparedAt: makeClockTimestamp(Date.now()),
    };
  }

  private planToInstructions(plan: ExecutionPlan): Transaction['instructions'] {
    const instructions: Transaction['instructions'] = [];

    for (const step of plan.steps) {
      if (step.kind === 'remove-liquidity') {
        const ix = this.buildRemoveLiquidityInstruction(plan);
        if (ix) instructions.push(ix);
      } else if (step.kind === 'collect-fees') {
        const ix = this.buildCollectFeesInstruction(plan);
        if (ix) instructions.push(ix);
      } else if (step.kind === 'swap-assets') {
        const ix = this.buildSwapInstruction(step.instruction);
        if (ix) instructions.push(ix);
      }
    }

    return instructions;
  }

  private buildRemoveLiquidityInstruction(_plan: ExecutionPlan): Transaction['instructions'][number] | null {
    // TODO: Build Orca close-position instruction
    // This requires:
    // 1. Getting the position address from the plan context
    // 2. Using Orca whirlpool SDK to build close-position instruction
    // 3. Returning the compiled instruction
    return null;
  }

  private buildCollectFeesInstruction(_plan: ExecutionPlan): Transaction['instructions'][number] | null {
    // TODO: Build Orca collect-fees instruction
    // This requires:
    // 1. Getting the position and whirlpool addresses
    // 2. Using Orca whirlpool SDK to build collect-fees instruction
    // 3. Returning the compiled instruction
    return null;
  }

  private buildSwapInstruction(_instruction: { fromAsset: string; toAsset: string; policyReason: string }): Transaction['instructions'][number] | null {
    // TODO: Build Jupiter swap instruction
    // This requires:
    // 1. Using Jupiter API to get swap quote and instruction
    // 2. Returning the compiled instruction from Jupiter response
    // The swap direction (SOL->USDC or USDC->SOL) comes from the domain SwapInstruction
    return null;
  }
}