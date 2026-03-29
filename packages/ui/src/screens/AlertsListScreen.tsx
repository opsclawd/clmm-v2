import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { ActionableAlertDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { DirectionalPolicyCard } from '../components/DirectionalPolicyCard.js';

type Props = {
  alerts?: ActionableAlertDto[];
  onSelectAlert?: (triggerId: string, positionId: string) => void;
};

export function AlertsListScreen({ alerts, onSelectAlert }: Props) {
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

      {isEmpty ? (
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
