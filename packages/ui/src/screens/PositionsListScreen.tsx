import { View, Text, FlatList, Pressable } from 'react-native';
import type { PositionSummaryDto } from '@clmm/application/public';
import { colors } from '../design-system/index.js';
import { typography } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { RangeStatusBadge } from '../components/RangeStatusBadge.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import { ConnectWalletEntry } from '../components/ConnectWalletEntry.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
};

export function PositionsListScreen({
  walletAddress,
  positions,
  positionsLoading,
  positionsError,
  onSelectPosition,
  onConnectWallet,
  platformCapabilities,
}: Props): JSX.Element {
  const isConnected = walletAddress != null && walletAddress.length > 0;
  const hasPositions = (positions?.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <Text style={{
        color: colors.text,
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
      }}>
        Positions
      </Text>

      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {!isConnected ? (
        <ConnectWalletEntry {...(onConnectWallet != null ? { onConnectWallet } : {})} />
      ) : positionsLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Loading supported Orca positions
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: 8,
          }}>
            Checking this wallet for supported concentrated liquidity positions.
          </Text>
        </View>
      ) : positionsError && !hasPositions ? (
        <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
          <Text style={{
            color: colors.text,
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            textAlign: 'center',
          }}>
            Could not load supported positions
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: typography.fontSize.base,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: typography.fontSize.base * typography.lineHeight.normal,
          }}>
            {positionsError}
          </Text>
        </View>
      ) : (
        <ConnectedPositionsList
          positions={positions ?? []}
          {...(onSelectPosition != null ? { onSelectPosition } : {})}
        />
      )}
    </View>
  );
}

function ConnectedPositionsList({
  positions,
  onSelectPosition,
}: {
  positions: PositionSummaryDto[];
  onSelectPosition?: (positionId: string) => void;
}): JSX.Element {
  const viewModel = buildPositionListViewModel(positions);

  if (viewModel.isEmpty) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
        <Text style={{
          color: colors.text,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
        }}>
          Wallet Connected
        </Text>
        <Text style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.base,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: typography.fontSize.base * typography.lineHeight.normal,
        }}>
          No supported Orca CLMM positions found for this wallet. Positions will appear here when you have active concentrated liquidity positions on Orca.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={viewModel.items}
      keyExtractor={(item) => item.positionId}
      style={{ marginTop: 12 }}
      removeClippedSubviews={false}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onSelectPosition?.(item.positionId)}
          accessibilityRole="button"
          style={{
            padding: 16,
            backgroundColor: colors.surface,
            borderRadius: 8,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{
                  color: colors.text,
                  fontSize: typography.fontSize.base,
                  fontWeight: typography.fontWeight.semibold,
                }}>
                  {item.poolLabel}
                </Text>
                {item.hasAlert ? (
                  <View style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.danger,
                    marginLeft: 8,
                  }} />
                ) : null}
              </View>
              <Text style={{
                color: colors.textSecondary,
                fontSize: typography.fontSize.sm,
                marginTop: 4,
              }}>
                {item.monitoringLabel}
              </Text>
            </View>
            <RangeStatusBadge rangeStateKind={item.rangeStatusKind} />
          </View>
        </Pressable>
      )}
    />
  );
}
