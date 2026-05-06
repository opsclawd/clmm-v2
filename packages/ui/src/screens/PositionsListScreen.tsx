import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import type { PositionSummaryDto, SrLevelsBlock, RegimeBlock } from '@clmm/application/public';
import { colors, typography } from '../design-system/index.js';
import { buildPositionListViewModel } from '../view-models/PositionListViewModel.js';
import { DegradedCapabilityBanner } from '../components/DegradedCapabilityBanner.js';
import { ConnectWalletEntry } from '../components/ConnectWalletEntry.js';
import { SectionHeader } from '../components/SectionHeader.js';
import { PositionCard } from '../components/PositionCard.js';
import { SrInsightsSection } from '../components/SrInsightsSection.js';
import { RegimeSection } from '../components/RegimeSection.js';
import { PortfolioSummaryStrip } from '../components/PortfolioSummaryStrip.js';
import type { PlatformCapabilities } from '../components/DegradedCapabilityBannerUtils.js';

type Props = {
  walletAddress?: string | null;
  positions?: PositionSummaryDto[] | undefined;
  positionsLoading?: boolean;
  positionsError?: string | null;
  positionsWarning?: string | null;
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
  regime?: RegimeBlock | null | undefined;
  regimeLoading?: boolean | undefined;
  regimeError?: boolean | undefined;
  regimeUnsupported?: boolean | undefined;
  regimeUnavailableReason?: string | null | undefined;
};

export function PositionsListScreen({
  walletAddress,
  positions,
  positionsLoading,
  positionsError,
  positionsWarning,
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
  regime,
  regimeLoading,
  regimeError,
  regimeUnsupported,
  regimeUnavailableReason,
}: Props): JSX.Element {
  const isConnected = walletAddress != null && walletAddress.length > 0;
  const hasPositions = (positions?.length ?? 0) > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.appBackground }}>
      <DegradedCapabilityBanner capabilities={platformCapabilities} />
      {positionsWarning ? <PartialDataBanner message={positionsWarning} /> : null}

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
          regime={regime}
          regimeLoading={regimeLoading}
          regimeError={regimeError}
          regimeUnsupported={regimeUnsupported}
          regimeUnavailableReason={regimeUnavailableReason}
        />
      ) : (
        <EmptyState />
      )}
    </View>
  );
}

function PartialDataBanner({ message }: { message: string }) {
  return (
    <View
      style={{
        marginTop: 8,
        marginBottom: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#422006',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.warning,
      }}
    >
      <Text
        style={{
          color: colors.warning,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
        }}
      >
        {message}
      </Text>
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
  regime,
  regimeLoading,
  regimeError,
  regimeUnsupported,
  regimeUnavailableReason,
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
  regime?: RegimeBlock | null | undefined;
  regimeLoading?: boolean | undefined;
  regimeError?: boolean | undefined;
  regimeUnsupported?: boolean | undefined;
  regimeUnavailableReason?: string | null | undefined;
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
          <PortfolioSummaryStrip />
          <SectionHeader title="Active positions" meta={`${positions.length} monitored`} />
        </View>
      }
      ListFooterComponent={
        <>
          <SrInsightsSection
            srLevels={srLevels}
            isLoading={srLevelsLoading ?? false}
            isError={srLevelsError ?? false}
            isUnsupported={srLevelsUnsupported ?? false}
            isMixedPools={isMixedPools}
            poolLabel={poolLabel}
            now={now ?? Date.now()}
          />
          <RegimeSection
            regime={regime}
            isLoading={regimeLoading ?? false}
            isError={regimeError ?? false}
            isUnsupported={regimeUnsupported ?? false}
            unavailableReason={regimeUnavailableReason ?? null}
            now={now ?? Date.now()}
          />
        </>
      }
      renderItem={({ item }) => (
        <PositionCard item={item} onPress={() => onSelectPosition?.(item.positionId)} />
      )}
    />
  );
}
