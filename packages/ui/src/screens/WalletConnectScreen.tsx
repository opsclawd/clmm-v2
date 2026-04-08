import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { buildWalletConnectViewModel } from '../view-models/WalletConnectionViewModel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { ConnectionOutcome, ConnectionOutcomeDisplay, WalletOptionKind } from '../components/WalletConnectionUtils.js';

type Props = {
  platformCapabilities?: PlatformCapabilities | null;
  connectionOutcome?: ConnectionOutcome | null;
  isConnecting?: boolean;
  onSelectWallet?: (kind: WalletOptionKind) => void;
  onGoBack?: () => void;
};

const severityColors: Record<ConnectionOutcomeDisplay['severity'], string> = {
  success: colors.primary,
  error: colors.danger,
  warning: colors.warning,
  info: colors.textSecondary,
};

export function WalletConnectScreen({
  platformCapabilities,
  connectionOutcome,
  isConnecting,
  onSelectWallet,
  onGoBack,
}: Props): JSX.Element {
  if (!platformCapabilities) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const vm = buildWalletConnectViewModel({
    capabilities: platformCapabilities,
    connectionOutcome: connectionOutcome ?? null,
    isConnecting: isConnecting ?? false,
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Connect Wallet
      </Text>
      <Text style={{
        color: colors.textSecondary,
        fontSize: typography.fontSize.base,
        marginTop: 8,
      }}>
        Choose a wallet to connect. Only supported wallet options for this device are shown.
      </Text>

      {vm.platformNotice ? (
        <View style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: vm.platformNotice.severity === 'warning' ? '#422006' : '#450a0a',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: vm.platformNotice.severity === 'warning' ? colors.warning : colors.danger,
        }}>
          <Text style={{
            color: vm.platformNotice.severity === 'warning' ? colors.warning : colors.danger,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
          }}>
            {vm.platformNotice.message}
          </Text>
        </View>
      ) : null}

      {vm.outcomeDisplay ? (
        <View style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: colors.surface,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: severityColors[vm.outcomeDisplay.severity] ?? colors.border,
        }}>
          <Text style={{
            color: severityColors[vm.outcomeDisplay.severity] ?? colors.text,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.semibold,
          }}>
            {vm.outcomeDisplay.title}
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.sm,
            marginTop: 4,
          }}>
            {vm.outcomeDisplay.detail}
          </Text>
        </View>
      ) : null}

      {vm.isConnecting ? (
        <View style={{ marginTop: 32, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: typography.fontSize.base }}>
            Connecting...
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 24 }}>
          {vm.walletOptions.map((option) => (
            <TouchableOpacity
              key={option.kind}
              onPress={() => onSelectWallet?.(option.kind)}
              style={{
                padding: 16,
                backgroundColor: colors.surface,
                borderRadius: 8,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.semibold,
              }}>
                {option.label}
              </Text>
              <Text style={{
                color: colors.textSecondary,
                fontSize: typography.fontSize.sm,
                marginTop: 4,
              }}>
                {option.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {onGoBack ? (
        <TouchableOpacity
          onPress={onGoBack}
          style={{ marginTop: 16, alignSelf: 'center', padding: 8 }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
            Go Back
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
