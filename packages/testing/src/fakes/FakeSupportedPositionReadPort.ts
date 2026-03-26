import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, PositionId, WalletId } from '@clmm/domain';

export class FakeSupportedPositionReadPort implements SupportedPositionReadPort {
  private readonly _positions: LiquidityPosition[];

  constructor(positions: LiquidityPosition[] = []) {
    this._positions = positions;
  }

  async listSupportedPositions(_walletId: WalletId): Promise<LiquidityPosition[]> {
    return [...this._positions];
  }

  async getPosition(positionId: PositionId): Promise<LiquidityPosition | null> {
    return this._positions.find((p) => p.positionId === positionId) ?? null;
  }
}
