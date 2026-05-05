import type { ClockTimestamp } from '@clmm/domain';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charAt(i)] = i;
}

export function base58ToBuffer(str: string, expectedLength: number): Uint8Array {
  let leadingZeros = 0;
  for (const c of str) {
    if (c === '1') leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const c of str.slice(leadingZeros)) {
    const v = BASE58_MAP[c];
    if (v === undefined) {
      throw new Error(`Invalid base58 character: ${c}`);
    }
    n = n * 58n + BigInt(v);
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;

  const bodyBytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bodyBytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  const total = leadingZeros + bodyBytes.length;
  if (total !== expectedLength) {
    throw new Error(`Invalid base58 payload: decoded ${total} bytes, expected ${expectedLength}`);
  }
  const out = new Uint8Array(expectedLength);
  out.set(bodyBytes, leadingZeros);
  return out;
}

export function buildWalletVerificationMessage(params: {
  walletId: string;
  nonce: string;
  expiresAt: ClockTimestamp;
}): string {
  return [
    'CLMM wallet verification',
    '',
    `Wallet: ${params.walletId}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${new Date(params.expiresAt).toISOString()}`,
  ].join('\n');
}

export async function verifyWalletSignature(params: {
  walletId: string;
  message: string;
  signatureBase64: string;
}): Promise<boolean> {
  try {
    const publicKey = base58ToBuffer(params.walletId, 32);
    const signature = base64ToBytes(params.signatureBase64);
    if (signature.length !== 64) return false;

    const messageBytes = new TextEncoder().encode(params.message);

    const subtle = globalThis.crypto.subtle;
    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: bytesToBase64Url(publicKey),
    };
    const cryptoKey = await subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
    return await subtle.verify(
      { name: 'Ed25519' },
      cryptoKey,
      signature as Uint8Array<ArrayBuffer>,
      messageBytes,
    );
  } catch {
    return false;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
    throw new Error('Invalid base64');
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
