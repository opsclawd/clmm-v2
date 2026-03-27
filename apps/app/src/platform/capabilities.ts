import { Platform } from 'react-native';
import type { PlatformCapabilityPort } from '@clmm/application';

export type PlatformKind = 'native' | 'web';

export function detectPlatformKind(): PlatformKind {
  return Platform.OS === 'web' ? 'web' : 'native';
}

export function selectCapabilityAdapter(
  kind: PlatformKind,
  native: PlatformCapabilityPort,
  web: PlatformCapabilityPort,
): PlatformCapabilityPort {
  return kind === 'web' ? web : native;
}
