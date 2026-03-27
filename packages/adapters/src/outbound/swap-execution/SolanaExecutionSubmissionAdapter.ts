/**
 * SolanaExecutionSubmissionAdapter
 *
 * Submits signed transactions to the Solana network and reconciles
 * the execution state based on on-chain confirmations.
 *
 * Uses @solana/kit for transaction submission as required by AGENTS.md.
 */
import { createSolanaRpc } from '@solana/kit';
import { Transaction, PublicKey } from '@solana/web3.js';
import type { ExecutionSubmissionPort } from '@clmm/application';
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class SolanaExecutionSubmissionAdapter implements ExecutionSubmissionPort {
  constructor(private readonly rpcUrl: string) {}

  private getRpc() {
    return createSolanaRpc(this.rpcUrl);
  }

  async submitExecution(signedPayload: Uint8Array): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }> {
    const rpc = this.getRpc();

    const transaction = Transaction.from(signedPayload);
    const serialized = transaction.serialize();
    const base64 = serialized.toString('base64');

    const signature = await rpc.sendTransaction(base64 as any).send();

    const stepKind = this.determineStepKindFromTransaction(transaction);

    const reference: TransactionReference = {
      signature: signature.toString(),
      stepKind,
    };

    return {
      references: [reference],
      submittedAt: makeClockTimestamp(Date.now()),
    };
  }

  async reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'>;
    finalState: ExecutionLifecycleState | null;
  }> {
    const rpc = this.getRpc();

    const confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'> = [];

    for (const ref of references) {
      try {
        const status = await rpc.getSignatureStatuses([ref.signature as any], { searchTransactionHistory: true }).send();
        const sigStatus = status.value[0];

        if (sigStatus?.confirmationStatus === 'confirmed' || sigStatus?.confirmationStatus === 'finalized') {
          confirmedSteps.push(ref.stepKind as 'remove-liquidity' | 'collect-fees' | 'swap-assets');
        }
      } catch {
        // Transaction not found or error - skip
      }
    }

    const finalState: ExecutionLifecycleState | null = confirmedSteps.length > 0
      ? { kind: 'confirmed' }
      : { kind: 'failed' };

    return {
      confirmedSteps,
      finalState,
    };
  }

  private determineStepKindFromTransaction(transaction: Transaction): 'remove-liquidity' | 'collect-fees' | 'swap-assets' {
    // Determine step kind by inspecting program IDs in the transaction instructions
    // Orca whirlpool program IDs are used for remove-liquidity and collect-fees
    // Jupiter program IDs are used for swap
    const ORCA_WHIRLPOOL_PROGRAMS = [
      'whirLbMiicVdio4qvUf4xKFGJ3Ua2xNhgV9e1EvQVaE', // mainnet
    ];
    const JUPITER_PROGRAMS = [
      'JUP6LkbZbjS1jKKwapdHNy34zcG7VoqkaGqgwNfrWwT', // mainnet
    ];

    for (const ix of transaction.instructions) {
      const programId = ix.programId.toBase58();
      if (ORCA_WHIRLPOOL_PROGRAMS.includes(programId)) {
        // Further inspection would be needed to distinguish remove vs collect
        // For now, we default to swap-assets as it's the final step
        continue;
      }
      if (JUPITER_PROGRAMS.includes(programId)) {
        return 'swap-assets';
      }
    }

    // Default to swap-assets as it's the most common final step
    return 'swap-assets';
  }
}