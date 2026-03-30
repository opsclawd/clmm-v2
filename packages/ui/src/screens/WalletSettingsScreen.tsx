import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { colors, typography } from '../design-system/index.js';
import { buildWalletSettingsViewModel } from '../view-models/WalletConnectionViewModel.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';
import type { WalletOptionKind } from '../components/WalletConnectionUtils.js';

type Props = {
  walletAddress?: string | null;
  connectionKind?: WalletOptionKind | null;
  platformCapabilities?: PlatformCapabilities | null;
  onReconnect?: () => void;
  onSwitchWallet?: () => void;
  onDisconnect?: () => void;
};

export function WalletSettingsScreen({
  walletAddress,
  connectionKind,
  platformCapabilities,
  onReconnect,
  onSwitchWallet,
  onDisconnect,
}: Props) {
  const caps = platformCapabilities ?? {
    nativePushAvailable: false,
    browserNotificationAvailable: false,
    nativeWalletAvailable: false,
    browserWalletAvailable: false,
    isMobileWeb: false,
  };

  const vm = buildWalletSettingsViewModel({
    walletAddress: walletAddress ?? null,
    connectionKind: connectionKind ?? null,
    capabilities: caps,
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Wallet / Settings
      </Text>

      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {vm.connected && vm.walletSummary ? (
        <View style={{ marginTop: 16 }}>
          <View style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
            }}>
              Connected via {vm.walletSummary.connectionLabel}
            </Text>
            <Text style={{
              color: colors.text,
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              marginTop: 4,
            }}>
              {vm.walletSummary.displayAddress}
            </Text>
          </View>

          <View style={{ marginTop: 16, gap: 8 }}>
            <TouchableOpacity
              onPress={onReconnect}
              disabled={onReconnect == null}
              style={{
                padding: 14,
                backgroundColor: colors.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                ...(onReconnect == null ? { opacity: 0.5 } : {}),
              }}
            >
              <Text style={{
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                textAlign: 'center',
              }}>
                Reconnect
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSwitchWallet}
              disabled={onSwitchWallet == null}
              style={{
                padding: 14,
                backgroundColor: colors.surface,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                ...(onSwitchWallet == null ? { opacity: 0.5 } : {}),
              }}
            >
              <Text style={{
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                textAlign: 'center',
              }}>
                Switch Wallet
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDisconnect}
              disabled={onDisconnect == null}
              style={{
                padding: 14,
                backgroundColor: 'transparent',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.danger,
                ...(onDisconnect == null ? { opacity: 0.5 } : {}),
              }}
            >
              <Text style={{
                color: colors.danger,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                textAlign: 'center',
              }}>
                Disconnect
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 16 }}>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
          }}>
            No wallet connected.
          </Text>
          {vm.platformNotice ? (
            <View style={{
              marginTop: 12,
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
        </View>
      )}
    </ScrollView>
  );
}
