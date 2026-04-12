import { View, Text, ScrollView, Linking } from 'react-native';
import { colors, typography } from '../design-system/index.js';

export function SupportScreen(): JSX.Element {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Support
      </Text>

      <View style={{ marginTop: 16, gap: 16 }}>
        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            What CLMM V2 Supports
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            CLMM V2 is an LP exit assistant for Orca CLMM positions on Solana. It detects out-of-range positions, prepares directional unwind paths, and executes only after explicit wallet signature.
          </Text>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Where to Get Help
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            For issues, questions, or feedback, contact us at{' '}
            <Text
              style={{ color: colors.primary }}
              onPress={() => { void Linking.openURL('mailto:support@clmm.v2.app'); }}
            >
              support@clmm.v2.app
            </Text>
          </Text>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Out of Scope
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            The following are not supported by CLMM V2:
          </Text>
          <View style={{ marginTop: 8, gap: 4 }}>
            {[
              'iOS App Store or Google Play Store distribution',
              'Generic wallet features (arbitrary transfer, stake, generic swap)',
              'Multi-chain support',
              'Multi-CLMM protocol support (Orca only for MVP)',
              'Autonomous or scheduled execution',
              'On-chain receipts, attestations, or proof verification',
              'Portfolio analytics or yield dashboards',
            ].map((item, i) => (
              <Text key={i} style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
                • {item}
              </Text>
            ))}
          </View>
        </View>

        <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold }}>
            Non-Custodial Reminder
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginTop: 4 }}>
            CLMM V2 never stores your private keys or signing authority. All transactions require explicit wallet signature. We cannot initiate transactions on your behalf.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}