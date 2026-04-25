import { ActivityIndicator, Text, View } from 'react-native';
import type { WalletBootStatus } from '../state/deriveWalletBootStatus';

type BootScreenProps = {
  status: Extract<WalletBootStatus, 'hydrating-storage' | 'checking-browser-wallet'>;
};

const COPY: Record<BootScreenProps['status'], string> = {
  'hydrating-storage': 'Loading\u2026',
  'checking-browser-wallet': 'Restoring wallet session\u2026',
};

export function BootScreen({ status }: BootScreenProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
      }}
      accessibilityRole="alert"
      accessibilityLabel={COPY[status]}
    >
      <ActivityIndicator size="small" color="#a1a1aa" />
      <Text style={{ color: '#a1a1aa', fontSize: 14 }}>{COPY[status]}</Text>
    </View>
  );
}