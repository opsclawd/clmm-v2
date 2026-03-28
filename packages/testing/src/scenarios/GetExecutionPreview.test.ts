import { describe, it, expect, beforeEach } from 'vitest';
import { getExecutionPreview, createExecutionPreview } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('GetExecutionPreview', () => {
  let executionRepo: FakeExecutionRepository;
  let previewId: string;

  beforeEach(async () => {
    executionRepo = new FakeExecutionRepository();
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: new FakeSwapQuotePort(),
      executionRepo,
      clock: new FakeClockPort(),
      ids: new FakeIdGeneratorPort(),
    });
    previewId = result.previewId;
  });

  it('returns the preview with positionId and breachDirection when it exists', async () => {
    const result = await getExecutionPreview({ previewId, executionRepo });
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.previewId).toBe(previewId);
      expect(result.positionId).toBe(FIXTURE_POSITION_ID);
      expect(result.breachDirection.kind).toBe('lower-bound-breach');
      expect(result.preview.plan).toBeDefined();
    }
  });

  it('returns not-found for unknown previewId', async () => {
    const result = await getExecutionPreview({ previewId: 'no-such-preview', executionRepo });
    expect(result.kind).toBe('not-found');
  });
});
