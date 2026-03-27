/**
 * SolanaExecutionSubmissionAdapter
 *
 * Submits signed transactions to the Solana network and reconciles
 * the execution state based on on-chain confirmations.
 *
 * Uses @solana/kit for transaction submission as required by AGENTS.md.
 */
import { createSolanaRpc } from '@solana/kit';
import { Transaction } from '@solana/web3.js';
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

    const reference: TransactionReference = {
      signature: signature.toString(),
      stepKind: 'swap-assets', // TODO: determine step kind from transaction
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
}