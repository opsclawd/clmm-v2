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
} from '../dto/index.js';

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
  DirectionalExitPolicyResult,
} from '@clmm/domain';

export {
  applyDirectionalExitPolicy,
  LOWER_BOUND_BREACH,
  UPPER_BOUND_BREACH,
  makeClockTimestamp,
  makePositionId,
} from '@clmm/domain';

// Use cases (needed by testing scenarios)
export { scanPositionsForBreaches } from '../use-cases/triggers/ScanPositionsForBreaches.js';
export { qualifyActionableTrigger } from '../use-cases/triggers/QualifyActionableTrigger.js';
export { createExecutionPreview } from '../use-cases/previews/CreateExecutionPreview.js';
export { refreshExecutionPreview } from '../use-cases/previews/RefreshExecutionPreview.js';
export {
  requestWalletSignature,
  PreviewNotFoundError,
  PreviewApprovalNotAllowedError,
} from '../use-cases/execution/RequestWalletSignature.js';
export type { RequestWalletSignatureResult } from '../use-cases/execution/RequestWalletSignature.js';
export { resumeExecutionAttempt } from '../use-cases/execution/ResumeExecutionAttempt.js';
export { reconcileExecutionAttempt } from '../use-cases/execution/ReconcileExecutionAttempt.js';
