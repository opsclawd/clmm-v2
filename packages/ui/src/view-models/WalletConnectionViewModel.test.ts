import { describe, it, expect } from 'vitest';
import { buildWalletConnectViewModel, buildWalletSettingsViewModel } from './WalletConnectionViewModel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { ConnectionOutcome } from '../components/WalletConnectionUtils.js';

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

describe('buildWalletConnectViewModel', () => {
  it('shows native wallet option on React Native mobile', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ nativeWalletAvailable: true, nativePushAvailable: true }),
      connectionOutcome: null,
      isConnecting: false,
    });
    expect(vm.walletOptions).toHaveLength(1);
    expect(vm.walletOptions[0]!.kind).toBe('native');
    expect(vm.platformNotice).toBeNull();
    expect(vm.outcomeDisplay).toBeNull();
    expect(vm.isConnecting).toBe(false);
  });

  it('shows browser wallet option on desktop PWA', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ browserWalletAvailable: true, browserNotificationAvailable: true }),
      connectionOutcome: null,
      isConnecting: false,
    });
    expect(vm.walletOptions).toHaveLength(1);
    expect(vm.walletOptions[0]!.kind).toBe('browser');
  });

  it('shows degraded notice for mobile web', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ isMobileWeb: true }),
      connectionOutcome: null,
      isConnecting: false,
    });
    expect(vm.walletOptions).toHaveLength(0);
    expect(vm.platformNotice).not.toBeNull();
    expect(vm.platformNotice!.message).toContain('mobile web');
  });

  it('includes connection outcome display when outcome provided', () => {
    const outcome: ConnectionOutcome = { kind: 'failed', reason: 'timeout' };
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ nativeWalletAvailable: true }),
      connectionOutcome: outcome,
      isConnecting: false,
    });
    expect(vm.outcomeDisplay).not.toBeNull();
    expect(vm.outcomeDisplay!.severity).toBe('error');
    expect(vm.outcomeDisplay!.title).toBe('Connection Failed');
  });

  it('shows retry guidance without staying in connecting state', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ browserWalletAvailable: true }),
      connectionOutcome: { kind: 'needs-wallet-retry' },
      isConnecting: false,
    });

    expect(vm.isConnecting).toBe(false);
    expect(vm.walletOptions.map((option) => option.kind)).toEqual(['browser']);
    expect(vm.outcomeDisplay!.title).toBe('Wallet Approval Needed');
    expect(vm.outcomeDisplay!.severity).toBe('warning');
  });

  it('passes through isConnecting state', () => {
    const vm = buildWalletConnectViewModel({
      capabilities: makeCaps({ nativeWalletAvailable: true }),
      connectionOutcome: null,
      isConnecting: true,
    });
    expect(vm.isConnecting).toBe(true);
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
