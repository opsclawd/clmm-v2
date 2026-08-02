// This is the ONLY import surface for packages/ui and packages/testing.
// Do not add implementation details here.

// DTOs
export type {
  PositionSummaryDto,
  PositionDetailDto,
  ExecutionPreviewDto,
  PreviewStepDto,
  ExecutionAttemptDto,
  ExecutionApprovalDto,
  ExecutionSigningPayloadDto,
  PreparedPayloadDto,
  ActionableAlertDto,
  HistoryEventDto,
  MonitoringReadinessDto,
  EntryContextDto,
  SrLevel,
  SrLevelsBlock,
  SrThesisDto,
  SrThesesBlock,
  RegimeBlock,
  RegimeReason,
  RegimeReasonSeverity,
  RegimeFreshness,
  RegimeTelemetry,
  RegimeClmmSuitability,
  RegimeMetadata,
  PolicyInsightBlock,
  PolicyInsightClmmPolicy,
  PolicyInsightLevels,
  PolicyInsightFreshness,
  PolicyInsightRecommendedAction,
  PolicyInsightRiskLevel,
  PolicyInsightDataQuality,
  PolicyInsightsUnavailableReason,
  PolicyInsightMarketRegime,
  PolicyInsightFundamentalRegime,
  PolicyInsightPosture,
  PolicyInsightRangeBias,
  PolicyInsightRebalanceSensitivity,
  PolicyInsightFreshnessStatus,
  PolicyInsightSelectionStatus,
  PolicyInsightWarningCode,
  PolicyInsightReasonCode,
  PolicyInsightPositionScope,
  PolicyInsightBundleRef,
  PolicyInsightSourceRef,
  PolicyInsightEvidence,
  PolicyInsightWarning,
  PositionValueMetricDto,
  UnclaimedFeesMetricDto,
  PoolTvlMetricDto,
  PoolFees24hMetricDto,
  PoolFinancialMetricsDto,
  PositionListFinancialMetricsDto,
  RegimePlanActionType,
  RegimePlanAction,
  RegimePlanScope,
  RegimePlanConstraints,
  RegimePlanReason,
  RegimePlanRequest,
  RegimePlanResponse,
  RegimeExecutionResultStatus,
  RegimeExecutionResultCosts,
  RegimeExecutionResult,
} from '../dto/index.js';

export { parsePolicyInsightBlock } from '../dto/policyInsightValidator.js';
export { parseRegimePlanResponse, parseRegimeExecutionResult } from '../dto/regimePlanValidator.js';

// Port types needed by UI (capability + permission state)
export type { PlatformCapabilityState } from '../ports/index.js';

// Port interfaces needed by testing fakes and contracts
export type {
  SupportedPositionReadPort,
  RangeObservationPort,
  SwapQuotePort,
  ExecutionPreparationPort,
  ExecutionSubmissionPort,
  WalletSigningPort,
  NotificationPort,
  NotificationDedupPort,
  PlatformCapabilityPort,
  NotificationPermissionPort,
  DeepLinkEntryPort,
  DeepLinkMetadata,
  TriggerRepository,
  StoredExecutionAttempt,
  ExecutionRepository,
  ExecutionSessionRepository,
  ExecutionHistoryRepository,
  MonitoredWalletRepository,
  ObservabilityPort,
  ClockPort,
  IdGeneratorPort,
  DetectionTimingRecord,
  DeliveryTimingRecord,
  ReconciliationJobPort,
} from '../ports/index.js';
export type {
  WalletChallengeRepository,
  WalletChallengeRow,
  ConsumeAndEnrollResult,
  WalletEnrollmentApiPort,
  WalletMessageSigningPort,
  EnrollmentErrorCode,
  ChallengeDetails,
  ChallengeRequestResult,
  EnrollWithCredentialsResult,
  SignMessageOutcome,
} from '../ports/index.js';
export type {
  EpisodeTransition,
  FinalizationResult,
  BreachEpisodeRepository,
} from '../ports/BreachEpisodeRepository.js';

// Domain types re-exported for UI consumption.
// UI must NEVER import @clmm/domain directly.
export type {
  BreachDirection,
  ExecutionLifecycleState,
  ExecutionOrigin,
  DirectionalExitPolicyResult,
  MarketRegime,
  ClmmSuitabilityStatus,
} from '@clmm/domain';

export {
  applyDirectionalExitPolicy,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  makeClockTimestamp,
  makePositionId,
} from '@clmm/domain';

// DTO validation (needed by client-side API layer)
export {
  isPositionSummaryDto,
  isPositionDetailDto,
  isPositionSummaryDtoArray,
  isPositionSummaryRecord,
  isPositionListFinancialMetricsDto,
} from '../dto/validation.js';

// Use cases (needed by testing scenarios)
export { scanPositionsForBreaches } from '../use-cases/triggers/ScanPositionsForBreaches.js';
export { qualifyActionableTrigger } from '../use-cases/triggers/QualifyActionableTrigger.js';
export { createExecutionPreview } from '../use-cases/previews/CreateExecutionPreview.js';
export { getExecutionPreview } from '../use-cases/previews/GetExecutionPreview.js';
export { refreshExecutionPreview } from '../use-cases/previews/RefreshExecutionPreview.js';
export { listSupportedPositions } from '../use-cases/positions/ListSupportedPositions.js';
export { getPositionDetail } from '../use-cases/positions/GetPositionDetail.js';
export { getMonitoringReadiness } from '../use-cases/positions/GetMonitoringReadiness.js';
export { listActionableAlerts } from '../use-cases/alerts/ListActionableAlerts.js';
export { acknowledgeAlert } from '../use-cases/alerts/AcknowledgeAlert.js';
export { connectWalletSession } from '../use-cases/wallet/ConnectWalletSession.js';
export { syncPlatformCapabilities } from '../use-cases/wallet/SyncPlatformCapabilities.js';
export { verifyWalletEnrollment } from '../use-cases/wallet/VerifyWalletEnrollment.js';
export type { EnrollmentOutcome } from '../use-cases/wallet/VerifyWalletEnrollment.js';
export {
  requestWalletSignature,
  PreviewNotFoundError,
  PreviewApprovalNotAllowedError,
  MissingEpisodeIdForTriggerDerivedApprovalError,
} from '../use-cases/execution/RequestWalletSignature.js';
export type { RequestWalletSignatureResult } from '../use-cases/execution/RequestWalletSignature.js';
export { resumeExecutionAttempt } from '../use-cases/execution/ResumeExecutionAttempt.js';
export { reconcileExecutionAttempt } from '../use-cases/execution/ReconcileExecutionAttempt.js';
export { getAwaitingSignaturePayload } from '../use-cases/execution/GetAwaitingSignaturePayload.js';
export { submitExecutionAttempt } from '../use-cases/execution/SubmitExecutionAttempt.js';
export { recordSignatureDecline } from '../use-cases/execution/RecordSignatureDecline.js';
export { recordSignatureInterruption } from '../use-cases/execution/RecordSignatureInterruption.js';
export { recordExecutionAbandonment } from '../use-cases/execution/RecordExecutionAbandonment.js';
export { getExecutionAttemptDetail } from '../use-cases/execution/GetExecutionAttemptDetail.js';
export { getExecutionHistory } from '../use-cases/execution/GetExecutionHistory.js';
export { getWalletExecutionHistory } from '../use-cases/execution/GetWalletExecutionHistory.js';
export { resolveExecutionEntryContext } from '../use-cases/execution/ResolveExecutionEntryContext.js';
export { dispatchActionableNotification } from '../use-cases/notifications/DispatchActionableNotification.js';
export { requestPositionPlan } from '../use-cases/plans/RequestPositionPlan.js';
export { recordPlanDecision } from '../use-cases/plans/RecordPlanDecision.js';
export { createPlanExitPreview } from '../use-cases/plans/CreatePlanExitPreview.js';
export { approvePlanExit } from '../use-cases/plans/ApprovePlanExit.js';
