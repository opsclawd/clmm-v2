import type { ExecutionSubmissionPort } from '@clmm/application';
import type { TransactionReference, ExecutionLifecycleState, ClockTimestamp, ExecutionStep } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeExecutionSubmissionPort implements ExecutionSubmissionPort {
  private _confirmedSteps: ExecutionStep['kind'][] = [];
  private _allFailed = false;

  setConfirmedSteps(steps: ExecutionStep['kind'][]): void {
    this._confirmedSteps = steps;
  }

  setAllFailed(value: boolean): void {
    this._allFailed = value;
  }

  async submitExecution(
    _payload: Uint8Array,
  ): Promise<{ references: TransactionReference[]; submittedAt: ClockTimestamp }> {
    return {
      references: [{ signature: 'fake-sig-1', stepKind: 'remove-liquidity' }],
      submittedAt: makeClockTimestamp(Date.now()),
    };
  }

  async reconcileExecution(
    _refs: TransactionReference[],
  ): Promise<{
    confirmedSteps: Array<ExecutionStep['kind']>;
    finalState: ExecutionLifecycleState | null;
  }> {
    if (this._confirmedSteps.length === 3) {
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
