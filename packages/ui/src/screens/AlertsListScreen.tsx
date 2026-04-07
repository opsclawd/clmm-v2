import { ActivityIndicator, View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { ActionableAlertDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

type Props = {
  alerts?: ActionableAlertDto[];
  alertsLoading?: boolean;
  alertsError?: string | null;
  onSelectAlert?: (triggerId: string, positionId: string) => void;
  platformCapabilities?: PlatformCapabilities | null;
};

export function AlertsListScreen({ alerts, alertsLoading, alertsError, onSelectAlert, platformCapabilities }: Props): JSX.Element {
  const isLoading = alertsLoading ?? (alerts == null && alertsError == null);
  const alertItems = alerts ?? [];
  const isEmpty = alertItems.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Alerts
      </Text>

      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {isEmpty && isLoading ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
            marginTop: 12,
          }}>
            Loading actionable alerts
          </Text>
        </View>
      ) : isEmpty && alertsError ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Could not load alerts
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: typography.fontSize.base * typography.lineHeight.normal,
          }}>
            {alertsError}
          </Text>
        </View>
      ) : isEmpty ? (
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          No active alerts.
        </Text>
      ) : (
        <>
          <Text style={{
            color: colors.breach,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
            marginTop: 8,
          }}>
            {alertItems.length} position{alertItems.length === 1 ? '' : 's'} require{alertItems.length === 1 ? 's' : ''} action
          </Text>
          <FlatList
            data={alertItems}
            keyExtractor={(item) => item.triggerId}
            style={{ marginTop: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelectAlert?.(item.triggerId, item.positionId)}
                style={{ marginBottom: 12 }}
              >
                <View style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  <View style={{
                    paddingHorizontal: 16,
                    paddingTop: 12,
                    paddingBottom: 4,
                    backgroundColor: colors.surface,
                  }}>
                    <Text style={{
                      color: colors.textSecondary,
                      fontSize: typography.fontSize.sm,
                    }}>
                      Position: {item.positionId}
                    </Text>
                  </View>
                  <DirectionalPolicyCard direction={item.breachDirection} />
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </View>
  );
}
