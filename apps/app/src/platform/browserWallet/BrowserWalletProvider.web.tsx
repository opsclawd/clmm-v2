import { useEffect, useState, type ReactNode } from 'react';
import { AppProvider, getDefaultConfig, getDefaultMobileConfig, useConnector } from '@solana/connector';
import { walletSessionStore } from '../../state/walletSessionStore';
import { WalletBootProvider } from '../../wallet-boot/WalletBootProvider.web';

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
    if (isConnected && account) {
      const store = walletSessionStore.getState();
      if (store.walletAddress === account && store.connectionKind === 'browser') return;
      store.markConnected({ walletAddress: account, connectionKind: 'browser' });
    }
  }, [isConnected, account]);

  return null;
}

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return null;
  }

  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
      <BrowserWalletSessionSync />
      <WalletBootProvider>{children}</WalletBootProvider>
    </AppProvider>
  );
}