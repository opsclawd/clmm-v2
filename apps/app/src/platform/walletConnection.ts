import type { ConnectionOutcome } from '@clmm/ui';
import type { WalletConnectionKind } from '../state/walletSessionStore';

const CANCELLATION_MATCHERS = [
  'user rejected',
  'declined',
  'cancelled',
  'canceled',
  'not authorized',
  'unauthorized',
  'app not authorized',
] as const;

const INTERRUPTION_MATCHERS = [
  'interrupted',
  'timeout',
  'closed',
  'not found',
  'not ready',
  'not available',
  'already pending',
  'unsupported',
  'unavailable',
] as const;

const CANCELLATION_ERROR_NAMES = [
  'walletrejectionerror',
  'connection_error',
] as const;

const INTERRUPTION_ERROR_NAMES = [
  'configuration_error',
  'network_error',
] as const;

function includesAny(value: string, matchers: readonly string[]): boolean {
  return matchers.some((matcher) => value.includes(matcher));
}

export function mapWalletErrorToOutcome(error: unknown): ConnectionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  const errorName = error instanceof Error
    ? `${error.constructor.name} ${error.name}`
    : '';
  const errorType = (error as { type?: string } | undefined)?.type ?? '';

  if (includesAny(errorName.toLowerCase(), CANCELLATION_ERROR_NAMES)) {
    return { kind: 'cancelled' };
  }
  if (includesAny(errorName.toLowerCase(), INTERRUPTION_ERROR_NAMES)) {
    return { kind: 'interrupted' };
  }
  if (errorType && includesAny(errorType.toLowerCase(), CANCELLATION_ERROR_NAMES)) {
    return { kind: 'cancelled' };
  }
  if (errorType && includesAny(errorType.toLowerCase(), INTERRUPTION_ERROR_NAMES)) {
    return { kind: 'interrupted' };
  }

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
