import { describe, it, expect } from 'vitest';
import { getPositionDetail } from './GetPositionDetail.js';
import {
  FakeSupportedPositionReadPort,
  FIXTURE_POSITION_ID,
  FIXTURE_POSITION_IN_RANGE,
} from '@clmm/testing';
import { makePositionId } from '@clmm/domain';

describe('GetPositionDetail', () => {
  it('returns position when found', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([FIXTURE_POSITION_IN_RANGE]);
    const result = await getPositionDetail({
      positionId: FIXTURE_POSITION_ID,
      positionReadPort,
    });
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.position.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.position.rangeState.kind).toBe('in-range');
    }
  });

  it('returns not-found when position does not exist', async () => {
    const positionReadPort = new FakeSupportedPositionReadPort([]);
    const result = await getPositionDetail({
      positionId: makePositionId('nonexistent'),
      positionReadPort,
    });
    expect(result.kind).toBe('not-found');
  });
});
