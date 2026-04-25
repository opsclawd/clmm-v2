/* eslint-disable @typescript-eslint/require-await */
import type { ConnectOptions, WalletConnectorId, WalletStatus } from '@solana/connector';

export type ConnectorKitAdapterResult = {
  connectors: Array<{
    id: WalletConnectorId;
    name: string;
    icon: string;
    ready: boolean;
    chains: readonly string[];
    features: readonly string[];
  }>;
  connectWallet: (connectorId: WalletConnectorId, options?: ConnectOptions) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  isConnected: boolean;
  isConnecting: boolean;
  account: string | null;
  walletError: Error | null;
  walletStatus: WalletStatus;
  signTransactionBytes: (payload: Uint8Array) => Promise<Uint8Array>;
};

const UNRESOLVED_STUB: ConnectorKitAdapterResult = {
  connectors: [],
  connectWallet: async () => {
    throw new Error('Browser wallet is not available on this platform');
  },
  disconnectWallet: async () => {},
  isConnected: false,
  isConnecting: false,
  account: null,
  walletError: null,
  walletStatus: 'disconnected' as unknown as WalletStatus,
  signTransactionBytes: async () => {
    throw new Error('Browser wallet is not available on this platform');
  },
};

export function useConnectorKitAdapter(): ConnectorKitAdapterResult {
  return UNRESOLVED_STUB;
}