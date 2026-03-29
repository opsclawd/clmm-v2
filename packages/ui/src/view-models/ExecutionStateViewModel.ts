import type { ExecutionLifecycleState } from '@clmm/domain';

export type ExecutionStateViewModel = {
  title: string;
  subtitle: string;
  isTerminal: boolean;
  showRetry: boolean;
  nextAction?: string;
  partialCompletionWarning?: string;
};

export function buildExecutionStateViewModel(
  state: ExecutionLifecycleState,
  retryEligible: boolean,
): ExecutionStateViewModel {
  switch (state.kind) {
    case 'previewed':
      return { title: 'Preview ready', subtitle: 'Review and sign to proceed', isTerminal: false, showRetry: false };
    case 'awaiting-signature':
      return { title: 'Awaiting your signature', subtitle: 'Wallet approval required', isTerminal: false, showRetry: false };
    case 'submitted':
      return {
        title: 'Submitted — awaiting confirmation',
        subtitle: 'Transaction sent. Waiting for on-chain confirmation.',
        isTerminal: false,
        showRetry: false,
      };
    case 'confirmed':
      return { title: 'Transaction confirmed', subtitle: 'Exit complete.', isTerminal: true, showRetry: false };
    case 'failed':
      return {
        title: 'Transaction failed',
        subtitle: 'No on-chain step was confirmed.',
        isTerminal: false,
        showRetry: retryEligible,
        ...(retryEligible ? { nextAction: 'Refresh preview and retry' } : {}),
      };
    case 'expired':
      return {
        title: 'Preview expired',
        subtitle: 'Quote expired before signing.',
        isTerminal: false,
        showRetry: retryEligible,
        ...(retryEligible ? { nextAction: 'Refresh preview' } : {}),
      };
    case 'abandoned':
      return { title: 'You declined to sign', subtitle: 'Exit was not executed.', isTerminal: true, showRetry: false };
    case 'partial':
      return {
        title: 'Partial completion — some steps confirmed',
        subtitle: 'One or more steps completed on-chain but the sequence did not finish.',
        isTerminal: true,
        showRetry: false,
        partialCompletionWarning:
          'Full replay is not available. Please review completed steps before taking action.',
        nextAction: 'Contact support or review history',
      };
    default: {
      const _exhaustive: never = state;
      throw new Error(`Unhandled lifecycle state: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
