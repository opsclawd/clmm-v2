import { useState } from 'react';
import { View, Text } from 'react-native';
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
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  function handleReconnect() {
    clearOutcome();
    navigateRoute({ router, path: '/connect', method: 'push' });
  }

  async function handleSwitchWallet() {
    setDisconnectError(null);
    if (connectionKind === 'browser') {
      try {
        await browserDisconnect.disconnect();
      } catch (err) {
        setDisconnectError(err instanceof Error ? err.message : 'Failed to disconnect wallet');
        return;
      }
    }
    disconnect();
    navigateRoute({ router, path: '/connect', method: 'push' });
  }

  async function handleDisconnect() {
    setDisconnectError(null);
    if (connectionKind === 'browser') {
      try {
        await browserDisconnect.disconnect();
      } catch (err) {
        setDisconnectError(err instanceof Error ? err.message : 'Failed to disconnect wallet');
        return;
      }
    }

    disconnect();
  }

  return (
    <>
      {disconnectError ? (
        <View style={{ padding: 12, backgroundColor: '#450a0a', borderRadius: 8, borderWidth: 1, borderColor: '#dc2626', margin: 16 }}>
          <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>
            Could not disconnect wallet
          </Text>
          <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
            {disconnectError}. The wallet session may still be active.
          </Text>
        </View>
      ) : null}
      <WalletSettingsScreen
        walletAddress={walletAddress}
        connectionKind={connectionKind}
        platformCapabilities={platformCapabilities}
        onReconnect={handleReconnect}
        onSwitchWallet={() => { void handleSwitchWallet(); }}
        onDisconnect={() => {
          void handleDisconnect();
        }}
      />
    </>
  );
}
