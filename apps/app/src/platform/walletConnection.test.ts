import { describe, expect, it } from 'vitest';
import {
  mapWalletErrorToOutcome,
  normalizeSuccessfulConnection,
} from './walletConnection';

class WalletRejectionError extends Error {
  override readonly name = 'WalletRejectionError';
}

class WalletError extends Error {
  override readonly name = 'WalletError';
  constructor(
    message: string,
    public readonly type: string,
  ) {
    super(message);
  }
}

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

  describe('ConnectorKit / Wallet Standard error patterns', () => {
    it('maps WalletRejectionError by constructor name to cancelled', () => {
      const error = new WalletRejectionError('User rejected the sign request');
      expect(mapWalletErrorToOutcome(error)).toEqual({ kind: 'cancelled' });
    });

    it('maps WalletError with connection_error type to cancelled', () => {
      const error = new WalletError('connect failed', 'connection_error');
      expect(mapWalletErrorToOutcome(error)).toEqual({ kind: 'cancelled' });
    });

    it('maps WalletError with configuration_error type to interrupted', () => {
      const error = new WalletError('wallet misconfigured', 'configuration_error');
      expect(mapWalletErrorToOutcome(error)).toEqual({ kind: 'interrupted' });
    });

    it('maps WalletError with network_error type to interrupted', () => {
      const error = new WalletError('network failure', 'network_error');
      expect(mapWalletErrorToOutcome(error)).toEqual({ kind: 'interrupted' });
    });

    it('maps "app not authorized" message to cancelled', () => {
      expect(mapWalletErrorToOutcome(new Error('App not authorized'))).toEqual({ kind: 'cancelled' });
    });

    it('maps "unauthorized" message to cancelled', () => {
      expect(mapWalletErrorToOutcome(new Error('Unauthorized access'))).toEqual({ kind: 'cancelled' });
    });

    it('maps "wallet not found" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('Wallet not found'))).toEqual({ kind: 'interrupted' });
    });

    it('maps "wallet not ready" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('Wallet not ready'))).toEqual({ kind: 'interrupted' });
    });

    it('maps "unsupported chain" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('Unsupported chain'))).toEqual({ kind: 'interrupted' });
    });

    it('maps "feature unsupported" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('Feature unsupported'))).toEqual({ kind: 'interrupted' });
    });

    it('maps "request already pending" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('Request already pending'))).toEqual({ kind: 'interrupted' });
    });

    it('maps "mobile wallet unavailable" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('Mobile wallet unavailable'))).toEqual({ kind: 'interrupted' });
    });

    it('maps "user closed approval sheet" message to interrupted', () => {
      expect(mapWalletErrorToOutcome(new Error('User closed approval sheet'))).toEqual({ kind: 'interrupted' });
    });

    it('maps WalletError with transaction_error type to failed', () => {
      const error = new WalletError('tx failed', 'transaction_error');
      expect(mapWalletErrorToOutcome(error)).toEqual({
        kind: 'failed',
        reason: 'tx failed',
      });
    });

    it('maps WalletError with validation_error type to failed', () => {
      const error = new WalletError('bad input', 'validation_error');
      expect(mapWalletErrorToOutcome(error)).toEqual({
        kind: 'failed',
        reason: 'bad input',
      });
    });

    it('prefers error name/type matching over message matching for cancellation', () => {
      class ConnectionError extends Error {
        override readonly name = 'connection_error';
      }
      const error = new ConnectionError('something went wrong');
      expect(mapWalletErrorToOutcome(error)).toEqual({ kind: 'cancelled' });
    });
  });
});
