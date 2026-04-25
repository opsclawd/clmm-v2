import { describe, expect, it } from 'vitest';
import {
  deriveWalletBootStatus,
  type DeriveWalletBootStatusInput,
  type WalletBootStatus,
} from './deriveWalletBootStatus';

const ADDR = 'DemoWallet1111111111111111111111111111111111';

function input(partial: Partial<DeriveWalletBootStatusInput>): DeriveWalletBootStatusInput {
  return {
    hasHydrated: true,
    connectionKind: null,
    walletAddress: null,
    connectorStatus: { status: 'disconnected' },
    connectorAccount: null,
    hasSeenConnectorInflight: false,
    restoreTimedOut: false,
    ...partial,
  };
}

describe('deriveWalletBootStatus', () => {
  it('returns hydrating-storage when storage has not hydrated, regardless of other inputs', () => {
    const out: WalletBootStatus = deriveWalletBootStatus(
      input({
        hasHydrated: false,
        connectionKind: 'browser',
        walletAddress: ADDR,
        connectorStatus: { status: 'connected', session: {} as never },
        connectorAccount: ADDR,
        hasSeenConnectorInflight: true,
        restoreTimedOut: true,
      }),
    );
    expect(out).toBe('hydrating-storage');
  });

  it('returns connected immediately for a persisted native session', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: 'native', walletAddress: ADDR }),
      ),
    ).toBe('connected');
  });

  it('returns disconnected for native kind with null address', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: 'native', walletAddress: null }),
      ),
    ).toBe('disconnected');
  });

  it('returns checking-browser-wallet for a browser candidate while connector is initial-disconnected', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'disconnected' },
          hasSeenConnectorInflight: false,
          restoreTimedOut: false,
        }),
      ),
    ).toBe('checking-browser-wallet');
  });

  it('returns checking-browser-wallet for a browser candidate while connector is connecting', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connecting', connectorId: 'phantom' as never },
          hasSeenConnectorInflight: true,
          restoreTimedOut: false,
        }),
      ),
    ).toBe('checking-browser-wallet');
  });

  it('returns connected for browser candidate when connector reports connected with matching account', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connected', session: {} as never },
          connectorAccount: ADDR,
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('connected');
  });

  it('keeps checking-browser-wallet when connector says connected but account is null (defensive)', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connected', session: {} as never },
          connectorAccount: null,
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('checking-browser-wallet');
  });

  it('returns disconnected when connector reaches error state', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'error', error: new Error('x'), recoverable: false },
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when connector returns to disconnected after being inflight', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'disconnected' },
          hasSeenConnectorInflight: true,
        }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when watchdog fires regardless of connector state', () => {
    expect(
      deriveWalletBootStatus(
        input({
          connectionKind: 'browser',
          walletAddress: ADDR,
          connectorStatus: { status: 'connecting', connectorId: 'phantom' as never },
          hasSeenConnectorInflight: true,
          restoreTimedOut: true,
        }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when there is no restore candidate and no native session', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: null, walletAddress: null }),
      ),
    ).toBe('disconnected');
  });

  it('returns disconnected when browser kind has no walletAddress (no candidate)', () => {
    expect(
      deriveWalletBootStatus(
        input({ connectionKind: 'browser', walletAddress: null }),
      ),
    ).toBe('disconnected');
  });
});