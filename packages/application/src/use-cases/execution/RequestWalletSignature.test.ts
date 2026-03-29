import { describe, it, expect, beforeEach } from 'vitest';
import { requestWalletSignature } from './RequestWalletSignature.js';
import { createExecutionPreview } from '../previews/CreateExecutionPreview.js';
import {
  FakeClockPort,
  FakeIdGeneratorPort,
  FakeSwapQuotePort,
  FakeExecutionRepository,
  FakeExecutionPreparationPort,
  FakeWalletSigningPort,
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
  let signingPort: FakeWalletSigningPort;
  let historyRepo: FakeExecutionHistoryRepository;
  let previewId: string;

  beforeEach(async () => {
    clock = new FakeClockPort();
    ids = new FakeIdGeneratorPort();
    executionRepo = new FakeExecutionRepository();
    prepPort = new FakeExecutionPreparationPort();
    signingPort = new FakeWalletSigningPort();
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

  it('returns signed payload when user approves', async () => {
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('signed');
    if (result.kind === 'signed') {
      expect(result.attemptId).toBeTruthy();
      expect(result.signedPayload).toBeInstanceOf(Uint8Array);
    }
  });

  it('returns declined when user declines', async () => {
    signingPort.willDecline();
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('declined');
  });

  it('returns interrupted when signing interrupted (e.g. MWA handoff)', async () => {
    signingPort.willInterrupt();
    const result = await requestWalletSignature({
      previewId,
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      breachDirection: LOWER_BOUND_BREACH,
      executionRepo,
      prepPort,
      signingPort,
      historyRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('interrupted');
    if (result.kind === 'interrupted') {
      expect(result.attemptId).toBeTruthy();
    }
  });
});
