import type { ExecutionPreparationPort } from '@clmm/application';
import type { ExecutionPlan, WalletId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

export class FakeExecutionPreparationPort implements ExecutionPreparationPort {
  async prepareExecution(
    _plan: ExecutionPlan,
    _walletId: WalletId,
  ): Promise<{ serializedPayload: Uint8Array; preparedAt: ClockTimestamp }> {
    return {
      serializedPayload: new Uint8Array([9, 8, 7]),
      preparedAt: makeClockTimestamp(Date.now()),
    };
  }
}
