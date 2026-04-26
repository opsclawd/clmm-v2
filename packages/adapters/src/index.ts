// Client-facing adapters (imported by apps/app composition bootstrap)
export { BrowserWalletSigningAdapter } from './outbound/wallet-signing/BrowserWalletSigningAdapter';
export { NativePlatformCapabilityAdapter } from './outbound/capabilities/NativePlatformCapabilityAdapter';
export { WebPlatformCapabilityAdapter } from './outbound/capabilities/WebPlatformCapabilityAdapter';
export { ExpoDeepLinkAdapter } from './outbound/capabilities/ExpoDeepLinkAdapter';
export { WebDeepLinkAdapter } from './outbound/capabilities/WebDeepLinkAdapter';
export { NativeNotificationPermissionAdapter } from './outbound/capabilities/NativeNotificationPermissionAdapter';
export { WebNotificationPermissionAdapter } from './outbound/capabilities/WebNotificationPermissionAdapter';

// Server-side adapters (imported by NestJS modules internally — re-exported for completeness)
export { SolanaPositionSnapshotReader } from './outbound/solana-position-reads/SolanaPositionSnapshotReader';
export { OrcaPositionReadAdapter } from './outbound/solana-position-reads/OrcaPositionReadAdapter';
export { SolanaRangeObservationAdapter } from './outbound/solana-position-reads/SolanaRangeObservationAdapter';
export { JupiterQuoteAdapter } from './outbound/swap-execution/JupiterQuoteAdapter';
export { SolanaExecutionPreparationAdapter } from './outbound/swap-execution/SolanaExecutionPreparationAdapter';
export { SolanaExecutionSubmissionAdapter } from './outbound/swap-execution/SolanaExecutionSubmissionAdapter';
export { NativeWalletSigningAdapter } from './outbound/wallet-signing/NativeWalletSigningAdapter';
export { DurableNotificationEventAdapter } from './outbound/notifications/DurableNotificationEventAdapter';
export { OperationalStorageAdapter } from './outbound/storage/OperationalStorageAdapter';
export { OffChainHistoryStorageAdapter } from './outbound/storage/OffChainHistoryStorageAdapter';
export { TelemetryAdapter } from './outbound/observability/TelemetryAdapter';
export { JupiterPriceAdapter } from './outbound/price/JupiterPriceAdapter';
