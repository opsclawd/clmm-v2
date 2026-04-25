import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AppProvider, getDefaultConfig, getDefaultMobileConfig, useConnector } from '@solana/connector';
import { walletSessionStore } from '../../state/walletSessionStore';

const connectorConfig = getDefaultConfig({
  appName: 'CLMM V2',
  appUrl: 'https://clmm.v2.app',
  autoConnect: true,
  enableMobile: true,
  network: 'mainnet',
});

const mobileConfig = getDefaultMobileConfig({
  appName: 'CLMM V2',
  appUrl: 'https://clmm.v2.app',
  network: 'mainnet',
});

function BrowserWalletSessionSync() {
  const { isConnected, account } = useConnector();

  useEffect(() => {
    const store = walletSessionStore.getState();

    if (isConnected && account) {
      if (store.walletAddress === account && store.connectionKind === 'browser') return;
      store.markConnected({ walletAddress: account, connectionKind: 'browser' });
    } else if (store.connectionKind === 'browser' && store.walletAddress) {
      store.disconnect();
    }
  }, [isConnected, account]);

  return null;
}

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
      <BrowserWalletSessionSync />
      {children}
    </AppProvider>
  );
}