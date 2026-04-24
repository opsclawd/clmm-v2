import { useConnector } from '@solana/connector';
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
  const snapshot = useConnector();

  return {
    connectors: snapshot.connectors,
    connectWallet: snapshot.connectWallet,
    disconnectWallet: snapshot.disconnectWallet,
    isConnected: snapshot.isConnected,
    isConnecting: snapshot.isConnecting,
    account: snapshot.account,
    walletError: snapshot.walletError,
    walletStatus: snapshot.walletStatus,
  };
}