import { useConnector, useTransactionSigner } from '@solana/connector/react';
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

export function useConnectorKitAdapter(): ConnectorKitAdapterResult {
  const snapshot = useConnector();
  const { signer } = useTransactionSigner();

  return {
    connectors: snapshot.connectors,
    connectWallet: snapshot.connectWallet,
    disconnectWallet: snapshot.disconnectWallet,
    isConnected: snapshot.isConnected,
    isConnecting: snapshot.isConnecting,
    account: snapshot.account,
    walletError: snapshot.walletError,
    walletStatus: snapshot.walletStatus,
    signTransactionBytes: async (payload: Uint8Array): Promise<Uint8Array> => {
      if (!signer) {
        throw new Error('No wallet account is connected');
      }
      const signed = await signer.signTransaction(payload);
      if (signed instanceof Uint8Array) {
        return signed;
      }
      if (signed instanceof ArrayBuffer || ArrayBuffer.isView(signed)) {
        if (signed instanceof ArrayBuffer) {
          return new Uint8Array(signed);
        }
        return new Uint8Array(signed.buffer, signed.byteOffset, signed.byteLength);
      }
      if (typeof signed === 'object' && signed !== null && 'serialize' in signed) {
        return (signed as { serialize: () => Uint8Array }).serialize();
      }
      throw new Error('Signer returned unsupported transaction format');
    },
  };
}