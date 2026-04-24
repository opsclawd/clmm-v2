import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWallet, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

function SpikeConnectInner() {
  const { wallets, connected, connect, publicKey, wallet } = useWallet();

  const [status, setStatus] = useState<string>('idle');
  const [address, setAddress] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleConnect = async () => {
    setStatus('connecting');
    setErrorText(null);
    try {
      await connect();
      setStatus('connected');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Wallet Adapter Spike (Fallback B: wallet-adapter-react)</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Configured wallets: {wallets.length}</Text>
        {wallets.map((w) => (
          <Text key={w.name} style={styles.item}>
            - {w.name} (ready: {String(w.readyState === 'Installed' ? 'yes' : 'no')})
          </Text>
        ))}
        {wallets.length === 0 && (
          <Text style={styles.empty}>No wallets configured</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Status: {status}</Text>
        {connected && publicKey && (
          <Text style={styles.label}>Address: {publicKey.toBase58()}</Text>
        )}
        {errorText && <Text style={styles.error}>Error: {errorText}</Text>}
      </View>

      <View style={styles.section}>
        <Text
          style={[styles.button, !wallet && styles.disabled]}
          onPress={handleConnect}
        >
          Connect
        </Text>
      </View>
    </ScrollView>
  );
}

export default function SpikeConnect() {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <WalletProvider wallets={wallets} autoConnect={false}>
      <SpikeConnectInner />
    </WalletProvider>
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