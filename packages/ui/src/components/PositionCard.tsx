import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { Chip } from './Chip.js';

type Props = {
  poolLabel: string;
  rangeStatusKind: 'in-range' | 'below-range' | 'above-range';
  hasAlert: boolean;
  monitoringLabel: string;
  onPress?: () => void;
};

function getChipProps(rangeStatusKind: string, hasAlert: boolean): { tone: 'safe' | 'warn' | 'breach'; label: string } {
  if (hasAlert) {
    return { tone: 'breach', label: 'Breach' };
  }
  if (rangeStatusKind === 'in-range') {
    return { tone: 'safe', label: 'In range' };
  }
  if (rangeStatusKind === 'below-range') {
    return { tone: 'warn', label: 'Below range' };
  }
  if (rangeStatusKind === 'above-range') {
    return { tone: 'warn', label: 'Above range' };
  }
  return { tone: 'warn', label: 'Unknown' };
}

function getMonitoringColor(status: string): string {
  if (status === 'Monitoring Active') return colors.safe;
  if (status === 'Monitoring Degraded') return colors.warn;
  return colors.textFaint;
}

function getMonitoringText(status: string): string {
  if (status === 'Monitoring Active') return 'Live';
  if (status === 'Monitoring Degraded') return 'Degraded';
  return 'Inactive';
}

export function PositionCard({
  poolLabel,
  rangeStatusKind,
  hasAlert,
  monitoringLabel,
  onPress,
}: Props): JSX.Element {
  const chip = getChipProps(rangeStatusKind, hasAlert);
  const monitoringColor = getMonitoringColor(monitoringLabel);
  const monitoringText = getMonitoringText(monitoringLabel);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        marginHorizontal: 20,
      }}
    >
      {/* Row 1: chip + monitoring indicator */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Chip tone={chip.tone}>{chip.label}</Chip>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: monitoringColor,
              marginRight: 5,
            }}
          />
          <Text
            style={{
              fontSize: typography.fontSize.caption,
              color: colors.textBody,
            }}
          >
            {monitoringText}
          </Text>
        </View>
      </View>

      {/* Row 2: pool id */}
      <Text
        style={{
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          color: colors.textPrimary,
          letterSpacing: -0.01 * typography.fontSize.body,
        }}
      >
        {poolLabel}
      </Text>

      {/* Row 3: monitoring label */}
      <Text
        style={{
          fontSize: typography.fontSize.caption,
          color: colors.textTertiary,
          marginTop: 4,
        }}
      >
        {monitoringLabel}
      </Text>

      {/* Alert dot */}
      {hasAlert ? (
        <View
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: colors.breachAccent,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}
