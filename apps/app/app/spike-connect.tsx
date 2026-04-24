import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWallets, useConnect } from '@wallet-standard/react-core';

export default function SpikeConnect() {
  const wallets = useWallets();
  const [status, setStatus] = useState<string>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [isConnecting, connect] = useConnect(wallets[0]);

  const handleConnect = async () => {
    if (!wallets[0]) return;
    setStatus('connecting');
    setErrorText(null);
    try {
      const accounts = await connect();
      if (accounts.length > 0) {
        setAddress(accounts[0].address);
        setStatus('connected');
      } else {
        setStatus('no-accounts');
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Wallet Standard Spike</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Registered wallets: {wallets.length}</Text>
        {wallets.map((w) => (
          <Text key={w.name} style={styles.item}>
            - {w.name} (chains: {w.chains.join(', ')})
          </Text>
        ))}
        {wallets.length === 0 && (
          <Text style={styles.empty}>No wallets detected</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Status: {status}</Text>
        {address && <Text style={styles.label}>Address: {address}</Text>}
        {errorText && <Text style={styles.error}>Error: {errorText}</Text>}
      </View>

      <View style={styles.section}>
        <Text
          style={[styles.button, (!wallets[0] || isConnecting) && styles.disabled]}
          onPress={handleConnect}
        >
          {isConnecting ? 'Connecting...' : 'Connect'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  section: { marginBottom: 16 },
  label: { fontSize: 14, marginBottom: 4 },
  item: { fontSize: 12, marginLeft: 8 },
  empty: { fontSize: 12, color: '#999', marginLeft: 8 },
  error: { fontSize: 12, color: 'red', marginLeft: 8 },
  button: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    paddingVertical: 8,
  },
  disabled: { opacity: 0.5 },
});