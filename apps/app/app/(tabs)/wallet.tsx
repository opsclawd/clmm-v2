import { useRouter } from 'expo-router';
import { WalletSettingsScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { disconnectBrowserWallet } from '../../src/platform/browserWallet';
import { navigateRoute } from '../../src/platform/webNavigation';
import { walletSessionStore } from '../../src/state/walletSessionStore';

export default function WalletRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const connectionKind = useStore(walletSessionStore, (state) => state.connectionKind);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const disconnect = useStore(walletSessionStore, (state) => state.disconnect);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);

  function handleReconnect() {
    clearOutcome();
    navigateRoute({ router, path: '/connect', method: 'push' });
  }

  function handleSwitchWallet() {
    disconnect();
    navigateRoute({ router, path: '/connect', method: 'push' });
  }

  async function handleDisconnect() {
    if (connectionKind === 'browser' && typeof window !== 'undefined') {
      try {
        await disconnectBrowserWallet({ solana: Reflect.get(window, 'solana') });
      } catch {
        // Browser wallet disconnect is best-effort; always clear local session.
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
