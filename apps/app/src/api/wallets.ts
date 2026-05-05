import { getBffBaseUrl } from './http';

export type WalletChallenge = {
  walletId: string;
  nonce: string;
  expiresAt: number;
  message: string;
};

export type EnrollErrorCode =
  | 'WALLET_MALFORMED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'ENROLLMENT_UPGRADE_REQUIRED'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export type ChallengeResult =
  | { kind: 'ok'; challenge: WalletChallenge }
  | { kind: 'error'; code: EnrollErrorCode };

export type EnrollResult =
  | { kind: 'ok'; enrolledAt: number }
  | { kind: 'error'; code: EnrollErrorCode };

const KNOWN_CODES = new Set<EnrollErrorCode>([
  'WALLET_MALFORMED',
  'CHALLENGE_NOT_FOUND',
  'CHALLENGE_EXPIRED',
  'CHALLENGE_MISMATCH',
  'SIGNATURE_INVALID',
  'ENROLLMENT_UPGRADE_REQUIRED',
  'BAD_REQUEST',
  'INTERNAL_ERROR',
]);

export async function requestWalletChallenge(walletId: string): Promise<ChallengeResult> {
  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/challenge`, {
      method: 'POST',
    });
  } catch {
    return { kind: 'error', code: 'NETWORK_ERROR' };
  }
  if (!response.ok) {
    return { kind: 'error', code: await parseErrorCode(response) };
  }
  const body: unknown = await response.json().catch(() => null);
  const challenge = parseChallenge(body);
  if (challenge === null) return { kind: 'error', code: 'NETWORK_ERROR' };
  return { kind: 'ok', challenge };
}

export async function enrollWalletWithCredentials(
  walletId: string,
  credentials: { nonce: string; message: string; signature: string },
): Promise<EnrollResult> {
  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  } catch {
    return { kind: 'error', code: 'NETWORK_ERROR' };
  }
  if (!response.ok) {
    return { kind: 'error', code: await parseErrorCode(response) };
  }
  const body: unknown = await response.json().catch(() => null);
  const enrolledAt = parseEnrolledAt(body);
  if (enrolledAt === null) return { kind: 'error', code: 'NETWORK_ERROR' };
  return { kind: 'ok', enrolledAt };
}

function parseChallenge(value: unknown): WalletChallenge | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v['walletId'] !== 'string' ||
    typeof v['nonce'] !== 'string' ||
    typeof v['expiresAt'] !== 'number' ||
    typeof v['message'] !== 'string'
  ) {
    return null;
  }
  return {
    walletId: v['walletId'],
    nonce: v['nonce'],
    expiresAt: v['expiresAt'],
    message: v['message'],
  };
}

function parseEnrolledAt(value: unknown): number | null {
  if (typeof value === 'object' && value !== null && 'enrolledAt' in value) {
    const v = value as Record<string, unknown>;
    if (typeof v['enrolledAt'] === 'number') return v['enrolledAt'];
  }
  return null;
}

async function parseErrorCode(response: Response): Promise<EnrollErrorCode> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === 'object' && body !== null && 'code' in body) {
    const v = body as Record<string, unknown>;
    if (typeof v['code'] === 'string' && KNOWN_CODES.has(v['code'] as EnrollErrorCode)) {
      return v['code'] as EnrollErrorCode;
    }
  }
  return 'NETWORK_ERROR';
}
