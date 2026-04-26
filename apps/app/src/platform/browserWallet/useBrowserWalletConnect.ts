import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectorKitAdapter } from './connectorKitAdapter';
import type { BrowserWalletConnectResult, BrowserWalletOption } from './browserWalletTypes';

const NO_WALLET_MESSAGE = 'No supported browser wallet detected on this device';
const WALLET_POLL_INTERVAL_MS = 100;
const WALLET_POLL_TIMEOUT_MS = 1500;
const ACCOUNT_POLL_TIMEOUT_MS = 2000;
const SUPPORTED_CHAINS = new Set(['solana:mainnet', 'solana:devnet']);

function isSolanaBrowserWallet(connector: { id: string; chains: readonly string[] }): boolean {
  return connector.chains.some((chain) => SUPPORTED_CHAINS.has(chain));
}

function getSupportedWallets(
  connectors: Array<{ id: string; name: string; icon: string; chains: readonly string[]; ready: boolean }>,
): BrowserWalletOption[] {
  return connectors
    .filter((c) => isSolanaBrowserWallet(c) && c.ready)
    .map((c) => ({ id: c.id, name: c.name, icon: c.icon, ready: c.ready, chains: c.chains }));
}

export function useBrowserWalletConnect() {
  const adapter = useConnectorKitAdapter();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const wallets = useMemo(
    () => getSupportedWallets(adapter.connectors),
    [adapter.connectors],
  );

  const connect = useCallback(async (walletId?: string): Promise<BrowserWalletConnectResult> => {
    setConnecting(true);
    setError(null);

    try {
      const currentAdapter = adapterRef.current;
      let supported = getSupportedWallets(currentAdapter.connectors);

      if (supported.length === 0) {
        const startTime = Date.now();
        while (Date.now() - startTime < WALLET_POLL_TIMEOUT_MS) {
          await new Promise((resolve) => setTimeout(resolve, WALLET_POLL_INTERVAL_MS));
          const latest = adapterRef.current;
          supported = getSupportedWallets(latest.connectors);
          if (supported.length > 0) break;
        }
      }

      if (supported.length === 0) {
        throw new Error(NO_WALLET_MESSAGE);
      }

      let targetWallet: BrowserWalletOption;
      if (walletId) {
        const found = supported.find((w) => w.id === walletId);
        if (!found) {
          throw new Error(`Wallet "${walletId}" not found or not ready`);
        }
        targetWallet = found;
      } else {
        targetWallet = supported[0]!;
      }

      await adapterRef.current.connectWallet(targetWallet.id as import('@solana/connector').WalletConnectorId);

      let address = adapterRef.current.account;
      if (!address) {
        const startTime = Date.now();
        while (Date.now() - startTime < ACCOUNT_POLL_TIMEOUT_MS) {
          await new Promise((resolve) => setTimeout(resolve, WALLET_POLL_INTERVAL_MS));
          address = adapterRef.current.account;
          if (address) break;
        }
      }

      if (!address) {
        throw new Error('Wallet did not return an account address');
      }

      return { address, walletName: targetWallet.name };
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
    wallets,
  };
}