import type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

export function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export type WalletOptionKind = 'native' | 'browser';

export type WalletOption = {
  kind: WalletOptionKind;
  label: string;
  description: string;
};

export function buildWalletOptions(caps: PlatformCapabilities): WalletOption[] {
  const options: WalletOption[] = [];

  if (caps.nativeWalletAvailable) {
    options.push({
      kind: 'native',
      label: 'Connect Mobile Wallet',
      description: 'Sign transactions with your mobile wallet app.',
    });
  }

  if (caps.browserWalletAvailable) {
    options.push({
      kind: 'browser',
      label: 'Connect Browser Wallet',
      description: 'Sign transactions with your browser wallet extension. You can review positions and execute exits from desktop.',
    });
  }

  return options;
}

export type ConnectionOutcome =
  | { kind: 'connected' }
  | { kind: 'failed'; reason: string }
  | { kind: 'cancelled' }
  | { kind: 'interrupted' };

export type ConnectionOutcomeDisplay = {
  title: string;
  detail: string;
  severity: 'success' | 'error' | 'info' | 'warning';
};

export function getConnectionOutcomeDisplay(outcome: ConnectionOutcome): ConnectionOutcomeDisplay {
  switch (outcome.kind) {
    case 'connected':
      return {
        title: 'Wallet Connected',
        detail: 'Your wallet is connected. Viewing supported positions.',
        severity: 'success',
      };
    case 'failed':
      return {
        title: 'Connection Failed',
        detail: `Could not connect to wallet: ${outcome.reason}. Please try again.`,
        severity: 'error',
      };
    case 'cancelled':
      return {
        title: 'Connection Cancelled',
        detail: 'You cancelled the wallet connection. Connect when you are ready.',
        severity: 'info',
      };
    case 'interrupted':
      return {
        title: 'Connection Interrupted',
        detail: 'The connection was interrupted before completing. You have returned to the app — please try connecting again.',
        severity: 'warning',
      };
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

export type ConnectedWalletSummary = {
  displayAddress: string;
  connectionLabel: string;
};

export function buildConnectedWalletSummary(params: {
  walletAddress: string;
  connectionKind: WalletOptionKind;
}): ConnectedWalletSummary {
  return {
    displayAddress: truncateAddress(params.walletAddress),
    connectionLabel: params.connectionKind === 'native'
      ? 'Mobile Wallet'
      : 'Browser Wallet',
  };
}

export type PlatformNotice = {
  message: string;
  severity: 'warning' | 'error';
};

export function buildPlatformNotice(caps: PlatformCapabilities): PlatformNotice | null {
  const hasAnyWallet = caps.nativeWalletAvailable || caps.browserWalletAvailable;

  if (hasAnyWallet) return null;

  if (caps.isMobileWeb) {
    return {
      message: 'You are on mobile web. Wallet signing is not available in this browser. You can view positions and alerts, but cannot execute exits. Use the native app or a desktop browser with a wallet extension for full functionality.',
      severity: 'warning',
    };
  }

  return {
    message: 'No supported wallet detected on this device. Install a compatible Solana wallet to connect.',
    severity: 'error',
  };
}
