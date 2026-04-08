import type {
  PositionId,
  BreachDirection,
  ClockTimestamp,
} from '../shared/index.js';
import type { ExecutionLifecycleState, TransactionReference } from '../execution/index.js';

export type HistoryEventType =
  | 'trigger-created'
  | 'preview-created'
  | 'preview-refreshed'
  | 'preview-expired'
  | 'signature-requested'
  | 'signature-declined'
  | 'signature-interrupted'
  | 'submitted'
  | 'reconciliation-update'
  | 'confirmed'
  | 'failed'
  | 'partial-completion'
  | 'abandoned';

export type HistoryEvent = {
  readonly eventId: string;
  readonly positionId: PositionId;
  readonly eventType: HistoryEventType;
  readonly breachDirection: BreachDirection;
  readonly occurredAt: ClockTimestamp;
  readonly lifecycleState?: ExecutionLifecycleState;
  readonly transactionReference?: TransactionReference;
  // Explicitly NOT: receipt, attestation, proof, claim, or canonical certificate
};

export type HistoryTimeline = {
  readonly positionId: PositionId;
  readonly events: readonly HistoryEvent[];
};

export type ExecutionOutcomeSummary = {
  readonly positionId: PositionId;
  readonly breachDirection: BreachDirection;
  readonly finalState: ExecutionLifecycleState;
  readonly transactionReferences: readonly TransactionReference[];
  readonly completedAt: ClockTimestamp;
  // Note: this is an operational summary, NOT an on-chain receipt or attestation
};
