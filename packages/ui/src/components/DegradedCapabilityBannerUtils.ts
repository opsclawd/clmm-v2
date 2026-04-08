type PlatformCapabilities = {
  nativePushAvailable: boolean;
  browserNotificationAvailable: boolean;
  nativeWalletAvailable: boolean;
  browserWalletAvailable: boolean;
  isMobileWeb: boolean;
};

export type { PlatformCapabilities };

export function buildDegradedBannerMessage(caps: PlatformCapabilities): string | null {
  const hasAnyPush = caps.nativePushAvailable || caps.browserNotificationAvailable;
  const hasAnyWallet = caps.nativeWalletAvailable || caps.browserWalletAvailable;

  if (hasAnyPush && hasAnyWallet) {
    return null;
  }

  const unavailable: string[] = [];
  if (!hasAnyPush) unavailable.push('push notifications');
  if (!hasAnyWallet) unavailable.push('wallet signing');

  const prefix = caps.isMobileWeb
    ? 'You are on mobile web.'
    : 'Some capabilities are unavailable on this platform.';

  const unavailableList = unavailable.join(' and ');

  return `${prefix} ${unavailableList.charAt(0).toUpperCase() + unavailableList.slice(1)} ${unavailable.length === 1 ? 'is' : 'are'} not available. You can still view positions, alerts, and history.`;
}
