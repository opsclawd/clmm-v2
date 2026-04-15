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
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp, ExecutionStep } from '@clmm/domain';
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

  async submitExecution(
    signedPayload: Uint8Array,
    plannedStepKinds: ReadonlyArray<ExecutionStep['kind']>,
  ): Promise<{
    references: TransactionReference[];
    submittedAt: ClockTimestamp;
  }> {
    const rpc = this.getRpc();

    const base64 = uint8ArrayToBase64(signedPayload) as Base64EncodedWireTransaction;

    const signature = await rpc.sendTransaction(base64, { encoding: 'base64', skipPreflight: true }).send();

    const sig = signature.toString();
    const uniqueStepKinds = [...new Set(plannedStepKinds)];
    const references: TransactionReference[] = uniqueStepKinds.map(
      (stepKind) => ({ signature: sig, stepKind }),
    );

    return {
      references,
      submittedAt: makeClockTimestamp(Date.now()),
    };
  }

  async reconcileExecution(references: TransactionReference[]): Promise<{
    confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'>;
    finalState: ExecutionLifecycleState | null;
  }> {
    const rpc = this.getRpc();

    const uniqueSignatures = [...new Set(references.map((r) => r.signature))];
    const signatureStatusMap = new Map<string, 'confirmed' | 'failed' | 'pending'>();

    for (const sig of uniqueSignatures) {
      try {
        const status = await rpc
          .getSignatureStatuses(
            [sig as unknown as Signature],
            { searchTransactionHistory: true },
          )
          .send();
        const sigStatus = status.value[0];

        if (sigStatus?.err) {
          signatureStatusMap.set(sig, 'failed');
        } else if (
          sigStatus?.confirmationStatus === 'confirmed' ||
          sigStatus?.confirmationStatus === 'finalized'
        ) {
          signatureStatusMap.set(sig, 'confirmed');
        } else {
          signatureStatusMap.set(sig, 'pending');
        }
      } catch {
        signatureStatusMap.set(sig, 'failed');
      }
    }

    const confirmedSteps: Array<'remove-liquidity' | 'collect-fees' | 'swap-assets'> = [];
    let failedCount = 0;

    for (const ref of references) {
      const status = signatureStatusMap.get(ref.signature) ?? 'pending';
      if (status === 'confirmed') {
        confirmedSteps.push(ref.stepKind);
      } else if (status === 'failed') {
        failedCount++;
      }
    }

    const unresolvedCount = references.length - confirmedSteps.length - failedCount;

    let finalState: ExecutionLifecycleState | null;
    if (references.length === 0) {
      finalState = null;
    } else if (confirmedSteps.length === references.length) {
      finalState = { kind: 'confirmed' };
    } else if (confirmedSteps.length > 0) {
      finalState = { kind: 'partial' };
    } else if (failedCount > 0) {
      finalState = { kind: 'failed' };
    } else if (unresolvedCount > 0) {
      finalState = null;
    } else {
      finalState = { kind: 'failed' };
    }

    return { confirmedSteps, finalState };
  }
}
