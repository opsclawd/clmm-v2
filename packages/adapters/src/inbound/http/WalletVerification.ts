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
 * Uses Node.js built-in crypto (Node 18+).
 */
export function verifyWalletSignature(params: {
  message: string; // raw string that was signed
  signature: Buffer; // 64-byte ed25519 signature
  walletAddress: string; // base58 Solana address
}): boolean {
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

function verifyEd25519(
  signature: Buffer,
  message: Buffer,
  publicKey: Buffer,
): boolean {
  // Node.js 18+ exposes crypto.verify('ed25519', ...)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as { verify: (algorithm: string, data: Buffer, key: Buffer, sig: Buffer) => boolean };
  return crypto.verify('ed25519', message, publicKey, signature);
}

// ─── Minimal base58 decoder (avoids adding @solana/web3.js as a dependency) ─

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charAt(i)] = i;
}

function base58ToBuffer(base58: string): Buffer {
  let result = Buffer.alloc(64);
  let len = 0;
  for (const char of base58) {
    let carry = BASE58_MAP[char];
    if (carry === undefined) throw new Error(`Invalid base58 character: ${char}`);
    for (let i = len - 1; i >= 0; i--) {
      const byte = result[i] ?? 0;
      carry += 58 * byte;
      result[i] = carry % 256;
      carry = Math.floor(carry / 256);
    }
    if (carry > 0) {
      if (len >= result.length) {
        const newResult = Buffer.alloc(result.length + 64);
        result.copy(newResult);
        result = newResult;
      }
      result[len++] = carry;
    }
  }
  // Leading zeros
  for (const char of base58) {
    if (char !== '1') break;
    if (len >= result.length) {
      const newResult = Buffer.alloc(result.length + 1);
      result.copy(newResult);
      result = newResult;
    }
    result[len++] = 0;
  }
  return result.slice(0, len);
}
