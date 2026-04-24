import { useRouter } from 'expo-router';
import { WalletSettingsScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { useBrowserWalletDisconnect } from '../../src/platform/browserWallet/index';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';

export default function WalletRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const connectionKind = useStore(walletSessionStore, (state) => state.connectionKind);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const disconnect = useStore(walletSessionStore, (state) => state.disconnect);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);
  const browserDisconnect = useBrowserWalletDisconnect();

  function handleReconnect() {
    clearOutcome();
    navigateRoute({ router, path: '/connect', method: 'push' });
  }

  function handleSwitchWallet() {
    disconnect();
    navigateRoute({ router, path: '/connect', method: 'push' });
  }

  async function handleDisconnect() {
    if (connectionKind === 'browser') {
      try {
        await browserDisconnect.disconnect();
      } catch {
        // Best-effort. App session cleanup still proceeds.
      }
    }

    disconnect();
  }

  return (
    <WalletSettingsScreen
      walletAddress={walletAddress}
      connectionKind={connectionKind}
      platformCapabilities={platformCapabilities}
      onReconnect={handleReconnect}
      onSwitchWallet={handleSwitchWallet}
      onDisconnect={() => {
        void handleDisconnect();
      }}
    />
  );
}
