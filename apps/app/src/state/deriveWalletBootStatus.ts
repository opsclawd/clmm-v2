import type { WalletStatus } from '@solana/connector';
import type { WalletConnectionKind } from './walletSessionStore';

export type WalletBootStatus =
  | 'hydrating-storage'
  | 'checking-browser-wallet'
  | 'connected'
  | 'disconnected';

export type DeriveWalletBootStatusInput = {
  hasHydrated: boolean;
  connectionKind: WalletConnectionKind | null;
  walletAddress: string | null;
  browserRestoreAddress: string | null;
  connectorStatus: WalletStatus;
  connectorAccount: string | null;
  hasSeenConnectorInflight: boolean;
  restoreTimedOut: boolean;
};

export function deriveWalletBootStatus(input: DeriveWalletBootStatusInput): WalletBootStatus {
  if (!input.hasHydrated) return 'hydrating-storage';

  if (input.connectionKind === 'native' && input.walletAddress != null) {
    return 'connected';
  }

  const hasBrowserRestoreCandidate =
    input.connectionKind === 'browser' && input.browserRestoreAddress != null;

  if (hasBrowserRestoreCandidate) {
    if (
      input.connectorStatus.status === 'connected' &&
      input.connectorAccount === input.browserRestoreAddress
    ) {
      return 'connected';
    }
    if (
      input.connectorStatus.status === 'connected' &&
      input.connectorAccount != null &&
      input.connectorAccount !== input.browserRestoreAddress
    ) {
      return 'disconnected';
    }
    if (input.connectorStatus.status === 'error') {
      return 'disconnected';
    }
    if (input.connectorStatus.status === 'disconnected' && input.hasSeenConnectorInflight) {
      return 'disconnected';
    }
    if (input.restoreTimedOut) return 'disconnected';
    return 'checking-browser-wallet';
  }

  return 'disconnected';
}