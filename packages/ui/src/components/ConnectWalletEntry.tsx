import { View, Text, TouchableOpacity } from 'react-native';
import { colors, typography } from '../design-system/index.js';

type Props = {
  onConnectWallet?: () => void;
};

export function ConnectWalletEntry({ onConnectWallet }: Props): JSX.Element {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.semibold,
        textAlign: 'center',
      }}>
        Connect your wallet to get started
      </Text>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: typography.fontSize.base * typography.lineHeight.normal,
      }}>
        CLMM monitors your Orca concentrated liquidity positions and helps you exit when they go out of range.
      </Text>
      <TouchableOpacity
        onPress={onConnectWallet}
        style={{
          marginTop: 24,
          paddingVertical: 14,
          paddingHorizontal: 32,
          backgroundColor: colors.primary,
          borderRadius: 8,
        }}
      >
        <Text style={{
          color: colors.background,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.bold,
          textAlign: 'center',
        }}>
          Connect Wallet
        </Text>
      </TouchableOpacity>
    </View>
  );
}
