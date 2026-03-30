import { useRouter } from 'expo-router';
import { WalletSettingsScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function WalletRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const connectionKind = useStore(walletSessionStore, (state) => state.connectionKind);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const disconnect = useStore(walletSessionStore, (state) => state.disconnect);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);

  function handleReconnect() {
    clearOutcome();
    router.push('/connect');
  }

  function handleSwitchWallet() {
    disconnect();
    router.push('/connect');
  }

  return (
    <WalletSettingsScreen
      walletAddress={walletAddress}
      connectionKind={connectionKind}
      platformCapabilities={platformCapabilities}
      onReconnect={handleReconnect}
      onSwitchWallet={handleSwitchWallet}
      onDisconnect={disconnect}
    />
  );
}
