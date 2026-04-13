import { randomBytes } from 'crypto';

/**
 * Wallet ownership challenge — issued by POST /wallets/:walletId/challenge,
 * consumed by POST /wallets/:walletId/enroll within a 5-minute window.
 */
export interface WalletChallenge {
  readonly nonce: string;
  readonly walletAddress: string;
  readonly expiresAt: number; // Unix ms
}

const challenges = new Map<string, WalletChallenge>();

const CHALLENGE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

/**
 * Generate and store a new challenge for the given wallet address.
 */
export function issueWalletChallenge(walletAddress: string): WalletChallenge {
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const challenge: WalletChallenge = { nonce, walletAddress, expiresAt };
  challenges.set(nonce, challenge);
  // Prune expired entries on each issue to keep map bounded
  for (const [key, c] of challenges.entries()) {
    if (c.expiresAt < Date.now()) challenges.delete(key);
  }
  return challenge;
}

/**
 * Find a valid (non-expired) challenge by nonce and wallet address.
 * Returns undefined if missing, expired, or address mismatch.
 */
export function consumeWalletChallenge(
  nonce: string,
  walletAddress: string,
): WalletChallenge | undefined {
  const challenge = challenges.get(nonce);
  if (!challenge) return undefined;
  if (challenge.expiresAt < Date.now()) {
    challenges.delete(nonce);
    return undefined;
  }
  if (challenge.walletAddress !== walletAddress) return undefined;
  challenges.delete(nonce); // one-time use
  return challenge;
}

/**
 * Build the verification message that must be signed by the wallet.
 * This is what the user sees in Phantom/Solflare before approving.
 */
export function buildWalletVerificationMessage(
  walletAddress: string,
  nonce: string,
): string {
  return `CLMM V2\nWallet: ${walletAddress}\nChallenge: ${nonce}`;
}

/**
 * Verify an ed25519 signature against a message and Solana wallet address.
 * Uses WebCrypto API (Node 18+) which accepts raw 32-byte Ed25519 public keys
 * via JWK OKP format — Node's built-in crypto module does not support
 * Ed25519 public key import from raw DER bytes.
 */
export async function verifyWalletSignature(params: {
  message: string; // raw string that was signed
  signature: Buffer; // 64-byte ed25519 signature
  walletAddress: string; // base58 Solana address
}): Promise<boolean> {
  try {
    const { message, signature, walletAddress } = params;
    if (signature.length !== 64) return false;

    // The message bytes (UTF-8)
    const messageBytes = Buffer.from(message, 'utf8');

    // Decode base58 address to 32-byte public key
    const pubkey = base58ToBuffer(walletAddress);
    if (pubkey.length !== 32) return false;

    return verifyEd25519(signature, messageBytes, pubkey);
  } catch {
    return false;
  }
}

async function verifyEd25519(
  signature: Buffer,
  message: Buffer,
  publicKey: Buffer,
): Promise<boolean> {
  // WebCrypto API (available in Node 18+) accepts Ed25519 public keys directly
  // as JWK OKP (Octet Key Pair) format. Node's built-in crypto.createPublicKey
  // does not support Ed25519 SPKI/PKCS#8 DER import.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { webcrypto } = require('crypto') as { webcrypto: Crypto };

  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: Buffer.from(publicKey).toString('base64url'),
  };
  const key = await webcrypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'Ed25519' },
    true,
    ['verify'],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return webcrypto.subtle.verify(
    { name: 'Ed25519' },
    key,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    signature as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    message as any,
  );
}

// ─── Minimal base58 decoder (avoids adding @solana/web3.js as a dependency) ─

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charAt(i)] = i;
}

// Minimal base58 → Buffer decoder using BigInt arithmetic.
// Solana wallet addresses are always 32 bytes, so the output length is fixed.
function base58ToBuffer(str: string): Buffer {
  let leadingZeros = 0;
  for (const c of str) {
    if (c === '1') leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const c of str.slice(leadingZeros)) {
    const v = BASE58_MAP[c];
    if (v === undefined) throw new Error(`Invalid base58 character: ${c}`);
    n = n * 58n + BigInt(v);
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const bodyLen = 32 - leadingZeros;
  const paddedHex = hex.padStart(bodyLen * 2, '0');
  const body = Buffer.from(paddedHex.slice(-bodyLen * 2), 'hex');
  return Buffer.concat([Buffer.alloc(leadingZeros), body]);
}
