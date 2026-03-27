import { describe, it, expect, beforeEach } from 'vitest';
import { refreshExecutionPreview, createExecutionPreview } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('RefreshExecutionPreview', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let swapQuote: FakeSwapQuotePort;
  let executionRepo: FakeExecutionRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort(1_000_000);
    ids = new FakeIdGeneratorPort();
    swapQuote = new FakeSwapQuotePort();
    executionRepo = new FakeExecutionRepository();
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    previewId = result.previewId;
  });

  it('refreshed preview is fresh and replaces the old one', async () => {
    clock.advance(45_000);
    const result = await refreshExecutionPreview({
      previewId,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.preview.freshness.kind).toBe('fresh');
  });

  it('preserves breach direction after refresh — cannot become direction-agnostic', async () => {
    const result = await refreshExecutionPreview({
      previewId,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.plan.postExitPosture.kind).toBe('exit-to-usdc');
    expect(result.plan.swapInstruction.fromAsset).toBe('SOL');
  });
});
