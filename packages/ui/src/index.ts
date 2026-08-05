// Screens — imported by apps/app route files ONLY
export { PositionsListScreen } from './screens/PositionsListScreen.js';
export { AlertsListScreen } from './screens/AlertsListScreen.js';
export { PositionDetailScreen } from './screens/PositionDetailScreen.js';
export { ExecutionPreviewScreen } from './screens/ExecutionPreviewScreen.js';
export { SigningStatusScreen } from './screens/SigningStatusScreen.js';
export { ExecutionResultScreen } from './screens/ExecutionResultScreen.js';
export { HistoryListScreen } from './screens/HistoryListScreen.js';
export { HistoryDetailScreen } from './screens/HistoryDetailScreen.js';
export { WalletSettingsScreen } from './screens/WalletSettingsScreen.js';
export { WalletConnectScreen } from './screens/WalletConnectScreen.js';
export { PrivacyPolicyScreen } from './screens/PrivacyPolicyScreen.js';
export { SupportScreen } from './screens/SupportScreen.js';
export { EvidenceScreen } from './screens/EvidenceScreen.js';
export type { EvidenceScreenProps } from './screens/EvidenceScreen.js';
export { SynthesisScreen } from './screens/SynthesisScreen.js';
export type { SynthesisScreenProps } from './screens/SynthesisScreen.js';

// Components — reusable
export { DesktopShell } from './components/DesktopShell.js';
export { DirectionalPolicyCard } from './components/DirectionalPolicyCard.js';
export { PreviewStepSequence } from './components/PreviewStepSequence.js';
export { RangeStatusBadge, getRangeStatusBadgeProps } from './components/RangeStatusBadge.js';
export { ExecutionStateCard } from './components/ExecutionStateCard.js';
export { HistoryEventRow } from './components/HistoryEventRow.js';
export { OffChainHistoryLabel } from './components/OffChainHistoryLabel.js';
export {
  DegradedCapabilityBanner,
  buildDegradedBannerMessage,
} from './components/DegradedCapabilityBanner.js';
export { ConnectWalletEntry } from './components/ConnectWalletEntry.js';
export { Icon } from './components/Icon.js';
export type { IconName } from './components/Icon.js';
export { Chip } from './components/Chip.js';
export type { ChipTone } from './components/Chip.js';
export { SectionHeader } from './components/SectionHeader.js';
export { PositionCard } from './components/PositionCard.js';
export { getMonitoringDisplay } from './components/PositionCardUtils.js';
export type { MonitoringDisplay, MonitoringTone } from './components/PositionCardUtils.js';
export { RegimeSection } from './components/RegimeSection.js';
export { PolicyInsightsSection } from './components/PolicyInsightsSection.js';
export { PositionPlanCard } from './components/PositionPlanCard.js';
export { EvidenceFamilyCard } from './components/EvidenceFamilyCard.js';
export type { EvidenceFamilyCardProps } from './components/EvidenceFamilyCard.js';

// Wallet connection utils
export {
  truncateAddress,
  buildWalletOptions,
  getConnectionOutcomeDisplay,
  buildConnectedWalletSummary,
  buildPlatformNotice,
} from './components/WalletConnectionUtils.js';
export type {
  WalletOption,
  WalletOptionKind,
  ConnectionOutcome,
  ConnectionOutcomeDisplay,
  PlatformNotice,
  ConnectedWalletSummary,
  FallbackState,
  WalletDiscoveryState,
  DiscoveredWallet,
  WalletConnectActions,
} from './components/WalletConnectionUtils.js';

// View models — for testing and screen composition
export { buildPreviewViewModel } from './view-models/PreviewViewModel.js';
export { buildExecutionStateViewModel } from './view-models/ExecutionStateViewModel.js';
export {
  buildPositionListViewModel,
  asMonitoringStatus,
} from './view-models/PositionListViewModel.js';
export type {
  PositionListItemViewModel,
  PositionListViewModel,
  MonitoringStatus,
  FinancialMetricViewModel,
} from './view-models/PositionListViewModel.js';
export { buildPositionDetailViewModel } from './view-models/PositionDetailViewModel.js';
export { buildPositionPlanViewModel } from './view-models/PositionPlanViewModel.js';
export type {
  PositionPlanViewModel,
  CurrentPlanDto,
  PlanLifecycleState,
  PlanAction,
} from './view-models/PositionPlanViewModel.js';
export { buildHistoryViewModel } from './view-models/HistoryViewModel.js';
export { buildWalletConnectViewModel } from './view-models/WalletConnectionViewModel.js';
export { buildWalletSettingsViewModel } from './view-models/WalletConnectionViewModel.js';
export type {
  WalletConnectViewModel,
  WalletSettingsViewModel,
} from './view-models/WalletConnectionViewModel.js';
export { buildRegimeViewModelBlock } from './view-models/RegimeViewModel.js';
export { buildPolicyInsightsViewModel } from './view-models/PolicyInsightsViewModel.js';
export type {
  PolicyInsightsViewModel,
  PolicyInsightsSeverity,
} from './view-models/PolicyInsightsViewModel.js';
export { buildSrThesesViewModel } from './view-models/SrThesesViewModel.js';
export type {
  SrThesesViewModel,
  SrThesisCardViewModel,
  SrThesisOverlayModel,
  SrThesisBiasTone,
} from './view-models/SrThesesViewModel.js';
export { buildEvidenceViewModel } from './view-models/EvidenceViewModel.js';
export type {
  EvidenceScreenViewModel,
  EvidenceFamilyCardViewModel,
  EvidenceContextualClaimViewModel,
  EvidenceFamilyCardRowViewModel,
  EvidenceResearchBriefViewModel,
  EvidenceDerivationInputViewModel,
  EvidenceFeatureDerivationViewModel,
} from './view-models/EvidenceViewModel.js';
export { buildSynthesisViewModel } from './view-models/SynthesisViewModel.js';
export type {
  SynthesisViewModel,
  SynthesisFamilyViewModel,
  SynthesisFamilyId,
  SynthesisFamilyStatus,
} from './view-models/SynthesisViewModel.js';

// Presenters
export { presentPositionDetail } from './presenters/PositionDetailPresenter.js';
export { presentPreview } from './presenters/PreviewPresenter.js';

// Design system
export { colors } from './design-system/colors.js';
export { typography } from './design-system/typography.js';
