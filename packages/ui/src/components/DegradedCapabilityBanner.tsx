import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildDegradedBannerMessage } from './DegradedCapabilityBannerUtils.js';
import type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

export { buildDegradedBannerMessage } from './DegradedCapabilityBannerUtils.js';
export type { PlatformCapabilities } from './DegradedCapabilityBannerUtils.js';

type Props = {
  capabilities?: PlatformCapabilities | null | undefined;
};

export function DegradedCapabilityBanner({ capabilities }: Props) {
  if (!capabilities) return null;

  const message = buildDegradedBannerMessage(capabilities);
  if (!message) return null;

  return (
    <View style={{
      marginTop: 8,
      marginBottom: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: '#422006',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.warning,
    }}>
      <Text style={{
        color: colors.warning,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium,
      }}>
        {message}
      </Text>
    </View>
  );
}
