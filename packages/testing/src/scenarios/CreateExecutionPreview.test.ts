import { describe, it, expect, beforeEach } from 'vitest';
import { createExecutionPreview } from '@clmm/application';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FIXTURE_POSITION_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH, UPPER_BOUND_BREACH } from '@clmm/domain';

describe('CreateExecutionPreview', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let swapQuote: FakeSwapQuotePort;
  let executionRepo: FakeExecutionRepository;

  beforeEach(() => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    swapQuote = new FakeSwapQuotePort();
    executionRepo = new FakeExecutionRepository();
  });

  it('creates a preview with SOL→USDC swap for lower-bound breach', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.plan.postExitPosture.kind).toBe('exit-to-usdc');
    expect(result.plan.swapInstruction.fromAsset).toBe('SOL');
    expect(result.plan.swapInstruction.toAsset).toBe('USDC');
  });

  it('creates a preview with USDC→SOL swap for upper-bound breach', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: UPPER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.plan.postExitPosture.kind).toBe('exit-to-sol');
    expect(result.plan.swapInstruction.fromAsset).toBe('USDC');
    expect(result.plan.swapInstruction.toAsset).toBe('SOL');
  });

  it('persists the preview and returns a previewId', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.previewId).toBeTruthy();
    expect(executionRepo.previews.size).toBe(1);
  });

  it('marks preview as fresh immediately after creation', async () => {
    const result = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    expect(result.preview.freshness.kind).toBe('fresh');
  });
});
