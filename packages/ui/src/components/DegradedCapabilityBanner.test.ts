import { describe, it, expect } from 'vitest';
import { buildDegradedBannerMessage } from './DegradedCapabilityBannerUtils.js';

describe('DegradedCapabilityBanner', () => {
  it('returns null when all capabilities are available', () => {
    const msg = buildDegradedBannerMessage({
      nativePushAvailable: true,
      browserNotificationAvailable: true,
      nativeWalletAvailable: true,
      browserWalletAvailable: true,
      isMobileWeb: false,
    });
    expect(msg).toBeNull();
  });

  it('returns degraded message for mobile web (no native wallet, no push)', () => {
    const msg = buildDegradedBannerMessage({
      nativePushAvailable: false,
      browserNotificationAvailable: false,
      nativeWalletAvailable: false,
      browserWalletAvailable: false,
      isMobileWeb: true,
    });
    expect(msg).not.toBeNull();
    expect(msg).toContain('mobile web');
    expect(msg!.toLowerCase()).toContain('push notifications');
    expect(msg!.toLowerCase()).toContain('wallet signing');
  });

  it('returns degraded message when only push is unavailable', () => {
    const msg = buildDegradedBannerMessage({
      nativePushAvailable: false,
      browserNotificationAvailable: false,
      nativeWalletAvailable: false,
      browserWalletAvailable: true,
      isMobileWeb: false,
    });
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('push notifications');
  });

  it('returns degraded message when only wallet is unavailable', () => {
    const msg = buildDegradedBannerMessage({
      nativePushAvailable: true,
      browserNotificationAvailable: true,
      nativeWalletAvailable: false,
      browserWalletAvailable: false,
      isMobileWeb: false,
    });
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('wallet signing');
  });

  it('desktop PWA with browser wallet + browser notifications returns null', () => {
    const msg = buildDegradedBannerMessage({
      nativePushAvailable: false,
      browserNotificationAvailable: true,
      nativeWalletAvailable: false,
      browserWalletAvailable: true,
      isMobileWeb: false,
    });
    expect(msg).toBeNull();
  });
});
