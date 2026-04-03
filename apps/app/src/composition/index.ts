/**
 * ONE APPROVED COMPOSITION ENTRYPOINT
 *
 * This is the ONLY file in apps/app that may import from @clmm/adapters.
 * All other app code must import from @clmm/application/public or @clmm/ui only.
 */
import { NativePlatformCapabilityAdapter } from '@clmm/adapters/src/outbound/capabilities/NativePlatformCapabilityAdapter';
import { WebPlatformCapabilityAdapter } from '@clmm/adapters/src/outbound/capabilities/WebPlatformCapabilityAdapter';
import { ExpoDeepLinkAdapter } from '@clmm/adapters/src/outbound/capabilities/ExpoDeepLinkAdapter';
import { NativeNotificationPermissionAdapter } from '@clmm/adapters/src/outbound/capabilities/NativeNotificationPermissionAdapter';
import { detectPlatformKind, selectCapabilityAdapter } from '../platform/capabilities';
import { parseIncomingUrl, registerDeepLinkListener } from '../platform/deepLinks';

const platformKind = detectPlatformKind();
const nativeCapability = new NativePlatformCapabilityAdapter();
const webCapability = new WebPlatformCapabilityAdapter();
const deepLinkAdapter = new ExpoDeepLinkAdapter();
const notificationPermissionAdapter = new NativeNotificationPermissionAdapter();

export const platformCapabilityAdapter = selectCapabilityAdapter(
  platformKind,
  nativeCapability,
  webCapability,
);
export const deepLink = {
  parse: (url: string) => parseIncomingUrl(deepLinkAdapter, url),
  registerListener: registerDeepLinkListener,
};
export { notificationPermissionAdapter };

export const walletPlatform = {
  connectNativeWallet: async (cluster?: string) => {
    const nativeWallet = await import('../platform/nativeWallet.js');
    return nativeWallet.connectNativeWallet(cluster);
  },
};
