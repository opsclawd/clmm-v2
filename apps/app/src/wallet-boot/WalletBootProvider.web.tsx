import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useConnector } from '@solana/connector';
import { walletSessionStore } from '../state/walletSessionStore';
import { deriveWalletBootStatus } from '../state/deriveWalletBootStatus';
import { WalletBootContext } from './walletBootContext';

const WATCHDOG_MS = 1500;

export function WalletBootProvider({ children }: { children: ReactNode }) {
  const { walletStatus, account } = useConnector();
  const hasHydrated = useStore(walletSessionStore, (s) => s.hasHydrated);
  const connectionKind = useStore(walletSessionStore, (s) => s.connectionKind);
  const walletAddress = useStore(walletSessionStore, (s) => s.walletAddress);

  const hasBrowserRestoreCandidate =
    connectionKind === 'browser' && walletAddress != null;

  const hasSeenInflightRef = useRef(false);
  if (walletStatus.status === 'connecting' || walletStatus.status === 'connected') {
    hasSeenInflightRef.current = true;
  }

  const [restoreTimedOut, setRestoreTimedOut] = useState(false);

  useEffect(() => {
    if (!hasHydrated || !hasBrowserRestoreCandidate) {
      setRestoreTimedOut(false);
      return;
    }
    const t = setTimeout(() => setRestoreTimedOut(true), WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [hasHydrated, hasBrowserRestoreCandidate]);

  const status = useMemo(
    () =>
      deriveWalletBootStatus({
        hasHydrated,
        connectionKind,
        walletAddress,
        connectorStatus: walletStatus,
        connectorAccount: account,
        hasSeenConnectorInflight: hasSeenInflightRef.current,
        restoreTimedOut,
      }),
    [hasHydrated, connectionKind, walletAddress, walletStatus, account, restoreTimedOut],
  );

  useEffect(() => {
    if (status === 'disconnected' && connectionKind === 'browser') {
      walletSessionStore.getState().disconnect();
    }
  }, [status, connectionKind]);

  return (
    <WalletBootContext.Provider value={status}>
      {children}
    </WalletBootContext.Provider>
  );
}