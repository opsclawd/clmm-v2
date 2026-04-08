import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import {
  buildWalletOptions,
  getConnectionOutcomeDisplay,
  buildConnectedWalletSummary,
  buildPlatformNotice,
} from '../components/WalletConnectionUtils.js';
import type {
  WalletOption,
  ConnectionOutcome,
  ConnectionOutcomeDisplay,
  PlatformNotice,
  ConnectedWalletSummary,
  WalletOptionKind,
} from '../components/WalletConnectionUtils.js';

// --- Wallet Connect Screen ViewModel ---

export type WalletConnectViewModel = {
  walletOptions: WalletOption[];
  platformNotice: PlatformNotice | null;
  outcomeDisplay: ConnectionOutcomeDisplay | null;
  isConnecting: boolean;
};

export function buildWalletConnectViewModel(params: {
  capabilities: PlatformCapabilities;
  connectionOutcome: ConnectionOutcome | null;
  isConnecting: boolean;
}): WalletConnectViewModel {
  return {
    walletOptions: buildWalletOptions(params.capabilities),
    platformNotice: buildPlatformNotice(params.capabilities),
    outcomeDisplay: params.connectionOutcome
      ? getConnectionOutcomeDisplay(params.connectionOutcome)
      : null,
    isConnecting: params.isConnecting,
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
