import type { SupportedPositionReadPort } from '@clmm/application';
import type { LiquidityPosition, PositionId, WalletId, PoolId, PoolData, PositionDetail } from '@clmm/domain';

export class FakeSupportedPositionReadPort implements SupportedPositionReadPort {
  constructor(
    private readonly _positions: LiquidityPosition[] = [],
    private readonly _poolDataMap: Record<string, PoolData> = {},
    private readonly _positionDetail: PositionDetail | null = null,
  ) {}

  async listSupportedPositions(_walletId: WalletId): Promise<LiquidityPosition[]> {
    return [...this._positions];
  }

  async getPosition(walletId: WalletId, positionId: PositionId): Promise<LiquidityPosition | null> {
    return this._positions.find((p) => p.walletId === walletId && p.positionId === positionId) ?? null;
  }

  async getPositionDetail(_walletId: WalletId, _positionId: PositionId): Promise<PositionDetail | null> {
    return this._positionDetail;
  }

  async getPoolData(poolId: PoolId): Promise<PoolData | null> {
    return this._poolDataMap[poolId] ?? null;
  }
}