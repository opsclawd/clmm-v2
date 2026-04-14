import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { WalletConnectScreen } from '@clmm/ui';
import { useStore } from 'zustand';
import type { PlatformCapabilityState } from '@clmm/application/public';
import { platformCapabilityAdapter, walletPlatform } from '../src/composition/index';
import { connectBrowserWallet } from '../src/platform/browserWallet';
import { mapWalletErrorToOutcome } from '../src/platform/walletConnection';
import { walletSessionStore } from '../src/state/walletSessionStore';
import { enrollWalletForMonitoring } from '../src/api/wallets';

const FALLBACK_PLATFORM_CAPABILITIES: PlatformCapabilityState = {
  nativePushAvailable: false,
  browserNotificationAvailable: false,
  nativeWalletAvailable: false,
  browserWalletAvailable: false,
  isMobileWeb: false,
};

export default function ConnectRoute() {
  const router = useRouter();
  const platformCapabilities = useStore(walletSessionStore, (state) => state.platformCapabilities);
  const connectionOutcome = useStore(walletSessionStore, (state) => state.connectionOutcome);
  const isConnecting = useStore(walletSessionStore, (state) => state.isConnecting);
  const setPlatformCapabilities = useStore(walletSessionStore, (state) => state.setPlatformCapabilities);
  const beginConnection = useStore(walletSessionStore, (state) => state.beginConnection);
  const markConnected = useStore(walletSessionStore, (state) => state.markConnected);
  const markOutcome = useStore(walletSessionStore, (state) => state.markOutcome);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);

  function handleConnectionError(error: unknown) {
    const outcome = mapWalletErrorToOutcome(error);
    if (outcome.kind === 'connected') {
      markOutcome({ kind: 'failed', reason: 'Unexpected connected error outcome' });
      return;
    }

    markOutcome(outcome);
  }

  useEffect(() => {
    let active = true;

    void platformCapabilityAdapter
      .getCapabilities()
      .then((capabilities) => {
        if (!active) {
          return;
        }

        setPlatformCapabilities(capabilities);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setPlatformCapabilities(FALLBACK_PLATFORM_CAPABILITIES);
        handleConnectionError(error);
      });

    return () => {
      active = false;
    };
  }, [markOutcome, setPlatformCapabilities]);

  async function handleSelectWallet(kind: 'native' | 'browser') {
    beginConnection();

    try {
      const browserWalletWindow =
        typeof window === 'undefined' ? undefined : { solana: Reflect.get(window, 'solana') as unknown };
      const walletAddress =
        kind === 'browser'
          ? await connectBrowserWallet(browserWalletWindow)
          : await walletPlatform.connectNativeWallet();

      markConnected({ walletAddress, connectionKind: kind });
      enrollWalletForMonitoring(walletAddress).catch((err) => {
        console.warn('Wallet enrollment failed (will retry on next connect):', err);
      });
      
      // Immediate navigation - router.replace should work since we're in the same JS context
      router.replace('/(tabs)/positions');
    } catch (error) {
      handleConnectionError(error);
    }
  }

  return (
    <WalletConnectScreen
      platformCapabilities={platformCapabilities}
      connectionOutcome={connectionOutcome}
      isConnecting={isConnecting}
      onSelectWallet={(kind: 'native' | 'browser') => {
        void handleSelectWallet(kind);
      }}
      onGoBack={() => {
        clearOutcome();
        router.back();
      }}
    />
  );
}
