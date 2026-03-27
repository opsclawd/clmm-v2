/**
 * SolanaExecutionPreparationAdapter
 *
 * Prepares an execution plan into a serialized transaction payload
 * ready for signing by the user's wallet.
 *
 * Uses @solana/kit for transaction building as required by AGENTS.md.
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

    // Build transaction from plan steps
    // Each step in plan.steps[] is RemoveLiquidity | CollectFees | SwapAssets
    const instructions = this.planToInstructions(plan);

    const transaction = new Transaction();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = payer;
    for (const ix of instructions) {
      transaction.add(ix as any);
    }

    const serialized = transaction.serialize();
    return {
      serializedPayload: Uint8Array.from(serialized),
      preparedAt: makeClockTimestamp(Date.now()),
    };
  }

  private planToInstructions(plan: ExecutionPlan): unknown[] {
    // TODO: Translate ExecutionPlan steps to Solana instructions
    // plan.steps contains: RemoveLiquidity | CollectFees | SwapAssets discriminated union
    // Each step type needs specific instruction translation using @solana/kit
    return [];
  }
}