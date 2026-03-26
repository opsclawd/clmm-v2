import type {
  SupportedPositionReadPort,
  ClockPort,
  IdGeneratorPort,
} from '../../ports/index.js';
import type { WalletId, BreachDirection, PositionId, ClockTimestamp } from '@clmm/domain';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';

export type BreachObservationResult = {
  positionId: PositionId;
  direction: BreachDirection;
  observedAt: ClockTimestamp;
  episodeId: string;
};

export async function scanPositionsForBreaches(params: {
  walletId: WalletId;
  positionReadPort: SupportedPositionReadPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
}): Promise<BreachObservationResult[]> {
  const { walletId, positionReadPort, clock, ids } = params;
  const positions = await positionReadPort.listSupportedPositions(walletId);
  const now = clock.now();
  const results: BreachObservationResult[] = [];

  for (const position of positions) {
    if (position.rangeState.kind === 'below-range') {
      results.push({
        positionId: position.positionId,
        direction: LOWER_BOUND_BREACH,
        observedAt: now,
        episodeId: ids.generateId(),
      });
    } else if (position.rangeState.kind === 'above-range') {
      results.push({
        positionId: position.positionId,
        direction: UPPER_BOUND_BREACH,
        observedAt: now,
        episodeId: ids.generateId(),
      });
    }
  }

  return results;
}
