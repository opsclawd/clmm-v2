import type { ConnectionOutcome } from '@clmm/ui';
import type { WalletConnectionKind } from '../state/walletSessionStore.js';

export function mapWalletErrorToOutcome(error: unknown): ConnectionOutcome {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes('User rejected') ||
    message.includes('declined') ||
    message.includes('cancelled') ||
    message.includes('canceled')
  ) {
    return { kind: 'cancelled' };
  }

  if (
    message.includes('interrupted') ||
    message.includes('timeout') ||
    message.includes('closed')
  ) {
    return { kind: 'interrupted' };
  }

  return {
    kind: 'failed',
    reason: message,
  };
}

export function normalizeSuccessfulConnection(params: {
  address: string;
  connectionKind: WalletConnectionKind;
}) {
  return {
    walletAddress: params.address,
    connectionKind: params.connectionKind,
  };
}
