/**
 * Wallet signature verification helpers for the enrollment flow.
 * Does NOT handle challenge storage — that lives in WalletChallengeRepository (Redis-backed).
 */

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

    // Decode base58 address to 32-byte public key (throws on invalid address)
    const pubkey = base58ToBuffer(walletAddress);

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

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP: Record<string, number> = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charAt(i)] = i;
}

/**
 * Decode a base58-encoded Solana wallet address to a 32-byte Buffer.
 * Throws if the input is not valid base58 or decodes to anything other than 32 bytes.
 * Solana wallet addresses are always exactly 32 bytes.
 */
function base58ToBuffer(str: string): Buffer {
  let leadingZeros = 0;
  for (const c of str) {
    if (c === '1') leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const c of str.slice(leadingZeros)) {
    const v = BASE58_MAP[c];
    if (v === undefined)
      throw new Error(`Invalid base58 character: ${c}`);
    n = n * 58n + BigInt(v);
  }
  let hex = n === 0n ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const body = hex === '' ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  const total = leadingZeros + body.length;
  if (total !== 32)
    throw new Error(
      `Invalid Solana address: decoded ${total} bytes, expected 32`,
    );
  return Buffer.concat([Buffer.alloc(leadingZeros), body]);
}
