/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-floating-promises */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let mockAdapterResult: {
  isConnected: boolean;
  disconnectWallet: ReturnType<typeof vi.fn>;
};

vi.mock('./connectorKitAdapter', () => ({
  useConnectorKitAdapter: () => mockAdapterResult,
}));

describe('useBrowserWalletDisconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAdapterResult = {
      isConnected: false,
      disconnectWallet: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disconnects connected browser wallet', async () => {
    mockAdapterResult.isConnected = true;
    mockAdapterResult.disconnectWallet = vi.fn().mockResolvedValue(undefined);

    const { useBrowserWalletDisconnect } = await import('./useBrowserWalletDisconnect');
    const { result } = renderHook(() => useBrowserWalletDisconnect());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockAdapterResult.disconnectWallet).toHaveBeenCalledTimes(1);
  });

  it('no-ops when no browser wallet is connected', async () => {
    mockAdapterResult.isConnected = false;
    mockAdapterResult.disconnectWallet = vi.fn().mockResolvedValue(undefined);

    const { useBrowserWalletDisconnect } = await import('./useBrowserWalletDisconnect');
    const { result } = renderHook(() => useBrowserWalletDisconnect());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockAdapterResult.disconnectWallet).not.toHaveBeenCalled();
  });

  it('exposes disconnecting boolean', async () => {
    mockAdapterResult.isConnected = true;
    let resolveDisconnect: () => void = () => {};
    mockAdapterResult.disconnectWallet = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDisconnect = resolve;
        }),
    );

    const { useBrowserWalletDisconnect } = await import('./useBrowserWalletDisconnect');
    const { result } = renderHook(() => useBrowserWalletDisconnect());

    expect(result.current.disconnecting).toBe(false);

    let disconnectPromise: Promise<void> | undefined;
    act(() => {
      disconnectPromise = result.current.disconnect();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.disconnecting).toBe(true);

    resolveDisconnect();

    await act(async () => {
      await disconnectPromise;
    });

    expect(result.current.disconnecting).toBe(false);
  });

  it('does not throw on best-effort disconnect failure', async () => {
    mockAdapterResult.isConnected = true;
    mockAdapterResult.disconnectWallet = vi.fn().mockRejectedValue(new Error('Already disconnected'));

    const { useBrowserWalletDisconnect } = await import('./useBrowserWalletDisconnect');
    const { result } = renderHook(() => useBrowserWalletDisconnect());

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockAdapterResult.disconnectWallet).toHaveBeenCalledTimes(1);
  });
});