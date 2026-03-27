import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

declare const Notification: { permission: 'granted' | 'denied' | 'default' } | undefined;

export class WebPlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    const isMobileWeb =
      typeof navigator !== 'undefined' &&
      /Mobile|Android|iPhone/i.test(navigator.userAgent);
    const browserNotificationAvailable =
      typeof Notification !== 'undefined' && Notification.permission === 'granted';
    return {
      nativePushAvailable: false,
      browserNotificationAvailable,
      nativeWalletAvailable: false,
      browserWalletAvailable: !isMobileWeb,
      isMobileWeb,
    };
  }
}
