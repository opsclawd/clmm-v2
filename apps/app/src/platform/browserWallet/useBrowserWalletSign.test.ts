/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-floating-promises */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const VALID_SERIALIZED_PAYLOAD =
  'AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQABA8Ad1mDmJHOT4w9SKImj8qzR0ItAoMpTpj/M0nP1p4YpfC/b4w9Qc3vmYbf/YFgTZoQYCeG3U3QFBeWvvqvS5/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQICAAEMAgAAAAEAAAAAAAAAAA==';

let mockAdapterResult: {
  isConnected: boolean;
  signTransactionBytes: ReturnType<typeof vi.fn>;
};

vi.mock('./connectorKitAdapter', () => ({
  useConnectorKitAdapter: () => mockAdapterResult,
}));

describe('useBrowserWalletSign', () => {
  beforeEach(() => {
    mockAdapterResult = {
      isConnected: false,
      signTransactionBytes: vi.fn(),
    };
  });

  it('passes payload bytes to the wallet signer and returns base64 signed payload', async () => {
    mockAdapterResult.isConnected = true;
    const signedBytes = new Uint8Array([4, 5, 6, 7, 8]);
    mockAdapterResult.signTransactionBytes = vi.fn().mockResolvedValue(signedBytes);

    const { useBrowserWalletSign } = await import('./useBrowserWalletSign');
    const { result } = renderHook(() => useBrowserWalletSign());

    let signedBase64: string | undefined;
    await act(async () => {
      signedBase64 = await result.current.sign(VALID_SERIALIZED_PAYLOAD);
    });

    expect(mockAdapterResult.signTransactionBytes).toHaveBeenCalledTimes(1);
    const receivedBytes = mockAdapterResult.signTransactionBytes.mock.calls[0]![0] as Uint8Array;
    expect(receivedBytes).toBeInstanceOf(Uint8Array);
    expect(receivedBytes.length).toBeGreaterThan(0);

    expect(typeof signedBase64).toBe('string');
    expect(signedBase64!.length).toBeGreaterThan(0);

    const roundtrip = Uint8Array.from(atob(signedBase64!), (c) => c.charCodeAt(0));
    expect(roundtrip).toEqual(signedBytes);
  });

  it('throws when no wallet is connected', async () => {
    mockAdapterResult.isConnected = false;

    const { useBrowserWalletSign } = await import('./useBrowserWalletSign');
    const { result } = renderHook(() => useBrowserWalletSign());

    await act(async () => {
      await expect(result.current.sign(VALID_SERIALIZED_PAYLOAD)).rejects.toThrow(
        'No wallet account is connected',
      );
    });

    expect(mockAdapterResult.signTransactionBytes).not.toHaveBeenCalled();
  });

  it('preserves wallet rejection errors', async () => {
    mockAdapterResult.isConnected = true;
    const rejectionError = new Error('User rejected the request');
    mockAdapterResult.signTransactionBytes = vi.fn().mockRejectedValue(rejectionError);

    const { useBrowserWalletSign } = await import('./useBrowserWalletSign');
    const { result } = renderHook(() => useBrowserWalletSign());

    await act(async () => {
      await expect(result.current.sign(VALID_SERIALIZED_PAYLOAD)).rejects.toThrow(
        'User rejected the request',
      );
    });
  });
});