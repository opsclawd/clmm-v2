import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';

export function AlertsListScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold' }}>
        Alerts
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
        No active alerts.
      </Text>
    </View>
  );
}
