import type { PlatformCapabilityPort } from '@clmm/application';
import type { PlatformCapabilityState } from '@clmm/application';

export class NativePlatformCapabilityAdapter implements PlatformCapabilityPort {
  async getCapabilities(): Promise<PlatformCapabilityState> {
    return {
      nativePushAvailable: true,
      browserNotificationAvailable: false,
      nativeWalletAvailable: true,
      browserWalletAvailable: false,
      isMobileWeb: false,
    };
  }
}
