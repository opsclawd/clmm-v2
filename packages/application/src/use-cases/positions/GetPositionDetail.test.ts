import { describe, it, expect } from 'vitest';
import { getPositionDetail } from './GetPositionDetail.js';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_POSITION_ID,
  FIXTURE_POSITION_IN_RANGE,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { makePositionId, makeWalletId } from '@clmm/domain';

describe('GetPositionDetail', () => {
  it('returns position when wallet owns it', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
    });
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.position.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.position.rangeState.kind).toBe('in-range');
    }
  });

  it('returns not-found when requested wallet does not own the position', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const result = await getPositionDetail({
      walletId: makeWalletId('other-wallet-id'),
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
    });
    expect(result.kind).toBe('not-found');
  });

  it('returns not-found when position does not exist', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const result = await getPositionDetail({
      walletId: FIXTURE_WALLET_ID,
      positionId: makePositionId('nonexistent'),
      positionReadPort,
    });
    expect(result.kind).toBe('not-found');
  });
});
