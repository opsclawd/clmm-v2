/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi } from 'vitest';
import { verifyWalletEnrollment } from './verifyWalletEnrollment';

vi.mock('@clmm/application/public', () => ({
  verifyWalletEnrollment: vi.fn(),
}));

vi.mock('./createWalletEnrollmentApi', () => ({
  createWalletEnrollmentApi: vi.fn(() => ({})),
}));

vi.mock('./createWalletMessageSigner', () => ({
  createWalletMessageSigner: vi.fn(() => ({})),
}));

vi.mock('../state/walletSessionStore', () => ({
  useWalletSessionStore: {},
}));

vi.mock('./signMessageWithWallet', () => ({
  signMessageWithWallet: vi.fn(),
}));

describe('verifyWalletEnrollment composition', () => {
  it('delegates to domain use case with composed ports', async () => {
    const { verifyWalletEnrollment: domainFn } = await import('@clmm/application/public');
    (domainFn as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: 'enrolled',
      enrolledAt: 1234,
    });

    const result = await verifyWalletEnrollment({
      walletId: 'test-wallet',
      connectionKind: 'browser',
      browserSigner: {
        isConnected: true,
        account: 'test-wallet',
        signMessageBytes: vi.fn(),
      },
    });

    expect(result).toEqual({ kind: 'enrolled', enrolledAt: 1234 });
    expect(domainFn).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: 'test-wallet',
        enrollmentApi: expect.any(Object),
        messageSigner: expect.any(Object),
      }),
    );
  });
});