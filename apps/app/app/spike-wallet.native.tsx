import { View, Text, StyleSheet } from 'react-native';

export default function SpikeWalletRoute() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>ConnectorKit Wallet Spike — web-only</Text>
      <Text style={styles.subtext}>Open this route in a browser to test wallet discovery and signing.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  text: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  subtext: { color: '#888888', fontSize: 12, marginTop: 8 },
});
