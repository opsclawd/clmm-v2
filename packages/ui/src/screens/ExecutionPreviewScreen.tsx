import { View, Text, ScrollView } from 'react-native';
import { colors } from '../design-system/index.js';

export function ExecutionPreviewScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: 16 }}>
        <Text style={{ color: colors.breach, fontSize: 18, fontWeight: 'bold' }}>
          Exit Preview
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Loading preview...
        </Text>
      </View>
    </ScrollView>
  );
}
