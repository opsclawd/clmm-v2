import { describe, it, expect } from 'vitest';
import {
  issueWalletChallenge,
  consumeWalletChallenge,
  buildWalletVerificationMessage,
  verifyWalletSignature,
} from './WalletVerification.js';

const TEST_WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLsu4aDB';

// Minimal base58 encoder for test use (inverse of the module's base58ToBuffer)
function base58Encode32Bytes(bytes: Buffer): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + bytes.toString('hex'));
  let result = '';
  while (n > 0n) {
    const remainder = Number(n % 58n);
    n = n / 58n;
    result = ALPHABET[remainder] + result;
  }
  // Count leading zero bytes
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }
  return '1'.repeat(leadingZeros) + result;
}

describe('WalletVerification', () => {
  describe('issueWalletChallenge / consumeWalletChallenge', () => {
    it('issues a challenge and consumes it successfully', () => {
      const challenge = issueWalletChallenge(TEST_WALLET);
      expect(challenge.walletAddress).toBe(TEST_WALLET);
      expect(challenge.nonce).toHaveLength(64); // 32 bytes hex
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());

      const consumed = consumeWalletChallenge(challenge.nonce, TEST_WALLET);
      expect(consumed).not.toBeNull();
      expect(consumed!.nonce).toBe(challenge.nonce);
    });

    it('rejects a consumed challenge on second use', () => {
      const challenge = issueWalletChallenge(TEST_WALLET);
      consumeWalletChallenge(challenge.nonce, TEST_WALLET);
      const second = consumeWalletChallenge(challenge.nonce, TEST_WALLET);
      expect(second).toBeUndefined();
    });

    it('rejects challenge for mismatched wallet address', () => {
      const challenge = issueWalletChallenge(TEST_WALLET);
      const result = consumeWalletChallenge(
        challenge.nonce,
        '5DifferentWalletAddressHere123456',
      );
      expect(result).toBeUndefined();
    });

    it('rejects unknown nonce', () => {
      const result = consumeWalletChallenge(
        '0000000000000000000000000000000000000000000000000000000000000000',
        TEST_WALLET,
      );
      expect(result).toBeUndefined();
    });
  });

  describe('buildWalletVerificationMessage', () => {
    it('formats the expected message string', () => {
      const nonce = 'abc123';
      const msg = buildWalletVerificationMessage(TEST_WALLET, nonce);
      expect(msg).toBe(
        `CLMM V2\nWallet: ${TEST_WALLET}\nChallenge: ${nonce}`,
      );
    });
  });

  describe('verifyWalletSignature', () => {
    it('accepts a valid ed25519 signature end-to-end', async () => {
      // Generate a real Ed25519 keypair
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/unbound-method
      const { generateKeyPairSync, sign } = require('crypto') as {
        generateKeyPairSync(
          type: 'ed25519',
          options: Record<string, unknown>,
        ): { publicKey: unknown; privateKey: unknown };
        sign(
          algo: null,
          data: Buffer,
          key: unknown,
        ): Buffer;
      };
      const { publicKey, privateKey } = generateKeyPairSync('ed25519', {});

      // Extract raw 32-byte public key bytes from the SPKI encoding
      const spkiDer = (publicKey as { export(options: { type: string; format: string }): Buffer }).export({
        type: 'spki',
        format: 'der',
      });
      const publicKeyRaw = spkiDer.slice(-32);

      // Encode public key as base58 for the wallet address
      const walletAddress = base58Encode32Bytes(publicKeyRaw);
      const nonce = 'a'.repeat(64);
      const message = buildWalletVerificationMessage(walletAddress, nonce);

      // Sign the message (Ed25519 requires no algorithm string)
      const signature = sign(null, Buffer.from(message, 'utf8'), privateKey);

      // Verify — should return true
      const result = await verifyWalletSignature({ message, signature, walletAddress });
      expect(result).toBe(true);
    });

    it('returns false for a 64-byte signature of the wrong message', async () => {
      // Create a valid 64-byte buffer but sign wrong message
      const fakeSig = Buffer.alloc(64, 1);
      const result = await verifyWalletSignature({
        message: 'wrong message',
        signature: fakeSig,
        walletAddress: TEST_WALLET,
      });
      expect(result).toBe(false);
    });

    it('returns false for a malformed address', async () => {
      const fakeSig = Buffer.alloc(64, 1);
      const result = await verifyWalletSignature({
        message: 'any',
        signature: fakeSig,
        walletAddress: 'not-valid-base58!@#',
      });
      expect(result).toBe(false);
    });

    it('returns false for wrong-length signature', async () => {
      const result = await verifyWalletSignature({
        message: 'any',
        signature: Buffer.alloc(32), // too short
        walletAddress: TEST_WALLET,
      });
      expect(result).toBe(false);
    });
  });
});
