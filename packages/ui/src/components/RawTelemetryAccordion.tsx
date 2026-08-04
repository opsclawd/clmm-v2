import React from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { colors, typography } from '../design-system/index.js';

export interface RawTelemetryAccordionProps {
  isExpanded: boolean;
  onToggle: () => void;
  isLoading: boolean;
  isError: boolean;
  data: unknown;
}

const rawTelemetryCardStyle = {
  marginTop: 12,
  marginBottom: 16,
  padding: 12,
  backgroundColor: colors.surface,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

const toggleStyle = {
  minHeight: 44,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
} as const;

const titleStyle = {
  color: colors.textSecondary,
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
} as const;

const secondaryTextStyle = {
  color: colors.textTertiary,
  fontSize: typography.fontSize.xs,
} as const;

export function RawTelemetryAccordion({
  isExpanded,
  onToggle,
  isLoading,
  isError,
  data,
}: RawTelemetryAccordionProps): JSX.Element {
  const formattedData = data == null ? null : JSON.stringify(data, null, 2);

  return (
    <View testID="raw-telemetry-accordion" style={rawTelemetryCardStyle}>
      <TouchableOpacity
        testID="raw-telemetry-toggle"
        accessibilityRole="button"
        accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} Raw Telemetry`}
        accessibilityState={{ expanded: isExpanded }}
        aria-expanded={isExpanded}
        onPress={onToggle}
        style={toggleStyle}
      >
        <Text style={titleStyle}>Raw Telemetry</Text>
        <Text style={secondaryTextStyle}>{isExpanded ? 'Hide' : 'Show'}</Text>
      </TouchableOpacity>

      {isExpanded ? (
        <View testID="raw-telemetry-content">
          {isLoading ? (
            <View testID="raw-telemetry-loading">
              <ActivityIndicator color={colors.primary} />
              <Text style={secondaryTextStyle}>Loading raw telemetry…</Text>
            </View>
          ) : isError ? (
            <Text testID="raw-telemetry-error" style={secondaryTextStyle}>
              Raw telemetry could not be loaded.
            </Text>
          ) : formattedData == null ? (
            <Text testID="raw-telemetry-empty" style={secondaryTextStyle}>
              No raw telemetry is available for this run.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              <ScrollView horizontal>
                <Text
                  testID="raw-telemetry-json"
                  style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.xs,
                    fontFamily: 'monospace',
                  }}
                >
                  {formattedData}
                </Text>
              </ScrollView>
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}
