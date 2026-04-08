import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, PositionId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeExecutionPreparationPort implements ExecutionPreparationPort {
  async prepareExecution(_params: {
    plan: ExecutionPlan;
    walletId: WalletId;
    positionId: PositionId;
  }): Promise<{ serializedPayload: Uint8Array; preparedAt: ClockTimestamp }> {
    return {
      serializedPayload: new Uint8Array([9, 8, 7]),
      preparedAt: makeClockTimestamp(Date.now()),
    };
  }
}
