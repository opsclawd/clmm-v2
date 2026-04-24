/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-floating-promises */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { WalletConnectorId } from '@solana/connector';
import { renderHook, act } from '@testing-library/react';
import type { BrowserWalletConnectResult } from './browserWalletTypes';

const WALLET_POLL_INTERVAL_MS = 100;
const WALLET_POLL_TIMEOUT_MS = 1500;

type ConnectorMetadata = {
  id: WalletConnectorId;
  name: string;
  icon: string;
  ready: boolean;
  chains: readonly string[];
  features: readonly string[];
};

type MockFn = ReturnType<typeof vi.fn>;

let mockConnectorSnapshot: {
  connectors: ConnectorMetadata[];
  connectWallet: MockFn;
  disconnectWallet: MockFn;
  isConnected: boolean;
  isConnecting: boolean;
  account: string | null;
  walletError: Error | null;
  walletStatus: string;
};

vi.mock('./connectorKitAdapter', () => ({
  useConnectorKitAdapter: () => mockConnectorSnapshot,
}));

function createConnector(
  name: string,
  chains: readonly string[] = ['solana:mainnet', 'solana:devnet'],
  ready = true,
): ConnectorMetadata {
  return {
    id: `wallet-standard:${name.toLowerCase()}` as WalletConnectorId,
    name,
    icon: `data:image/svg+xml,<svg>${name}</svg>`,
    ready,
    chains,
    features: ['standard:connect', 'standard:disconnect'],
  };
}

function mockConnectSuccess(address: string): MockFn {
  return vi.fn().mockImplementation(() => {
    mockConnectorSnapshot.account = address;
    mockConnectorSnapshot.isConnected = true;
    return Promise.resolve();
  });
}

describe('useBrowserWalletConnect', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockConnectorSnapshot = {
      connectors: [],
      connectWallet: vi.fn(),
      disconnectWallet: vi.fn(),
      isConnected: false,
      isConnecting: false,
      account: null,
      walletError: null,
      walletStatus: 'disconnected',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns address on successful connect', async () => {
    const phantom = createConnector('Phantom');
    mockConnectorSnapshot.connectors = [phantom];
    mockConnectorSnapshot.connectWallet = mockConnectSuccess('PhantomAddress111111111111111111111111111');

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    let connectResult: BrowserWalletConnectResult | undefined;
    await act(async () => {
      connectResult = await result.current.connect();
    });

    expect(connectResult?.address).toBe('PhantomAddress111111111111111111111111111');
    expect(mockConnectorSnapshot.connectWallet).toHaveBeenCalledWith(phantom.id);
  });

  it('throws when no browser wallet is available', async () => {
    mockConnectorSnapshot.connectors = [];

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    await act(async () => {
      await expect(result.current.connect()).rejects.toThrow(
        'No supported browser wallet detected on this device',
      );
    });
  });

  it('waits for wallets with bounded poll before throwing no wallet', async () => {
    mockConnectorSnapshot.connectors = [];

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    const connectPromise = result.current.connect();

    await vi.advanceTimersByTimeAsync(WALLET_POLL_TIMEOUT_MS - 1);

    const phantom = createConnector('Phantom');
    mockConnectorSnapshot.connectors = [phantom];
    mockConnectorSnapshot.connectWallet = mockConnectSuccess('LateWallet11111111111111111111111111111');

    await vi.advanceTimersByTimeAsync(WALLET_POLL_INTERVAL_MS + 10);

    const connectResult = await connectPromise;
    expect(connectResult.address).toBe('LateWallet11111111111111111111111111111');
  });

  it('throws raw rejection error when user cancels', async () => {
    const phantom = createConnector('Phantom');
    mockConnectorSnapshot.connectors = [phantom];
    const rejectionError = new Error('User rejected the request');
    mockConnectorSnapshot.connectWallet = vi.fn().mockRejectedValue(rejectionError);

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    await act(async () => {
      await expect(result.current.connect()).rejects.toThrow('User rejected the request');
    });
  });

  it('sets connecting while request is in flight', async () => {
    const phantom = createConnector('Phantom');
    mockConnectorSnapshot.connectors = [phantom];
    let resolveConnect: () => void = () => {};
    mockConnectorSnapshot.connectWallet = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        }),
    );

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    let connectPromise: Promise<BrowserWalletConnectResult> | undefined;
    act(() => {
      connectPromise = result.current.connect();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.connecting).toBe(true);

    mockConnectorSnapshot.account = 'InFlightAddress1111111111111111111111111';
    mockConnectorSnapshot.isConnected = true;
    resolveConnect();

    await act(async () => {
      await connectPromise;
    });

    expect(result.current.connecting).toBe(false);
  });

  it('records wallet name if available', async () => {
    const phantom = createConnector('Phantom');
    mockConnectorSnapshot.connectors = [phantom];
    mockConnectorSnapshot.connectWallet = mockConnectSuccess('PhantomAddress111111111111111111111111111');

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    let connectResult: BrowserWalletConnectResult | undefined;
    await act(async () => {
      connectResult = await result.current.connect();
    });

    expect(connectResult?.walletName).toBe('Phantom');
  });

  it('filters to only solana mainnet and devnet compatible wallets', async () => {
    const ethereumOnly = createConnector('MetaMask', ['ethereum:mainnet']);
    const solanaMainnet = createConnector('Phantom', ['solana:mainnet', 'solana:devnet']);
    mockConnectorSnapshot.connectors = [ethereumOnly, solanaMainnet];
    mockConnectorSnapshot.connectWallet = mockConnectSuccess('FilteredAddress11111111111111111111111111');

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockConnectorSnapshot.connectWallet).toHaveBeenCalledWith(solanaMainnet.id);
  });

  it('does not touch native MWA path', async () => {
    const mwaConnector = createConnector('Phantom', ['solana:mainnet']);
    (mwaConnector as Record<string, unknown>)['id'] = 'mwa:phantom';

    const walletStandardConnector = createConnector('Solflare', ['solana:mainnet', 'solana:devnet']);
    mockConnectorSnapshot.connectors = [mwaConnector as unknown as ConnectorMetadata, walletStandardConnector];
    mockConnectorSnapshot.connectWallet = mockConnectSuccess('NonMwaAddress111111111111111111111111111');

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    await act(async () => {
      await result.current.connect();
    });

    expect(mockConnectorSnapshot.connectWallet).toHaveBeenCalledWith(walletStandardConnector.id);
    expect(mockConnectorSnapshot.connectWallet).not.toHaveBeenCalledWith(mwaConnector.id);
  });

  it('exposes error from connector', async () => {
    const phantom = createConnector('Phantom');
    mockConnectorSnapshot.connectors = [phantom];
    const walletErr = new Error('Connection_timeout');
    mockConnectorSnapshot.connectWallet = vi.fn().mockRejectedValue(walletErr);

    const { useBrowserWalletConnect } = await import('./useBrowserWalletConnect');
    const { result } = renderHook(() => useBrowserWalletConnect());

    await act(async () => {
      await expect(result.current.connect()).rejects.toThrow();
    });

    expect(result.current.error).toBe(walletErr);
  });
});