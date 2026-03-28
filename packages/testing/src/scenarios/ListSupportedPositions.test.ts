import { describe, it, expect } from 'vitest';
import { listSupportedPositions } from '@clmm/application';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_POSITION_BELOW_RANGE,
} from '@clmm/testing';

describe('ListSupportedPositions', () => {
  it('returns all positions for a wallet', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([
      FIXTURE_POSITION_IN_RANGE,
      FIXTURE_POSITION_BELOW_RANGE,
    ]);
    const result = await listSupportedPositions({ walletId: FIXTURE_WALLET_ID, positionReadPort });
    expect(result.positions).toHaveLength(2);
  });

  it('returns empty list when wallet has no positions', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const result = await listSupportedPositions({ walletId: FIXTURE_WALLET_ID, positionReadPort });
    expect(result.positions).toHaveLength(0);
  });

  it('preserves positionId and rangeState from the port', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const result = await listSupportedPositions({ walletId: FIXTURE_WALLET_ID, positionReadPort });
    expect(result.positions[0]?.positionId).toBe(FIXTURE_POSITION_IN_RANGE.positionId);
    expect(result.positions[0]?.rangeState).toBeDefined();
  });
});
