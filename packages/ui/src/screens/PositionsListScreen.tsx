import { View, Text } from 'react-native';
import { colors } from '../design-system/index.js';

export function PositionsListScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold' }}>
        Positions
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
        Connect wallet to view supported Orca positions.
      </Text>
    </View>
  );
}
