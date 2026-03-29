import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';

export function WalletSettingsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Wallet / Settings
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
        Wallet connection and settings will appear here.
      </Text>
    </View>
  );
}
