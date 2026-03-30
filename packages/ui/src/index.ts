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

// Components — reusable
export { DesktopShell } from './components/DesktopShell.js';
export { DirectionalPolicyCard } from './components/DirectionalPolicyCard.js';
export { PreviewStepSequence } from './components/PreviewStepSequence.js';
export { RangeStatusBadge, getRangeStatusBadgeProps } from './components/RangeStatusBadge.js';
export { ExecutionStateCard } from './components/ExecutionStateCard.js';
export { HistoryEventRow } from './components/HistoryEventRow.js';
export { OffChainHistoryLabel } from './components/OffChainHistoryLabel.js';
export { DegradedCapabilityBanner, buildDegradedBannerMessage } from './components/DegradedCapabilityBanner.js';
export { ConnectWalletEntry } from './components/ConnectWalletEntry.js';

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
} from './components/WalletConnectionUtils.js';

// View models — for testing and screen composition
export { buildPreviewViewModel } from './view-models/PreviewViewModel.js';
export { buildExecutionStateViewModel } from './view-models/ExecutionStateViewModel.js';
export { buildPositionListViewModel } from './view-models/PositionListViewModel.js';
export { buildPositionDetailViewModel } from './view-models/PositionDetailViewModel.js';
export { buildHistoryViewModel } from './view-models/HistoryViewModel.js';
export { buildWalletConnectViewModel } from './view-models/WalletConnectionViewModel.js';
export { buildWalletSettingsViewModel } from './view-models/WalletConnectionViewModel.js';
export type { WalletConnectViewModel, WalletSettingsViewModel } from './view-models/WalletConnectionViewModel.js';

// Presenters
export { presentPositionDetail } from './presenters/PositionDetailPresenter.js';
export { presentPreview } from './presenters/PreviewPresenter.js';

// Design system
export { colors } from './design-system/colors.js';
export { typography } from './design-system/typography.js';
