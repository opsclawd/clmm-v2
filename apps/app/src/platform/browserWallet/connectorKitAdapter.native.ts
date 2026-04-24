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
};

export function useConnectorKitAdapter(): ConnectorKitAdapterResult {
  throw new Error('Browser wallet is not available on native platforms');
}