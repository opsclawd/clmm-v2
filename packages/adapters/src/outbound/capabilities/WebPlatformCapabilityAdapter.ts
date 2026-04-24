import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

declare const Notification: { permission: 'granted' | 'denied' | 'default' } | undefined;

export class WebPlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    const isMobileWeb =
      typeof navigator !== 'undefined' &&
      /Mobile|Android|iPhone/i.test(navigator.userAgent);
    // Check if a browser wallet (Phantom, Solflare, etc.) is injected in the window.
    // Wallet extensions may be present on both desktop and mobile browsers.
    const injectedBrowserWallet = ((): boolean => {
      try {
        const win = globalThis as unknown as Record<string, unknown>;
        const phantom = win['phantom'];
        const phantomSolana =
          typeof phantom === 'object' && phantom !== null
            ? (phantom as Record<string, unknown>)['solana']
            : undefined;
        if (typeof phantomSolana === 'object' && phantomSolana !== null) {
          const phantomSolanaRecord = phantomSolana as Record<string, unknown>;
          if (typeof phantomSolanaRecord['connect'] === 'function') return true;
        }

        const solana = win['solana'];
        if (typeof solana !== 'object' || solana === null) return false;
        const solanaRecord = solana as Record<string, unknown>;
        return typeof solanaRecord['connect'] === 'function';
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
