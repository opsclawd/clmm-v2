import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from 'zustand';
import type { PlatformCapabilityState } from '@clmm/application/public';
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
import { walletSessionStore } from '../src/state/walletSessionStore';
import { enrollWalletForMonitoring } from '../src/api/wallets';

const NO_WALLET_MESSAGE = 'No supported browser wallet detected on this device';

type FallbackState = 'none' | 'wallet-fallback' | 'social-webview';

function detectFallbackState(
  platformCapabilities: PlatformCapabilityState | null,
  connectError: Error | null,
): FallbackState {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && isSocialAppWebView(navigator.userAgent)) {
    return 'social-webview';
  }

  const noWalletDetected = !platformCapabilities?.browserWalletAvailable;
  const connectThrewNoWallet = connectError?.message === NO_WALLET_MESSAGE;

  if (noWalletDetected || connectThrewNoWallet) {
    const isMobile = Platform.OS === 'web'
      ? /Mobi|Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '')
      : false;
    if (isMobile) {
      return 'wallet-fallback';
    }
  }

  return 'none';
}

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
  const _connectionOutcome = useStore(walletSessionStore, (state) => state.connectionOutcome);
  const isConnecting = useStore(walletSessionStore, (state) => state.isConnecting);
  const setPlatformCapabilities = useStore(walletSessionStore, (state) => state.setPlatformCapabilities);
  const beginConnection = useStore(walletSessionStore, (state) => state.beginConnection);
  const markConnected = useStore(walletSessionStore, (state) => state.markConnected);
  const markOutcome = useStore(walletSessionStore, (state) => state.markOutcome);
  const clearOutcome = useStore(walletSessionStore, (state) => state.clearOutcome);

  const [socialEscapeAttempted, setSocialEscapeAttempted] = useState(false);

  const browserConnect = useBrowserWalletConnect();

  const fallbackState = useMemo(
    () => detectFallbackState(platformCapabilities, browserConnect.error),
    [platformCapabilities, browserConnect.error],
  );

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
      const walletAddress =
        kind === 'browser'
          ? (await browserConnect.connect()).address
          : await walletPlatform.connectNativeWallet();

      markConnected({ walletAddress, connectionKind: kind });
      enrollWalletForMonitoring(walletAddress).catch((err) => {
        console.warn('Wallet enrollment failed:', err);
      });
      navigateRoute({ router, path: '/(tabs)/positions', method: 'replace' });
    } catch (error) {
      handleConnectionError(error);
    }
  }

  function handleOpenPhantom() {
    const url = buildPhantomBrowseUrl(window.location.href);
    void Linking.openURL(url);
  }

  function handleOpenSolflare() {
    const url = buildSolflareBrowseUrl(window.location.href);
    void Linking.openURL(url);
  }

  function handleOpenInBrowser() {
    setSocialEscapeAttempted(true);
    openInExternalBrowser(window.location.href);
  }

  if (!platformCapabilities) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#a1a1aa' }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0a0a0a' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: '#f4f4f5', fontSize: 24, fontWeight: '700' }}>
        Connect Wallet
      </Text>
      <Text style={{ color: '#a1a1aa', fontSize: 16, marginTop: 8 }}>
        Choose a wallet to connect. Only supported wallet options for this device are shown.
      </Text>

      {fallbackState === 'social-webview' ? (
        <View style={{ marginTop: 24 }}>
          <View style={{
            padding: 12,
            backgroundColor: '#422006',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#f59e0b',
            marginBottom: 16,
          }}>
            <Text style={{ color: '#f59e0b', fontSize: 14, fontWeight: '600' }}>
              Social app browsers block wallet extensions.
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
              Open this page in Safari or Chrome to connect your wallet, or use Phantom / Solflare directly below.
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => void handleOpenInBrowser()}
            disabled={socialEscapeAttempted}
            style={{
              padding: 16,
              backgroundColor: socialEscapeAttempted ? '#27272a' : '#18181b',
              borderRadius: 8,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: socialEscapeAttempted ? '#3f3f46' : '#3b82f6',
            }}
          >
            <Text style={{
              color: socialEscapeAttempted ? '#71717a' : '#3b82f6',
              fontSize: 16,
              fontWeight: '600',
            }}>
              Open in Browser
            </Text>
            <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
              Opens this page in your default browser where wallet extensions work.
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: 8 }}>
            <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 8 }}>
              Or open in a wallet browser:
            </Text>
            <TouchableOpacity
              onPress={() => handleOpenPhantom()}
              style={{
                padding: 12,
                backgroundColor: '#18181b',
                borderRadius: 8,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: '#3f3f46',
              }}
            >
              <Text style={{ color: '#ab9ff2', fontSize: 15, fontWeight: '600' }}>Open in Phantom</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleOpenSolflare()}
              style={{
                padding: 12,
                backgroundColor: '#18181b',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#3f3f46',
              }}
            >
              <Text style={{ color: '#fc8748', fontSize: 15, fontWeight: '600' }}>Open in Solflare</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {(platformCapabilities.nativeWalletAvailable || platformCapabilities.browserWalletAvailable) && (
            <View style={{ marginTop: 24 }}>
              {platformCapabilities.nativeWalletAvailable && (
                <TouchableOpacity
                  onPress={() => void handleSelectWallet('native')}
                  disabled={isConnecting}
                  style={{
                    padding: 16,
                    backgroundColor: '#18181b',
                    borderRadius: 8,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#3f3f46',
                  }}
                >
                  <Text style={{ color: '#f4f4f5', fontSize: 16, fontWeight: '600' }}>
                    Connect Mobile Wallet
                  </Text>
                  <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
                    Sign transactions with your mobile wallet app.
                  </Text>
                </TouchableOpacity>
              )}
              {platformCapabilities.browserWalletAvailable && (
                <TouchableOpacity
                  onPress={() => void handleSelectWallet('browser')}
                  disabled={isConnecting}
                  style={{
                    padding: 16,
                    backgroundColor: '#18181b',
                    borderRadius: 8,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#3f3f46',
                  }}
                >
                  <Text style={{ color: '#f4f4f5', fontSize: 16, fontWeight: '600' }}>
                    Connect Browser Wallet
                  </Text>
                  <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
                    Sign transactions with your browser wallet extension.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {fallbackState === 'wallet-fallback' && (
            <View style={{ marginTop: 16 }}>
              {!platformCapabilities.nativeWalletAvailable && !platformCapabilities.browserWalletAvailable && (
                <View style={{
                  padding: 12,
                  backgroundColor: '#422006',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#f59e0b',
                  marginBottom: 12,
                }}>
                  <Text style={{ color: '#f59e0b', fontSize: 14, fontWeight: '600' }}>
                    No wallet extension detected in this browser.
                  </Text>
                  <Text style={{ color: '#a1a1aa', fontSize: 13, marginTop: 4 }}>
                    You can open this page directly in a wallet browser, or switch to a desktop browser with an installed extension.
                  </Text>
                </View>
              )}
              <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 8 }}>
                Open in a wallet browser:
              </Text>
              <TouchableOpacity
                onPress={() => handleOpenPhantom()}
                style={{
                  padding: 12,
                  backgroundColor: '#18181b',
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: '#3f3f46',
                }}
              >
                <Text style={{ color: '#ab9ff2', fontSize: 15, fontWeight: '600' }}>Open in Phantom</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleOpenSolflare()}
                style={{
                  padding: 12,
                  backgroundColor: '#18181b',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#3f3f46',
                }}
              >
                <Text style={{ color: '#fc8748', fontSize: 15, fontWeight: '600' }}>Open in Solflare</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {isConnecting && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ color: '#a1a1aa', fontSize: 14 }}>Connecting...</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => { clearOutcome(); router.back(); }}
        style={{ marginTop: 16, alignSelf: 'center', padding: 8 }}
      >
        <Text style={{ color: '#71717a', fontSize: 14 }}>Go Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}