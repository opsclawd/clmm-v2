import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

declare const Notification: { permission: 'granted' | 'denied' | 'default' } | undefined;

type WalletStandardGetWallets = () => { get: () => unknown[] };

async function hasWalletStandardWallet(): Promise<boolean> {
  try {
    if (typeof (globalThis as Record<string, unknown>)['window'] === 'undefined') return false;
    const walletStandardModuleName = '@wallet-standard/app';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const walletStandard: Record<string, unknown> = await import(walletStandardModuleName) as Record<string, unknown>;
    const getWalletsFn = walletStandard['getWallets'] as WalletStandardGetWallets | undefined;
    if (typeof getWalletsFn !== 'function') return false;
    return getWalletsFn().get().length > 0;
  } catch {
    return false;
  }
}

function hasLegacyInjectedSolanaProvider(): boolean {
  try {
    const win = globalThis as unknown as Record<string, unknown>;
    const phantom = win['phantom'] as { solana?: Record<string, unknown> } | undefined;
    if (typeof phantom?.solana?.['connect'] === 'function') return true;
    const solana = win['solana'] as Record<string, unknown> | undefined;
    if (typeof solana?.['connect'] === 'function') return true;
    return false;
  } catch {
    return false;
  }
}

function isAndroidChromeLike(): boolean {
  try {
    const ua = globalThis.navigator?.userAgent ?? '';
    return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg|OPR|Firefox|Brave/i.test(ua);
  } catch {
    return false;
  }
}

export class WebPlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    const isMobileWeb =
      typeof navigator !== 'undefined' &&
      /Mobile|Android|iPhone/i.test(navigator.userAgent);

    const walletStandardAvailable = await hasWalletStandardWallet();
    const legacyInjectedAvailable = hasLegacyInjectedSolanaProvider();
    const mwaPlausible = isAndroidChromeLike();

    const browserWalletAvailable =
      walletStandardAvailable || legacyInjectedAvailable || mwaPlausible;

    const browserNotificationAvailable =
      typeof Notification !== 'undefined' && Notification.permission === 'granted';

    return {
      nativePushAvailable: false,
      browserNotificationAvailable,
      nativeWalletAvailable: false,
      browserWalletAvailable,
      isMobileWeb,
    };
  }
}