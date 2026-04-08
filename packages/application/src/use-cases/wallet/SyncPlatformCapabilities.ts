import type { PlatformCapabilityPort, PlatformCapabilityState } from '../../ports/index.js';

export type SyncPlatformCapabilitiesResult = {
  capabilities: PlatformCapabilityState;
};

export async function syncPlatformCapabilities(params: {
  capabilityPort: PlatformCapabilityPort;
}): Promise<SyncPlatformCapabilitiesResult> {
  const capabilities = await params.capabilityPort.getCapabilities();
  return { capabilities };
}
