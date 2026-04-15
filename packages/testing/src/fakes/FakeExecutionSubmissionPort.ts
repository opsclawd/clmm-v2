import type { ExecutionSubmissionPort } from '@clmm/application';
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp, ExecutionStep } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeExecutionSubmissionPort implements ExecutionSubmissionPort {
  private _confirmedSteps: ExecutionStep['kind'][] = [];
  private _allFailed = false;
  private _totalReferences = 3;

  setConfirmedSteps(steps: ExecutionStep['kind'][]): void {
    this._confirmedSteps = steps;
  }

  setAllFailed(value: boolean): void {
    this._allFailed = value;
  }

  setTotalReferenceCount(count: number): void {
    this._totalReferences = count;
  }

  async submitExecution(
    _payload: Uint8Array,
    plannedStepKinds: ReadonlyArray<ExecutionStep['kind']> = ['swap-assets'],
  ): Promise<{ references: TransactionReference[]; submittedAt: ClockTimestamp }> {
    const uniqueStepKinds = [...new Set(plannedStepKinds)];
    return {
      references: uniqueStepKinds.map((stepKind) => ({
        signature: 'fake-sig-1',
        stepKind,
      })),
      submittedAt: makeClockTimestamp(Date.now()),
    };
  }

  async reconcileExecution(
    _refs: TransactionReference[],
  ): Promise<{
    confirmedSteps: Array<ExecutionStep['kind']>;
    finalState: ExecutionLifecycleState | null;
  }> {
    if (this._confirmedSteps.length === this._totalReferences) {
      return { confirmedSteps: this._confirmedSteps, finalState: { kind: 'confirmed' } };
    }
    if (this._confirmedSteps.length > 0) {
      return { confirmedSteps: this._confirmedSteps, finalState: { kind: 'partial' } };
    }
    if (this._allFailed) {
      return { confirmedSteps: [], finalState: { kind: 'failed' } };
    }
    return { confirmedSteps: [], finalState: null };
  }
}
