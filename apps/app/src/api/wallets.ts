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

export async function enrollWalletWithProof(
  walletId: string,
  proof: { nonce: string; message: string; signature: string },
): Promise<EnrollResult> {
  let response: Response;
  try {
    response = await fetch(`${getBffBaseUrl()}/wallets/${walletId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof),
    });
  } catch {
    return { kind: 'error', code: 'NETWORK_ERROR' };
  }
  if (!response.ok) {
    return { kind: 'error', code: await parseErrorCode(response) };
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    'enrolledAt' in body &&
    typeof (body as { enrolledAt: unknown }).enrolledAt === 'number'
  ) {
    return { kind: 'ok', enrolledAt: (body as { enrolledAt: number }).enrolledAt };
  }
  return { kind: 'error', code: 'NETWORK_ERROR' };
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

async function parseErrorCode(response: Response): Promise<EnrollErrorCode> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code: unknown }).code === 'string' &&
    KNOWN_CODES.has((body as { code: string }).code as EnrollErrorCode)
  ) {
    return (body as { code: EnrollErrorCode }).code;
  }
  return 'NETWORK_ERROR';
}