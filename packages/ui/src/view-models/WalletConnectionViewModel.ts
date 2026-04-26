import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import {
  getConnectionOutcomeDisplay,
  buildConnectedWalletSummary,
  buildPlatformNotice,
} from '../components/WalletConnectionUtils.js';
import type {
  ConnectionOutcome,
  ConnectionOutcomeDisplay,
  PlatformNotice,
  ConnectedWalletSummary,
  WalletOptionKind,
  FallbackState,
  WalletDiscoveryState,
  DiscoveredWallet,
} from '../components/WalletConnectionUtils.js';

// --- Wallet Connect Screen ViewModel ---

export type WalletConnectViewModel = {
  screenState: 'loading' | 'social-webview' | 'standard';
  nativeWalletAvailable: boolean;
  discovery: WalletDiscoveryState;
  discoveredWallets: DiscoveredWallet[];
  fallback: FallbackState;
  socialEscapeAttempted: boolean;
  isConnecting: boolean;
  outcomeDisplay: ConnectionOutcomeDisplay | null;
  platformNotice: PlatformNotice | null;
};

export function buildWalletConnectViewModel(params: {
  platformCapabilities: PlatformCapabilities | null;
  discovery: WalletDiscoveryState;
  discoveredWallets: DiscoveredWallet[];
  fallback: FallbackState;
  socialEscapeAttempted: boolean;
  isConnecting: boolean;
  connectionOutcome: ConnectionOutcome | null;
}): WalletConnectViewModel {
  const caps = params.platformCapabilities ?? {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
  };

  const screenState: WalletConnectViewModel['screenState'] =
    !params.platformCapabilities ? 'loading'
    : params.fallback === 'social-webview' ? 'social-webview'
    : 'standard';

  return {
    screenState,
    nativeWalletAvailable: caps.nativeWalletAvailable,
    discovery: params.discovery,
    discoveredWallets: params.discoveredWallets,
    fallback: params.fallback,
    socialEscapeAttempted: params.socialEscapeAttempted,
    isConnecting: params.isConnecting,
    outcomeDisplay: params.connectionOutcome
      ? getConnectionOutcomeDisplay(params.connectionOutcome)
      : null,
    platformNotice: buildPlatformNotice(caps),
  };
}

// --- Wallet Settings Screen ViewModel ---

export type WalletSettingsViewModel = {
  connected: boolean;
  walletSummary: ConnectedWalletSummary | null;
  platformNotice: PlatformNotice | null;
};

export function buildWalletSettingsViewModel(params: {
  walletAddress: string | null;
  connectionKind: WalletOptionKind | null;
  capabilities: PlatformCapabilities;
}): WalletSettingsViewModel {
  if (params.walletAddress !== null && params.connectionKind !== null) {
    return {
      connected: true,
      walletSummary: buildConnectedWalletSummary({
        walletAddress: params.walletAddress,
        connectionKind: params.connectionKind,
      }),
      platformNotice: buildPlatformNotice(params.capabilities),
    };
  }

  return {
    connected: false,
    walletSummary: null,
    platformNotice: buildPlatformNotice(params.capabilities),
  };
}
