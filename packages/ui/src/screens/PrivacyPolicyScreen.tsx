import { View, Text, ScrollView, Linking } from 'react-native';
import { colors, typography } from '../design-system/index.js';

type Props = {
  onContactSupport?: () => void;
};

export function PrivacyPolicyScreen({ onContactSupport }: Props): JSX.Element {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Privacy Policy
      </Text>

      <View style={{ marginTop: 16, gap: 16 }}>
        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Non-Custodial
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            CLMM V2 is a non-custodial application. We never have access to or control over your wallet private keys, seeds, or signing authority. All transaction signing occurs directly within your wallet.
          </Text>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Keys Never Stored
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            Your wallet private keys, seed phrases, and authentication credentials are never stored by CLMM V2 at any time — on-chain or off-chain.
          </Text>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Off-Chain Operational Data
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            Wallet-linked operational data, such as your connected wallet address and position metadata, may be stored off-chain in our backend database (Railway Postgres) to enable monitoring, alerts, and execution history. This data is not shared with third parties.
          </Text>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            On-Chain Data
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            Transaction history and wallet balances are read directly from the Solana blockchain and are not stored by CLMM V2.
          </Text>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Support
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            For privacy-related questions, contact us at{' '}
            <Text
              style={{ color: colors.primary }}
              onPress={() => Linking.openURL('mailto:support@clmm.v2.app')}
            >
              support@clmm.v2.app
            </Text>
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}