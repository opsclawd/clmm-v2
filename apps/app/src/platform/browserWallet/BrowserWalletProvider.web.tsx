import type { ReactNode } from 'react';
import { AppProvider, getDefaultConfig, getDefaultMobileConfig } from '@solana/connector';

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

export function BrowserWalletProvider({ children }: { children: ReactNode }) {
  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobileConfig}>
      {children}
    </AppProvider>
  );
}