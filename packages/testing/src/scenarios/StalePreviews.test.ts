import { describe, it, expect } from 'vitest';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
} from '../fakes/index.js';
import { createExecutionPreview, refreshExecutionPreview } from '@clmm/application';
import { evaluatePreviewFreshness, LOWER_BOUND_BREACH } from '@clmm/domain';
import { FIXTURE_POSITION_ID } from '../fixtures/index.js';

describe('Stale preview smoke', () => {
  it('preview becomes stale after 30s, expired after 60s', async () => {
    const clock = new FakeClockPort(1_000_000);
    const ids = new FakeIdGeneratorPort();
    const swapQuote = new FakeSwapQuotePort();
    const repo = new FakeExecutionRepository();

    const { preview } = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo: repo,
      clock,
      ids,
    });

    clock.advance(31_000);
    const staleFreshness = evaluatePreviewFreshness(preview.estimatedAt, clock.now());
    expect(staleFreshness.kind).toBe('stale');

    clock.advance(30_000);
    const expiredFreshness = evaluatePreviewFreshness(preview.estimatedAt, clock.now());
    expect(expiredFreshness.kind).toBe('expired');
  });

  it('refresh produces a fresh preview', async () => {
    const clock = new FakeClockPort(1_000_000);
    const ids = new FakeIdGeneratorPort();
    const swapQuote = new FakeSwapQuotePort();
    const repo = new FakeExecutionRepository();

    const original = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo: repo,
      clock,
      ids,
    });

    clock.advance(90_000);

    const refreshed = await refreshExecutionPreview({
      previewId: original.previewId,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo: repo,
      clock,
      ids,
    });

    expect(refreshed.preview.freshness.kind).toBe('fresh');
    expect(refreshed.plan.postExitPosture.kind).toBe('exit-to-usdc');
  });
});
