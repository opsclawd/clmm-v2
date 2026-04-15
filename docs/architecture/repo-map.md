# Repository Map

## Frozen Repository Structure

Do not add top-level directories or packages outside this shape without an explicit architectural decision:

```text
apps/
  app/                         Expo shell only
    app/                       Expo Router routes and deep-link entrypoints
    src/composition/           top-level client composition bootstrap
    src/platform/              native and web edge logic only

packages/
  domain/                      pure business model, zero external deps
  application/                 use cases, DTOs, and port contracts
  adapters/                    external SDK, storage, HTTP, jobs, notifications
  ui/                          screens, presenters, view-models, components, design system
  config/                      tsconfig, eslint, CI, boundaries
  testing/                     fakes, fixtures, contracts, scenarios

docs/
  architecture/
```

`apps/app` does not own screens, presenters, view-models, components, or business policy.
`packages/ui` owns all screens.

## Package Responsibilities

| Package | Responsibility |
|---------|----------------|
| `packages/domain` | Entities, value objects, policies, reducers |
| `packages/application` | Port-driven orchestration and use cases |
| `packages/adapters` | SDK, storage, HTTP, job, and platform implementations |
| `packages/ui` | Screens, presenters, view-models, components |
| `apps/app` | Expo shell, route entrypoints, composition, platform bootstrap |
| `packages/testing` | Shared fakes, fixtures, scenarios, and contracts |

## Dependency Rules

| Package | May import |
|---------|-----------|
| `packages/domain` | only itself |
| `packages/application` | `packages/domain` and its own port contracts only |
| `packages/adapters` | `packages/application`, `packages/domain`, approved external SDKs |
| `packages/ui` | `packages/application/public` and its own UI code only |
| `apps/app` | `packages/ui`, `packages/application/public`, `packages/config`, approved composition bootstrap |
| `packages/testing` | public APIs of all packages only |

## Outbound Ports And Primary Adapters

| Port | Primary Adapter |
|------|----------------|
| `SupportedPositionReadPort` | `OrcaPositionReadAdapter` |
| `RangeObservationPort` | `SolanaRangeObservationAdapter` |
| `SwapQuotePort` | `JupiterQuoteAdapter` |
| `ExecutionPreparationPort` | `SolanaExecutionPreparationAdapter` |
| `ExecutionSubmissionPort` | `SolanaExecutionSubmissionAdapter` |
| `WalletSigningPort` | `NativeWalletSigningAdapter`, `BrowserWalletSigningAdapter` |
| `NotificationPort` | `ExpoPushAdapter`, `WebPushAdapter`, `InAppAlertAdapter` |
| `PlatformCapabilityPort` | platform capability adapters |
| `NotificationPermissionPort` | platform permission adapters |
| `DeepLinkEntryPort` | deep-link adapters |
| `ExecutionHistoryRepository` | `OffChainHistoryStorageAdapter` |
| `TriggerRepository` | `OperationalStorageAdapter` |
| `ExecutionRepository` | `OperationalStorageAdapter` |
| `ExecutionSessionRepository` | `OperationalStorageAdapter` |
| `ObservabilityPort` | `TelemetryAdapter` |
| `ClockPort` | platform adapter |
| `IdGeneratorPort` | platform adapter |

## Application Use Cases

Worker and BFF runtime:

- `ScanPositionsForBreaches`
- `QualifyActionableTrigger`
- `CreateExecutionPreview`
- `RefreshExecutionPreview`
- `ReconcileExecutionAttempt`
- `DispatchActionableNotification`

Client runtime:

- `ConnectWalletSession`
- `SyncPlatformCapabilities`
- `AcknowledgeAlert`
- `ApproveExecution`
- `RequestWalletSignature`
- `ResolveExecutionEntryContext`
- `ResumeExecutionAttempt`
- `RecordSignatureDecline`
- `RecordExecutionAbandonment`

Shared query facade:

- `ListSupportedPositions`
- `GetPositionDetail`
- `ListActionableAlerts`
- `GetExecutionPreview`
- `GetExecutionHistory`
- `GetExecutionAttemptDetail`
- `GetMonitoringReadiness`

## State Ownership

| State | Source Of Truth |
|-------|-----------------|
| Position snapshots | Backend read model via Postgres and Drizzle |
| Range observations and breach episodes | Backend worker state via pg-boss and Postgres |
| Actionable triggers | Railway Postgres shared by mobile and web |
| Preview freshness and estimates | Railway Postgres, client cached |
| Execution attempt and awaiting-signature state | Railway Postgres |
| Terminal lifecycle state | Railway Postgres reconciliation projection |
| Execution history timeline | Off-chain Postgres storage |
| Private keys and signature authority | Wallet only |
