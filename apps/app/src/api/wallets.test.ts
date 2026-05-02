import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestWalletChallenge,
  enrollWalletWithCredentials,
  type EnrollErrorCode,
} from './wallets';

const BASE_URL = 'https://bff.test';

beforeEach(() => {
  process.env['EXPO_PUBLIC_BFF_BASE_URL'] = BASE_URL;
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestWalletChallenge', () => {
  it('returns the parsed challenge on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, {
        walletId: 'wallet-1',
        nonce: 'a'.repeat(64),
        expiresAt: 1_777_750_000_000,
        message: 'CLMM wallet verification\n…',
      }),
    );

    const result = await requestWalletChallenge('wallet-1');

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.challenge.walletId).toBe('wallet-1');
      expect(result.challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(result.challenge.expiresAt).toBe(1_777_750_000_000);
    }
  });

  it('maps WALLET_MALFORMED to a typed error', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(400, { code: 'WALLET_MALFORMED' }),
    );

    const result = await requestWalletChallenge('garbage');

    expect(result).toEqual({ kind: 'error', code: 'WALLET_MALFORMED' satisfies EnrollErrorCode });
  });

  it('maps unknown server errors to NETWORK_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(500, { error: 'oops' }),
    );

    const result = await requestWalletChallenge('wallet-1');

    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('NETWORK_ERROR');
    }
  });

  it('maps fetch failures to NETWORK_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));

    const result = await requestWalletChallenge('wallet-1');
    expect(result).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
  });

  it('maps 200 with malformed response body to NETWORK_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { walletId: 'x' }),
    );

    const result = await requestWalletChallenge('wallet-1');
    expect(result).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
  });
});

describe('enrollWalletWithCredentials', () => {
  it('returns ok on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { enrolled: true, enrolledAt: 1_000_000 }),
    );

    const result = await enrollWalletWithCredentials('wallet-1', {
      nonce: 'a'.repeat(64),
      message: 'CLMM wallet verification\n…',
      signature: 'AAAA',
    });
    expect(result).toEqual({ kind: 'ok', enrolledAt: 1_000_000 });
  });

  it('parses each documented backend code into a typed outcome', async () => {
    const cases: Array<{ status: number; code: EnrollErrorCode }> = [
      { status: 400, code: 'WALLET_MALFORMED' },
      { status: 400, code: 'CHALLENGE_NOT_FOUND' },
      { status: 410, code: 'CHALLENGE_EXPIRED' },
      { status: 409, code: 'CHALLENGE_MISMATCH' },
      { status: 401, code: 'SIGNATURE_INVALID' },
      { status: 410, code: 'ENROLLMENT_UPGRADE_REQUIRED' },
      { status: 400, code: 'BAD_REQUEST' },
    ];

    for (const c of cases) {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        jsonResponse(c.status, { code: c.code }),
      );
      const result = await enrollWalletWithCredentials('wallet-1', {
        nonce: 'a'.repeat(64),
        message: 'm',
        signature: 'AAAA',
      });
      expect(result).toEqual({ kind: 'error', code: c.code });
    }
  });

  it('maps 200 with missing enrolledAt to NETWORK_ERROR', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(200, { enrolled: true }),
    );

    const result = await enrollWalletWithCredentials('wallet-1', {
      nonce: 'a'.repeat(64),
      message: 'm',
      signature: 'AAAA',
    });

    expect(result).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
  });
});