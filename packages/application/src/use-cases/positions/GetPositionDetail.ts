import type { SupportedPositionReadPort } from '../../ports/index.js';
import type { PositionId, LiquidityPosition } from '@clmm/domain';

export type GetPositionDetailResult =
  | { kind: 'found'; position: LiquidityPosition }
  | { kind: 'not-found' };

export async function getPositionDetail(params: {
  positionId: PositionId;
  positionReadPort: SupportedPositionReadPort;
}): Promise<GetPositionDetailResult> {
  const position = await params.positionReadPort.getPosition(params.positionId);
  if (!position) return { kind: 'not-found' };
  return { kind: 'found', position };
}
