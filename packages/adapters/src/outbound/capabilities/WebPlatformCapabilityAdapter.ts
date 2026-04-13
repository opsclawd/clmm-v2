import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

declare const Notification: { permission: 'granted' | 'denied' | 'default' } | undefined;

export class WebPlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    const isMobileWeb =
      typeof navigator !== 'undefined' &&
      /Mobile|Android|iPhone/i.test(navigator.userAgent);
    // Check if a browser wallet (Phantom, Solflare, etc.) is injected in the window.
    // Wallet extensions may be present on both desktop and mobile browsers.
    const injectedBrowserWallet = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = globalThis as any;
        const solana = win['solana'];
        return typeof solana !== 'undefined' && typeof solana['connect'] === 'function';
      } catch {
        return false;
      }
    })();
    const browserNotificationAvailable =
      typeof Notification !== 'undefined' && Notification.permission === 'granted';
    return {
      nativePushAvailable: false,
      browserNotificationAvailable,
      nativeWalletAvailable: false,
      // Wallet available if desktop OR a browser wallet extension is injected
      browserWalletAvailable: !isMobileWeb || injectedBrowserWallet,
      isMobileWeb,
    };
  }
}
