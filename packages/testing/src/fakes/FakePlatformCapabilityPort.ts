import type { PlatformCapabilityPort, PlatformCapabilityState } from '@clmm/application';

const DEFAULT_CAPABILITIES: PlatformCapabilityState = {
  nativePushAvailable: true,
  browserNotificationAvailable: false,
  nativeWalletAvailable: true,
  browserWalletAvailable: false,
  isMobileWeb: false,
};

export class FakePlatformCapabilityPort implements PlatformCapabilityPort {
  private _capabilities: PlatformCapabilityState = { ...DEFAULT_CAPABILITIES };

  setCapabilities(partial: Partial<PlatformCapabilityState>): void {
    this._capabilities = { ...this._capabilities, ...partial };
  }

  async getCapabilities(): Promise<PlatformCapabilityState> {
    return this._capabilities;
  }
}
