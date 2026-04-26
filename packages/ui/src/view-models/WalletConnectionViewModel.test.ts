import { describe, it, expect } from 'vitest';
import { buildWalletConnectViewModel, buildWalletSettingsViewModel } from './WalletConnectionViewModel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { DiscoveredWallet } from '../components/WalletConnectionUtils.js';

function makeCaps(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  return {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
    ...overrides,
  };
}

const baseExtendedParams = {
  discovery: 'ready' as const,
  discoveredWallets: [] as DiscoveredWallet[],
  fallback: 'none' as const,
  socialEscapeAttempted: false,
};

describe('buildWalletConnectViewModel (extended)', () => {
  it('returns loading screenState when platformCapabilities is null', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: null,
      discovery: 'discovering',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.screenState).toBe('loading');
  });

  it('returns social-webview screenState when fallback is social-webview', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps(),
      discovery: 'timed-out',
      discoveredWallets: [],
      fallback: 'social-webview',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.screenState).toBe('social-webview');
  });

  it('returns standard screenState for normal wallet flow', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps({ nativeWalletAvailable: true }),
      discovery: 'ready',
      discoveredWallets: [{ id: 'phantom', name: 'Phantom', icon: 'https://example.com/icon.png' }],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.screenState).toBe('standard');
    expect(vm.nativeWalletAvailable).toBe(true);
    expect(vm.discoveredWallets).toHaveLength(1);
    expect(vm.discovery).toBe('ready');
  });

  it('passes through discovery and fallback states', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps(),
      discovery: 'discovering',
      discoveredWallets: [],
      fallback: 'desktop-no-wallet',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.discovery).toBe('discovering');
    expect(vm.fallback).toBe('desktop-no-wallet');
  });

  it('passes through socialEscapeAttempted', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps(),
      discovery: 'timed-out',
      discoveredWallets: [],
      fallback: 'social-webview',
      socialEscapeAttempted: true,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.socialEscapeAttempted).toBe(true);
  });

  it('maps connection outcome to outcome display', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps({ nativeWalletAvailable: true }),
      discovery: 'ready',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: { kind: 'failed', reason: 'timeout' },
    });
    expect(vm.outcomeDisplay).not.toBeNull();
    expect(vm.outcomeDisplay!.severity).toBe('error');
  });

  it('computes platform notice', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: makeCaps({ isMobileWeb: true }),
      discovery: 'timed-out',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.platformNotice).not.toBeNull();
    expect(vm.platformNotice!.message).toContain('mobile web');
  });

  it('shows native wallet as available when capability is set', () => {
    const vm = buildWalletConnectViewModel({
      ...baseExtendedParams,
      platformCapabilities: makeCaps({ nativeWalletAvailable: true, nativePushAvailable: true }),
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.nativeWalletAvailable).toBe(true);
    expect(vm.platformNotice).toBeNull();
    expect(vm.outcomeDisplay).toBeNull();
    expect(vm.isConnecting).toBe(false);
  });

  it('passes through isConnecting state', () => {
    const vm = buildWalletConnectViewModel({
      ...baseExtendedParams,
      platformCapabilities: makeCaps({ nativeWalletAvailable: true }),
      isConnecting: true,
      connectionOutcome: null,
    });
    expect(vm.isConnecting).toBe(true);
  });

  it('passes through browserWalletAvailable from capabilities', () => {
    const vm = buildWalletConnectViewModel({
      ...baseExtendedParams,
      platformCapabilities: makeCaps({ browserWalletAvailable: true }),
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.browserWalletAvailable).toBe(true);
  });

  it('defaults browserWalletAvailable to false when capabilities is null', () => {
    const vm = buildWalletConnectViewModel({
      platformCapabilities: null,
      discovery: 'discovering',
      discoveredWallets: [],
      fallback: 'none',
      socialEscapeAttempted: false,
      isConnecting: false,
      connectionOutcome: null,
    });
    expect(vm.browserWalletAvailable).toBe(false);
  });
});

describe('buildWalletSettingsViewModel', () => {
  it('returns connected summary when wallet address and kind are provided', () => {
    const vm = buildWalletSettingsViewModel({
      walletAddress: 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs',
      connectionKind: 'native',
      capabilities: makeCaps({ nativeWalletAvailable: true }),
    });
    expect(vm.connected).toBe(true);
    expect(vm.walletSummary).not.toBeNull();
    expect(vm.walletSummary!.displayAddress).toBe('DRpb...o1Fs');
    expect(vm.walletSummary!.connectionLabel).toBe('Mobile Wallet');
    expect(vm.platformNotice).toBeNull();
  });

  it('returns disconnected state when walletAddress is null', () => {
    const vm = buildWalletSettingsViewModel({
      walletAddress: null,
      connectionKind: null,
      capabilities: makeCaps({ nativeWalletAvailable: true }),
    });
    expect(vm.connected).toBe(false);
    expect(vm.walletSummary).toBeNull();
  });

  it('includes platform notice for degraded platforms', () => {
    const vm = buildWalletSettingsViewModel({
      walletAddress: 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs',
      connectionKind: 'native',
      capabilities: makeCaps({ isMobileWeb: true }),
    });
    expect(vm.connected).toBe(true);
    expect(vm.platformNotice).not.toBeNull();
  });
});
