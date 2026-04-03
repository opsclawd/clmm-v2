import { describe, expect, it } from 'vitest';
import {
  mapWalletErrorToOutcome,
  normalizeSuccessfulConnection,
} from './walletConnection';

describe('walletConnection helpers', () => {
  it('maps user rejected errors to cancelled', () => {
    expect(mapWalletErrorToOutcome(new Error('User rejected the request'))).toEqual({ kind: 'cancelled' });
  });

  it('classifies cancellation and interruption errors case-insensitively', () => {
    expect(mapWalletErrorToOutcome(new Error('USER REJECTED THE REQUEST'))).toEqual({ kind: 'cancelled' });
    expect(mapWalletErrorToOutcome(new Error('CONNECTION TIMEOUT DURING HANDOFF'))).toEqual({ kind: 'interrupted' });
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

  it('maps non-Error unknown inputs to failed with string reason', () => {
    expect(mapWalletErrorToOutcome({ code: 'WALLET_DOWN' })).toEqual({
      kind: 'failed',
      reason: '[object Object]',
    });

    expect(mapWalletErrorToOutcome(undefined)).toEqual({
      kind: 'failed',
      reason: 'undefined',
    });
  });

  it('prefers cancellation when message also suggests interruption', () => {
    expect(mapWalletErrorToOutcome(new Error('User cancelled after connection closed unexpectedly'))).toEqual({
      kind: 'cancelled',
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
