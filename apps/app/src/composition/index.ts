/**
 * ONE APPROVED COMPOSITION ENTRYPOINT
 *
 * This is the ONLY file in apps/app that may import from @clmm/adapters.
 * All other app code must import from @clmm/application/public or @clmm/ui only.
 */
import {
  NativePlatformCapabilityAdapter,
  WebPlatformCapabilityAdapter,
  ExpoDeepLinkAdapter,
  NativeNotificationPermissionAdapter,
} from '@clmm/adapters';
import { detectPlatformKind, selectCapabilityAdapter } from '../platform/capabilities.js';
import { parseIncomingUrl, registerDeepLinkListener } from '../platform/deepLinks.js';
import { connectNativeWallet } from '../platform/nativeWallet.js';

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
  connectNativeWallet,
};
