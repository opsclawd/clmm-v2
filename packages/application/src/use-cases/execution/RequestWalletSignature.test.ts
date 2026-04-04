import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestWalletSignature,
  PreviewApprovalNotAllowedError,
  PreviewNotFoundError,
} from './RequestWalletSignature.js';
import { createExecutionPreview } from '../previews/CreateExecutionPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeExecutionHistoryRepository,
  FIXTURE_POSITION_ID,
  FIXTURE_WALLET_ID,
} from '@clmm/testing';
import { LOWER_BOUND_BREACH } from '@clmm/domain';

describe('RequestWalletSignature', () => {
  let clock: FakeClockPort;
  let ids: FakeIdGeneratorPort;
  let executionRepo: FakeExecutionRepository;
  let prepPort: FakeExecutionPreparationPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    historyRepo = new FakeExecutionHistoryRepository();

    const swapQuote = new FakeSwapQuotePort();
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

  it('persists awaiting-signature attempt, prepared payload, and history for a fresh preview', async () => {
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result).toEqual({
      attemptId: 'fake-1',
      lifecycleState: { kind: 'awaiting-signature' },
      breachDirection: LOWER_BOUND_BREACH,
    });
    expect(result).not.toHaveProperty('kind');
    expect(result).not.toHaveProperty('signedPayload');

    await expect(executionRepo.getAttempt(result.attemptId)).resolves.toEqual({
      attemptId: result.attemptId,
      previewId,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      lifecycleState: { kind: 'awaiting-signature' },
      completedSteps: [],
      transactionReferences: [],
    });
    expect(executionRepo.preparedPayloads.get(result.attemptId)).toEqual({
      payloadId: 'fake-2',
      attemptId: result.attemptId,
      unsignedPayload: new Uint8Array([9, 8, 7]),
      payloadVersion: 'v1',
      expiresAt: 1_060_000,
      createdAt: 1_000_000,
    });
    expect(historyRepo.events).toEqual([
      {
        eventId: 'fake-3',
        positionId: FIXTURE_POSITION_ID,
        eventType: 'signature-requested',
        breachDirection: LOWER_BOUND_BREACH,
        occurredAt: 1_000_000,
        lifecycleState: { kind: 'awaiting-signature' },
      },
    ]);
  });

  it('throws PreviewNotFoundError when the preview record does not exist', async () => {
    await expect(requestWalletSignature({
      previewId: 'missing-preview',
      walletId: FIXTURE_WALLET_ID,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    })).rejects.toThrow(PreviewNotFoundError);
  });

  it('throws PreviewApprovalNotAllowedError when the preview is not fresh', async () => {
    const storedPreview = executionRepo.previews.get(previewId);
    if (!storedPreview) {
      throw new Error('Expected preview fixture to exist');
    }

    executionRepo.previews.set(previewId, {
      ...storedPreview,
      preview: {
        ...storedPreview.preview,
        freshness: { kind: 'stale' },
      },
    });

    await expect(requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    })).rejects.toThrow(PreviewApprovalNotAllowedError);
    expect(executionRepo.attempts.size).toBe(0);
    expect(executionRepo.preparedPayloads.size).toBe(0);
    expect(historyRepo.events).toEqual([]);
  });
});
