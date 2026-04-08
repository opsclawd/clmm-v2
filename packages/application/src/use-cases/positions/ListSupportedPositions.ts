import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { WalletId, LiquidityPosition } from '@clmm/domain';

export type ListSupportedPositionsResult = {
  positions: LiquidityPosition[];
};

export async function listSupportedPositions(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
}): Promise<ListSupportedPositionsResult> {
  const positions = await params.positionReadPort.listSupportedPositions(params.walletId);
  return { positions };
}
