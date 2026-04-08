import type { ConnectionOutcome } from '@clmm/ui';
import type { WalletConnectionKind } from '../state/walletSessionStore';

const CANCELLATION_MATCHERS = ['user rejected', 'declined', 'cancelled', 'canceled'] as const;
const INTERRUPTION_MATCHERS = ['interrupted', 'timeout', 'closed'] as const;

function includesAny(value: string, matchers: readonly string[]): boolean {
  return matchers.some((matcher) => value.includes(matcher));
}

export function mapWalletErrorToOutcome(error: unknown): ConnectionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (includesAny(normalizedMessage, CANCELLATION_MATCHERS)) {
    return { kind: 'cancelled' };
  }

  if (includesAny(normalizedMessage, INTERRUPTION_MATCHERS)) {
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
}): {
  walletAddress: string;
  connectionKind: WalletConnectionKind;
} {
  return {
    walletAddress: params.address,
    connectionKind: params.connectionKind,
  };
}
