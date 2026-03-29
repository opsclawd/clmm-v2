import { describe, it, expect, beforeEach } from 'vitest';
import { approveExecution } from './ApproveExecution.js';
import { createExecutionPreview } from '../previews/CreateExecutionPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeWalletSigningPort,
  FakeExecutionSubmissionPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('ApproveExecution', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let swapQuote: FakeSwapQuotePort;
  let executionRepo: FakeExecutionRepository;
  let prepPort: FakeExecutionPreparationPort;
  let signingPort: FakeWalletSigningPort;
  let submissionPort: FakeExecutionSubmissionPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    swapQuote = new FakeSwapQuotePort();
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    signingPort = new FakeWalletSigningPort();
    submissionPort = new FakeExecutionSubmissionPort();
    historyRepo = new FakeExecutionHistoryRepository();

    const created = await createExecutionPreview({
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      swapQuotePort: swapQuote,
      executionRepo,
      clock,
      ids,
    });
    previewId = created.previewId;
  });

  it('moves lifecycle to submitted when user signs', async () => {
    const result = await approveExecution({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('submitted');
    const storedAttempt = await executionRepo.getAttempt(result.attemptId);
    expect(storedAttempt?.breachDirection).toEqual(LOWER_BOUND_BREACH);
  });

  it('records decline when user declines to sign', async () => {
    signingPort.willDecline();
    const result = await approveExecution({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(result.kind).toBe('declined');
  });

  it('appends history events during execution', async () => {
    await approveExecution({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      submissionPort,
      historyRepo,
      clock,
      ids,
    });
    expect(historyRepo.events.length).toBeGreaterThan(0);
    for (const event of historyRepo.events) {
      expect(event.breachDirection).toBeDefined();
    }
  });
});
