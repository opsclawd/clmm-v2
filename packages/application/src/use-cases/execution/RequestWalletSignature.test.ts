import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestWalletSignature,
  PreviewApprovalNotAllowedError,
  PreviewNotFoundError,
  MissingEpisodeIdForTriggerDerivedApprovalError,
} from './RequestWalletSignature.js';
import { createExecutionPreview } from '../previews/CreateExecutionPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeExecutionHistoryRepository,
  FIXTURE_BREACH_EPISODE_ID,
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
      episodeId: FIXTURE_BREACH_EPISODE_ID,
      isTriggerDerivedApproval: true,
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
      episodeId: FIXTURE_BREACH_EPISODE_ID,
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

  it('records wallet-position ownership when approving a preview', async () => {
    await requestWalletSignature({
      previewId,
      episodeId: FIXTURE_BREACH_EPISODE_ID,
      isTriggerDerivedApproval: true,
      walletId: FIXTURE_WALLET_ID,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    });

    const history = await historyRepo.getWalletHistory(FIXTURE_WALLET_ID);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history.some((e) => e.positionId === FIXTURE_POSITION_ID)).toBe(true);
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
    clock.advance(35_000);

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

  it('throws PreviewApprovalNotAllowedError when a fresh preview is past expiresAt by clock time', async () => {
    clock.advance(60_001);

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

  it('throws PreviewApprovalNotAllowedError when clock time puts preview in the stale window even though stored freshness is fresh', async () => {
    clock.advance(35_000);

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

  it('throws when trigger-derived approval omits episodeId', async () => {
    await expect(requestWalletSignature({
      previewId,
      isTriggerDerivedApproval: true,
      walletId: FIXTURE_WALLET_ID,
      executionRepo,
      prepPort,
      historyRepo,
      clock,
      ids,
    })).rejects.toThrow(MissingEpisodeIdForTriggerDerivedApprovalError);

    expect(executionRepo.attempts.size).toBe(0);
    expect(executionRepo.preparedPayloads.size).toBe(0);
    expect(historyRepo.events).toEqual([]);
  });
});
