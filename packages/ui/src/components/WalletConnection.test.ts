import { describe, it, expect } from 'vitest';
import {
  truncateAddress,
  buildWalletOptions,
  getConnectionOutcomeDisplay,
  buildConnectedWalletSummary,
  buildPlatformNotice,
} from './WalletConnectionUtils.js';
import type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

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

describe('truncateAddress', () => {
  it('truncates a long Solana address to first 4 and last 4 characters', () => {
    const addr = 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs';
    expect(truncateAddress(addr)).toBe('DRpb...o1Fs');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('abcd1234')).toBe('abcd1234');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });
});

describe('buildWalletOptions', () => {
  it('returns native wallet option when nativeWalletAvailable is true', () => {
    const options = buildWalletOptions(makeCaps({ nativeWalletAvailable: true }));
    expect(options).toHaveLength(1);
    expect(options[0]!.kind).toBe('native');
    expect(options[0]!.label).toBe('Connect Mobile Wallet');
    expect(options[0]!.description).toContain('mobile wallet');
  });

  it('returns browser wallet option when browserWalletAvailable is true', () => {
    const options = buildWalletOptions(makeCaps({ browserWalletAvailable: true }));
    expect(options).toHaveLength(1);
    expect(options[0]!.kind).toBe('browser');
    expect(options[0]!.label).toBe('Connect Browser Wallet');
  });

  it('returns both options when both are available', () => {
    const options = buildWalletOptions(makeCaps({
      nativeWalletAvailable: true,
      browserWalletAvailable: true,
    }));
    expect(options).toHaveLength(2);
    expect(options.map(o => o.kind)).toEqual(['native', 'browser']);
  });

  it('returns empty array when no wallet is available', () => {
    const options = buildWalletOptions(makeCaps());
    expect(options).toHaveLength(0);
  });
});

describe('getConnectionOutcomeDisplay', () => {
  it('maps connected outcome to success display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'connected' });
    expect(display.title).toBe('Wallet Connected');
    expect(display.severity).toBe('success');
  });

  it('maps failed outcome to error display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'failed', reason: 'timeout' });
    expect(display.title).toBe('Connection Failed');
    expect(display.severity).toBe('error');
    expect(display.detail).toContain('timeout');
  });

  it('maps cancelled outcome to info display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'cancelled' });
    expect(display.title).toBe('Connection Cancelled');
    expect(display.severity).toBe('info');
  });

  it('maps interrupted outcome to warning display', () => {
    const display = getConnectionOutcomeDisplay({ kind: 'interrupted' });
    expect(display.title).toBe('Connection Interrupted');
    expect(display.severity).toBe('warning');
    expect(display.detail).toContain('returned');
  });
});

describe('buildConnectedWalletSummary', () => {
  it('builds summary with truncated address and connection kind label', () => {
    const summary = buildConnectedWalletSummary({
      walletAddress: 'DRpbCBMxVnDK7maPMoGQfFRMKVfGE5sBPr7butNRo1Fs',
      connectionKind: 'native',
    });
    expect(summary.displayAddress).toBe('DRpb...o1Fs');
    expect(summary.connectionLabel).toBe('Mobile Wallet');
  });

  it('uses browser label for browser connection', () => {
    const summary = buildConnectedWalletSummary({
      walletAddress: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop',
      connectionKind: 'browser',
    });
    expect(summary.connectionLabel).toBe('Browser Wallet');
  });
});

describe('buildPlatformNotice', () => {
  it('returns degraded notice for mobile web with no wallet support', () => {
    const notice = buildPlatformNotice(makeCaps({ isMobileWeb: true }));
    expect(notice).not.toBeNull();
    expect(notice!.message).toContain('mobile web');
    expect(notice!.severity).toBe('warning');
  });

  it('returns degraded notice when no wallet is available on any platform', () => {
    const notice = buildPlatformNotice(makeCaps());
    expect(notice).not.toBeNull();
    expect(notice!.message).toContain('No supported wallet');
  });

  it('returns null when at least one wallet option is available', () => {
    const notice = buildPlatformNotice(makeCaps({ nativeWalletAvailable: true }));
    expect(notice).toBeNull();
  });

  it('returns null when browser wallet is available', () => {
    const notice = buildPlatformNotice(makeCaps({ browserWalletAvailable: true }));
    expect(notice).toBeNull();
  });
});
