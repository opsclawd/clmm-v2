import { useEffect, useMemo, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useStore } from 'zustand';
import type { PlatformCapabilityState } from '@clmm/application/public';
import {
  WalletConnectScreen,
  buildWalletConnectViewModel,
} from '@clmm/ui';
import type { FallbackState, WalletDiscoveryState, DiscoveredWallet, WalletConnectActions } from '@clmm/ui';
import { platformCapabilityAdapter, walletPlatform } from '../src/composition/index';
import { useBrowserWalletConnect } from '../src/platform/browserWallet/index';
import {
  buildPhantomBrowseUrl,
  buildSolflareBrowseUrl,
  isSocialAppWebView,
  openInExternalBrowser,
} from '../src/platform/browserWallet/walletDeepLinks';
import { mapWalletErrorToOutcome } from '../src/platform/walletConnection';
import { navigateRoute } from '../src/platform/webNavigation';
import { parseReturnTo } from '../src/wallet-boot/parseReturnTo';
import { walletSessionStore } from '../src/state/walletSessionStore';
import { enrollWalletForMonitoring } from '../src/api/wallets';

const NO_WALLET_MESSAGE = 'No supported browser wallet detected on this device';
const WALLET_DISCOVERY_TIMEOUT_MS = 2000;

function detectFallbackState(
  platformCapabilities: PlatformCapabilityState | null,
  connectError: Error | null,
): FallbackState {
  if (Platform.OS !== 'web') {
    return 'none';
  }

  if (typeof navigator !== 'undefined' && isSocialAppWebView(navigator.userAgent)) {
    return 'social-webview';
  }

  const noWalletDetected = !platformCapabilities?.browserWalletAvailable;
  const connectThrewNoWallet = connectError?.message === NO_WALLET_MESSAGE;

  if (noWalletDetected || connectThrewNoWallet) {
    const isMobile = /Mobi|Android|iPad/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
    if (isMobile) {
      return 'wallet-fallback';
    }
    return 'desktop-no-wallet';
  }

  return 'none';
}

export default function ConnectRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = useMemo(() => parseReturnTo(params.returnTo), [params.returnTo]);
  const platformCapabilities = useStore(walletSessionStore, (s) => s.platformCapabilities);
  const connectionOutcome = useStore(walletSessionStore, (s) => s.connectionOutcome);
  const isConnecting = useStore(walletSessionStore, (s) => s.isConnecting);
  const setPlatformCapabilities = useStore(walletSessionStore, (s) => s.setPlatformCapabilities);
  const beginConnection = useStore(walletSessionStore, (s) => s.beginConnection);
  const markConnected = useStore(walletSessionStore, (s) => s.markConnected);
  const markOutcome = useStore(walletSessionStore, (s) => s.markOutcome);
  const clearOutcome = useStore(walletSessionStore, (s) => s.clearOutcome);

  const [socialEscapeAttempted, setSocialEscapeAttempted] = useState(false);
  const [discoveryTimedOut, setDiscoveryTimedOut] = useState(false);

  const browserConnect = useBrowserWalletConnect();
  const walletCount = browserConnect.wallets.length;

  const discovery: WalletDiscoveryState = useMemo(() => {
    if (walletCount > 0) return 'ready';
    if (discoveryTimedOut) return 'timed-out';
    return 'discovering';
  }, [walletCount, discoveryTimedOut]);

  useEffect(() => {
    if (walletCount > 0 || discoveryTimedOut) return;
    const timer = setTimeout(() => setDiscoveryTimedOut(true), WALLET_DISCOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [walletCount, discoveryTimedOut]);

  const fallback = useMemo(
    () => detectFallbackState(platformCapabilities, browserConnect.error),
    [platformCapabilities, browserConnect.error],
  );

  const discoveredWallets: DiscoveredWallet[] = useMemo(
    () => browserConnect.wallets.map((w) => ({ id: w.id, name: w.name, icon: w.icon })),
    [browserConnect.wallets],
  );

  useEffect(() => {
    let active = true;
    void platformCapabilityAdapter
      .getCapabilities()
      .then((caps) => { if (active) setPlatformCapabilities(caps); })
      .catch(() => {
        if (active) setPlatformCapabilities({
          nativePushAvailable: false,
          browserNotificationAvailable: false,
          nativeWalletAvailable: false,
          browserWalletAvailable: false,
          isMobileWeb: false,
        });
      });
    return () => { active = false; };
  }, [setPlatformCapabilities]);

  function handleConnectionError(error: unknown) {
    const outcome = mapWalletErrorToOutcome(error);
    if (outcome.kind === 'connected') {
      markOutcome({ kind: 'failed', reason: 'Unexpected connected error outcome' });
      return;
    }
    markOutcome(outcome);
  }

  const vm = buildWalletConnectViewModel({
    platformCapabilities,
    discovery,
    discoveredWallets,
    fallback,
    socialEscapeAttempted,
    isConnecting,
    connectionOutcome,
  });

  const actions: WalletConnectActions = useMemo(() => ({
    onSelectNative: () => {
      beginConnection();
      void walletPlatform.connectNativeWallet()
        .then((address) => {
          markConnected({ walletAddress: address, connectionKind: 'native' });
          void enrollWalletForMonitoring(address);
          navigateRoute({ router, path: returnTo, method: 'replace' });
        })
        .catch(handleConnectionError);
    },
    onSelectDiscoveredWallet: (walletId: string) => {
      beginConnection();
      void browserConnect.connect(walletId)
        .then(({ address }) => {
          markConnected({ walletAddress: address, connectionKind: 'browser' });
          void enrollWalletForMonitoring(address);
          navigateRoute({ router, path: returnTo, method: 'replace' });
        })
        .catch(handleConnectionError);
    },
    onConnectDefaultBrowser: () => {
      beginConnection();
      void browserConnect.connect()
        .then(({ address }) => {
          markConnected({ walletAddress: address, connectionKind: 'browser' });
          void enrollWalletForMonitoring(address);
          navigateRoute({ router, path: returnTo, method: 'replace' });
        })
        .catch(handleConnectionError);
    },
    onOpenPhantom: () => {
      if (typeof window !== 'undefined') {
        const url = buildPhantomBrowseUrl(window.location.href);
        void Linking.openURL(url);
      }
    },
    onOpenSolflare: () => {
      if (typeof window !== 'undefined') {
        const url = buildSolflareBrowseUrl(window.location.href);
        void Linking.openURL(url);
      }
    },
    onOpenInBrowser: () => {
      setSocialEscapeAttempted(true);
      if (typeof window !== 'undefined') {
        openInExternalBrowser(window.location.href);
      }
    },
    onGoBack: () => {
      clearOutcome();
      router.back();
    },
  }), [router, returnTo, browserConnect, beginConnection, markConnected, markOutcome, clearOutcome, platformCapabilities, discovery, discoveredWallets, fallback, socialEscapeAttempted, isConnecting, connectionOutcome]);

  return <WalletConnectScreen vm={vm} actions={actions} />;
}
