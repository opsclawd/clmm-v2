/**
 * OrcaPositionReadAdapter
 *
 * Translates Orca whirlpool position data into domain LiquidityPosition DTOs.
 * This adapter NEVER decides breach direction or target posture.
 * All direction decisions happen in packages/domain via DirectionalExitPolicyService.
 *
 * ⚠️ Use solana-adapter-docs skill before editing — @orca-so/whirlpools API changes
 */
import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, WalletId, PositionId } from '@clmm/domain';
import {
  makePositionId,
  makePoolId,
  makeClockTimestamp,
  evaluateRangeState,
} from '@clmm/domain';

export class OrcaPositionReadAdapter implements SupportedPositionReadPort {
  constructor(private readonly rpcUrl: string) {}

  async listSupportedPositions(walletId: WalletId): Promise<LiquidityPosition[]> {
    throw new Error('OrcaPositionReadAdapter.listSupportedPositions: invoke solana-adapter-docs skill first');
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition | null> {
    throw new Error('OrcaPositionReadAdapter.getPosition: invoke solana-adapter-docs skill first');
  }
}
