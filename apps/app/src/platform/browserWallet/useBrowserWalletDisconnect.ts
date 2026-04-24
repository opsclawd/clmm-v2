import { useCallback, useRef, useState } from 'react';
import { useConnectorKitAdapter } from './connectorKitAdapter';

export function useBrowserWalletDisconnect() {
  const adapter = useConnectorKitAdapter();
  const [disconnecting, setDisconnecting] = useState(false);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  const disconnect = useCallback(async (): Promise<void> => {
    const currentAdapter = adapterRef.current;
    if (!currentAdapter.isConnected) return;

    setDisconnecting(true);
    try {
      await currentAdapter.disconnectWallet();
    } catch {
      // best-effort: swallow disconnect failures
    } finally {
      setDisconnecting(false);
    }
  }, []);

  return {
    disconnect,
    disconnecting,
  };
}