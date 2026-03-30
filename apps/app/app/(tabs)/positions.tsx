import { useRouter } from 'expo-router';
import { PositionsListScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import { walletSessionStore } from '../../src/state/walletSessionStore.js';

export default function PositionsRoute() {
  const router = useRouter();
  const walletAddress = useStore(walletSessionStore, (state) => state.walletAddress);
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);

  return (
    <PositionsListScreen
      walletAddress={walletAddress}
      platformCapabilities={platformCapabilities}
      onConnectWallet={() => router.push('/connect')}
    />
  );
}
