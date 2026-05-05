import { describe, it, expect } from 'vitest';
import {
  base58ToBuffer,
  buildWalletVerificationMessage,
  verifyWalletSignature,
} from './WalletVerification.js';
import { makeClockTimestamp } from '@clmm/domain';

const VALID_32_BYTE_ADDR = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

describe('base58ToBuffer', () => {
  it('decodes a valid 32-byte Solana address', () => {
    const out = base58ToBuffer(VALID_32_BYTE_ADDR, 32);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(32);
  });

  it('rejects a 32-byte address when expectedLength is 64', () => {
    expect(() => base58ToBuffer(VALID_32_BYTE_ADDR, 64)).toThrow(/expected 64/);
  });

  it('rejects invalid base58 characters', () => {
    expect(() => base58ToBuffer('0OIl' + VALID_32_BYTE_ADDR.slice(4), 32)).toThrow(
      /Invalid base58/,
    );
  });

  it('rejects an empty string', () => {
    expect(() => base58ToBuffer('', 32)).toThrow(/expected 32/);
  });
});

describe('buildWalletVerificationMessage', () => {
  it('emits the exact domain-bound multi-line format', () => {
    const message = buildWalletVerificationMessage({
      walletId: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
      nonce: 'abc123',
      expiresAt: makeClockTimestamp(1_713_628_800_000),
    });
    expect(message).toBe(
      [
        'CLMM wallet verification',
        '',
        'Wallet: Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        'Nonce: abc123',
        'Expires: 2024-04-20T16:00:00.000Z',
      ].join('\n'),
    );
  });
});

function bytesToBase58(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n = n / 58n;
  }
  return '1'.repeat(leadingZeros) + out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function makeEd25519KeyPair() {
  const keyPair = (await globalThis.crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };
  const rawPubkey = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
  );
  return { keyPair, rawPubkey };
}

async function signBase64(privateKey: CryptoKey, message: string): Promise<string> {
  const sig = await globalThis.crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    new TextEncoder().encode(message),
  );
  return bytesToBase64(new Uint8Array(sig));
}

describe('verifyWalletSignature', () => {
  it('accepts a real Ed25519 test vector', async () => {
    const { keyPair, rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);
    const message = 'hello wallet';
    const signatureBase64 = await signBase64(keyPair.privateKey, message);

    const ok = await verifyWalletSignature({ walletId, message, signatureBase64 });
    expect(ok).toBe(true);
  });

  it('rejects a tampered message', async () => {
    const { keyPair, rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);
    const signatureBase64 = await signBase64(keyPair.privateKey, 'original');

    const ok = await verifyWalletSignature({
      walletId,
      message: 'tampered',
      signatureBase64,
    });
    expect(ok).toBe(false);
  });

  it('rejects a signature from a different key', async () => {
    const { keyPair: alice } = await makeEd25519KeyPair();
    const { rawPubkey: bobPub } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(bobPub);

    const message = 'hello';
    const signatureBase64 = await signBase64(alice.privateKey, message);

    const ok = await verifyWalletSignature({ walletId, message, signatureBase64 });
    expect(ok).toBe(false);
  });

  it('rejects a malformed wallet address', async () => {
    const { keyPair } = await makeEd25519KeyPair();
    const signatureBase64 = await signBase64(keyPair.privateKey, 'msg');

    const ok = await verifyWalletSignature({
      walletId: '0OIl-not-base58',
      message: 'msg',
      signatureBase64,
    });
    expect(ok).toBe(false);
  });

  it('rejects a signature of wrong length', async () => {
    const { rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);

    const ok = await verifyWalletSignature({
      walletId,
      message: 'x',
      signatureBase64: bytesToBase64(new Uint8Array(32)),
    });
    expect(ok).toBe(false);
  });

  it('rejects malformed base64 in the signature field', async () => {
    const { rawPubkey } = await makeEd25519KeyPair();
    const walletId = bytesToBase58(rawPubkey);

    const ok = await verifyWalletSignature({
      walletId,
      message: 'x',
      signatureBase64: '!!!not base64!!!',
    });
    expect(ok).toBe(false);
  });
});
