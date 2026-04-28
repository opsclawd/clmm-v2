import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import type { PositionSummaryDto, SrLevelsBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import { ConnectWalletEntry } from '../components/ConnectWalletEntry.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { PositionCard } from '../components/PositionCard.js';
import { MarketContextPanel } from '../components/MarketContextPanel.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  onSelectPosition?: (positionId: string) => void;
  onConnectWallet?: () => void;
  platformCapabilities?: PlatformCapabilities | null;
  srLevels?: SrLevelsBlock | null | undefined;
  srLevelsLoading?: boolean | undefined;
  srLevelsError?: boolean | undefined;
  srLevelsUnsupported?: boolean | undefined;
  isMixedPools?: boolean | undefined;
  poolLabel?: string | null | undefined;
  now?: number | undefined;
};

export function PositionsListScreen({
  walletAddress,
  positions,
  positionsLoading,
  positionsError,
  onSelectPosition,
  onConnectWallet,
  platformCapabilities,
  srLevels,
  srLevelsLoading,
  srLevelsError,
  srLevelsUnsupported,
  isMixedPools,
  poolLabel,
  now,
}: Props): JSX.Element {
  const isConnected = walletAddress != null && walletAddress.length > 0;
  const hasPositions = (positions?.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBackground }}>
      <DegradedCapabilityBanner capabilities={platformCapabilities} />

      {!isConnected ? (
        <ConnectWalletEntry {...(onConnectWallet != null ? { onConnectWallet } : {})} />
      ) : positionsLoading ? (
        <LoadingState />
      ) : positionsError && !hasPositions ? (
        <ErrorState error={positionsError} />
      ) : hasPositions ? (
        <ConnectedPositionsList
          positions={positions ?? []}
          {...(onSelectPosition != null ? { onSelectPosition } : {})}
          srLevels={srLevels}
          srLevelsLoading={srLevelsLoading}
          srLevelsError={srLevelsError}
          srLevelsUnsupported={srLevelsUnsupported}
          isMixedPools={isMixedPools ?? false}
          poolLabel={poolLabel ?? null}
          now={now}
        />
      ) : (
        <EmptyState />
      )}
    </View>
  );
}

function LoadingState() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <ActivityIndicator color={colors.safe} />
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
          marginTop: 16,
        }}
      >
        Loading supported Orca positions
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.caption,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Checking this wallet for supported concentrated liquidity positions.
      </Text>
    </View>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
        }}
      >
        Could not load supported positions
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.caption,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        {error}
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typography.fontSize.body,
          fontWeight: typography.fontWeight.semibold,
          textAlign: 'center',
        }}
      >
        No supported positions
      </Text>
      <Text
        style={{
          color: colors.textBody,
          fontSize: typography.fontSize.caption,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Connect a wallet with Orca CLMM positions to see them here.
      </Text>
    </View>
  );
}

function ConnectedPositionsList({
  positions,
  onSelectPosition,
  srLevels,
  srLevelsLoading,
  srLevelsError,
  srLevelsUnsupported,
  isMixedPools,
  poolLabel,
  now,
}: {
  positions: PositionSummaryDto[];
  onSelectPosition?: (positionId: string) => void;
  srLevels?: SrLevelsBlock | null | undefined;
  srLevelsLoading?: boolean | undefined;
  srLevelsError?: boolean | undefined;
  srLevelsUnsupported?: boolean | undefined;
  isMixedPools: boolean;
  poolLabel: string | null;
  now?: number | undefined;
}) {
  const viewModel = buildPositionListViewModel(positions);

  return (
    <FlatList
      contentContainerStyle={{ flexGrow: 1 }}
      data={viewModel.items}
      keyExtractor={(item) => item.positionId}
      removeClippedSubviews={false}
      ListHeaderComponent={
        <View>
          <MarketContextPanel
            srLevels={srLevels}
            isLoading={srLevelsLoading ?? false}
            isError={srLevelsError ?? false}
            isUnsupported={srLevelsUnsupported ?? false}
            isMixedPools={isMixedPools}
            poolLabel={poolLabel}
            now={now ?? Date.now()}
          />
          <SectionHeader
            title="Active positions"
            meta={`${positions.length} monitored`}
          />
        </View>
      }
      renderItem={({ item }) => (
        <PositionCard
          poolLabel={item.poolLabel}
          currentPriceLabel={item.currentPriceLabel}
          feeRateLabel={item.feeRateLabel}
          rangeStatusKind={item.rangeStatusKind}
          rangeDistanceLabel={item.rangeDistanceLabel}
          hasAlert={item.hasAlert}
          monitoringLabel={item.monitoringLabel}
          onPress={() => onSelectPosition?.(item.positionId)}
        />
      )}
    />
  );
}