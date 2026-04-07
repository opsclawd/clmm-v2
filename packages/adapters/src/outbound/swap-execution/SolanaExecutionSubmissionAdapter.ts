/**
 * SolanaExecutionSubmissionAdapter
 *
 * Submits signed transactions to the Solana network and reconciles
 * the execution state based on on-chain confirmations.
 *
 * Uses @solana/kit for RPC submission only.
 */
import { createSolanaRpc } from '@solana/kit';
import type { Base64EncodedWireTransaction, Signature } from '@solana/kit';
import type { ExecutionSubmissionPort } from '@clmm/application';
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

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

    const base64 = uint8ArrayToBase64(signedPayload) as Base64EncodedWireTransaction;

    const signature = await rpc.sendTransaction(base64, { encoding: 'base64', skipPreflight: true }).send();

    const reference: TransactionReference = {
      signature: signature.toString(),
      stepKind: 'swap-assets',
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
    let failedCount = 0;

    for (const ref of references) {
      try {
        const status = await rpc.getSignatureStatuses([ref.signature as unknown as Signature], { searchTransactionHistory: true }).send();
        const sigStatus = status.value[0];

        if (sigStatus?.confirmationStatus === 'confirmed' || sigStatus?.confirmationStatus === 'finalized') {
          confirmedSteps.push(ref.stepKind);
        } else if (sigStatus?.err) {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    const unresolvedCount = references.length - confirmedSteps.length - failedCount;

    let finalState: ExecutionLifecycleState | null;
    if (confirmedSteps.length === references.length) {
      finalState = { kind: 'confirmed' };
    } else if (confirmedSteps.length > 0) {
      finalState = { kind: 'partial' };
    } else if (failedCount === 0 && unresolvedCount > 0) {
      finalState = null;
    } else {
      finalState = { kind: 'failed' };
    }

    return { confirmedSteps, finalState };
  }
}
