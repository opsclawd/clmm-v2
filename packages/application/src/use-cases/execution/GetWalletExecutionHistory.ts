import type { HistoryEvent, WalletId } from '@clmm/domain';
import type { ExecutionHistoryRepository } from '../../ports/index.js';

export type GetWalletExecutionHistoryInput = {
  readonly walletId: WalletId;
  readonly historyRepo: ExecutionHistoryRepository;
};

export type GetWalletExecutionHistoryResult = {
  readonly history: readonly HistoryEvent[];
};

export async function getWalletExecutionHistory(
  input: GetWalletExecutionHistoryInput,
): Promise<GetWalletExecutionHistoryResult> {
  const history = await input.historyRepo.getWalletHistory(input.walletId);
  return { history };
}
