import { describe, expect, it } from 'vitest';
import {
  mapWalletErrorToOutcome,
  normalizeSuccessfulConnection,
} from './walletConnection.js';

describe('walletConnection helpers', () => {
  it('maps user rejected errors to cancelled', () => {
    expect(mapWalletErrorToOutcome(new Error('User rejected the request'))).toEqual({ kind: 'cancelled' });
  });

  it('maps interruption-style errors to interrupted', () => {
    expect(mapWalletErrorToOutcome(new Error('Connection interrupted during handoff'))).toEqual({ kind: 'interrupted' });
  });

  it('maps unknown errors to failed with reason', () => {
    expect(mapWalletErrorToOutcome(new Error('Provider exploded'))).toEqual({
      kind: 'failed',
      reason: 'Provider exploded',
    });
  });

  it('normalizes successful browser connection payloads', () => {
    expect(
      normalizeSuccessfulConnection({
        address: 'DemoWallet1111111111111111111111111111111111',
        connectionKind: 'browser',
      }),
    ).toEqual({
      walletAddress: 'DemoWallet1111111111111111111111111111111111',
      connectionKind: 'browser',
    });
  });
});
