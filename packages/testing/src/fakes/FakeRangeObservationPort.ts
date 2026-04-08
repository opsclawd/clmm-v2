import type { RangeObservationPort } from '@clmm/application';
import type { PositionId, ClockTimestamp } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';

type Observation = {
  positionId: PositionId;
  currentPrice: number;
  observedAt: ClockTimestamp;
};

export class FakeRangeObservationPort implements RangeObservationPort {
  private readonly _observations = new Map<PositionId, Observation>();

  setObservation(positionId: PositionId, currentPrice: number): void {
    this._observations.set(positionId, {
      positionId,
      currentPrice,
      observedAt: makeClockTimestamp(Date.now()),
    });
  }

  async observeRangeState(positionId: PositionId): Promise<Observation> {
    const obs = this._observations.get(positionId);
    if (!obs) {
      throw new Error(
        `FakeRangeObservationPort: no observation set for position ${positionId}`,
      );
    }
    return obs;
  }
}
