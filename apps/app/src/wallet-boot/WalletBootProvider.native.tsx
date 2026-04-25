import { useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { walletSessionStore } from '../state/walletSessionStore';
import { deriveWalletBootStatus } from '../state/deriveWalletBootStatus';
import { WalletBootContext } from './walletBootContext';

export function WalletBootProvider({ children }: { children: ReactNode }) {
  const hasHydrated = useStore(walletSessionStore, (s) => s.hasHydrated);
  const connectionKind = useStore(walletSessionStore, (s) => s.connectionKind);
  const walletAddress = useStore(walletSessionStore, (s) => s.walletAddress);
  const browserRestoreAddress = useStore(walletSessionStore, (s) => s.browserRestoreAddress);

  const status = useMemo(
    () =>
      deriveWalletBootStatus({
        hasHydrated,
        connectionKind,
        walletAddress,
        browserRestoreAddress,
        connectorStatus: { status: 'disconnected' },
        connectorAccount: null,
        hasSeenConnectorInflight: true,
        restoreTimedOut: true,
      }),
    [hasHydrated, connectionKind, walletAddress, browserRestoreAddress],
  );

  return (
    <WalletBootContext.Provider value={status}>
      {children}
    </WalletBootContext.Provider>
  );
}