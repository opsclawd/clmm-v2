import { describe, it, expect } from 'vitest';
import { connectWalletSession } from './ConnectWalletSession.js';
import {
  FakeWalletSigningPort,
  FakeIdGeneratorPort,
  FakeClockPort,
  FIXTURE_WALLET_ID,
  FIXTURE_POSITION_ID,
  FakeExecutionSessionRepository,
} from '@clmm/testing';

describe('ConnectWalletSession', () => {
  it('creates a new wallet session and returns sessionId', async () => {
    const signingPort = new FakeWalletSigningPort();
    const ids = new FakeIdGeneratorPort();
    const sessionRepo = new FakeExecutionSessionRepository();
    const clock = new FakeClockPort();

    const result = await connectWalletSession({
      walletId: FIXTURE_WALLET_ID,
      positionId: FIXTURE_POSITION_ID,
      signingPort,
      sessionRepo,
      clock,
      ids,
    });

    expect(result.kind).toBe('connected');
    if (result.kind === 'connected') {
      expect(result.sessionId).toBeTruthy();
      const stored = await sessionRepo.getSession(result.sessionId);
      expect(stored).not.toBeNull();
      expect(stored?.walletId).toBe(FIXTURE_WALLET_ID);
    }
  });
});
