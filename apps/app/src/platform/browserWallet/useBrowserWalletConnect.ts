import { useCallback, useRef, useState } from 'react';
import { useConnectorKitAdapter } from './connectorKitAdapter';
import type { BrowserWalletConnectResult } from './browserWalletTypes';

const NO_WALLET_MESSAGE = 'No supported browser wallet detected on this device';
const WALLET_POLL_INTERVAL_MS = 100;
const WALLET_POLL_TIMEOUT_MS = 1500;
const SUPPORTED_CHAINS = new Set(['solana:mainnet', 'solana:devnet']);
const MWA_PREFIX = 'mwa:';

function isSolanaBrowserWallet(connector: { id: string; chains: readonly string[] }): boolean {
  if (connector.id.startsWith(MWA_PREFIX)) return false;
  return connector.chains.some((chain) => SUPPORTED_CHAINS.has(chain));
}

function findSupportedWallet(
  connectors: Array<{ id: string; name: string; chains: readonly string[]; ready: boolean }>,
): { id: string; name: string } | null {
  const match = connectors.find((c) => isSolanaBrowserWallet(c) && c.ready);
  return match ? { id: match.id, name: match.name } : null;
}

export function useBrowserWalletConnect() {
  const adapter = useConnectorKitAdapter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const connect = useCallback(async (): Promise<BrowserWalletConnectResult> => {
    setConnecting(true);
    setError(null);

    try {
      const currentAdapter = adapterRef.current;
      let wallet = findSupportedWallet(currentAdapter.connectors);

      if (!wallet) {
        const startTime = Date.now();
        while (Date.now() - startTime < WALLET_POLL_TIMEOUT_MS) {
          await new Promise((resolve) => setTimeout(resolve, WALLET_POLL_INTERVAL_MS));
          const latest = adapterRef.current;
          wallet = findSupportedWallet(latest.connectors);
          if (wallet) break;
        }
      }

      if (!wallet) {
        throw new Error(NO_WALLET_MESSAGE);
      }

      await adapterRef.current.connectWallet(wallet.id as import('@solana/connector').WalletConnectorId);

      const latestAdapter = adapterRef.current;
      const address = latestAdapter.account;
      if (!address) {
        throw new Error('Wallet did not return an account address');
      }

      return { address, walletName: wallet.name };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, []);

  return {
    connect,
    connecting,
    error,
  };
}