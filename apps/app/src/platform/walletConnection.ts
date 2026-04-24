import type { ConnectionOutcome } from '@clmm/ui';
import type { WalletConnectionKind } from '../state/walletSessionStore';

const CANCELLATION_MATCHERS = ['user rejected', 'declined', 'cancelled', 'canceled'] as const;
const INTERRUPTION_MATCHERS = ['interrupted', 'timeout', 'closed'] as const;
const RETRY_AUTHORIZATION_MATCHERS = ['not been authorized'] as const;

function includesAny(value: string, matchers: readonly string[]): boolean {
  return matchers.some((matcher) => value.includes(matcher));
}

function getWalletErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null
    ? (error as { code?: unknown }).code
    : undefined;
}

export function mapWalletErrorToOutcome(error: unknown): ConnectionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  const code = getWalletErrorCode(error);

  if (includesAny(normalizedMessage, CANCELLATION_MATCHERS)) {
    return { kind: 'cancelled' };
  }

  if (code === 4100 || code === '4100' || includesAny(normalizedMessage, RETRY_AUTHORIZATION_MATCHERS)) {
    return { kind: 'needs-wallet-retry' };
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
