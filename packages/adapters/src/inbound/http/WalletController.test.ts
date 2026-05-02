import { describe, it, expect } from 'vitest';
import { HttpException } from '@nestjs/common';
import { WalletController } from './WalletController.js';
import {
  FakeWalletChallengeRepository,
  FakeMonitoredWalletRepository,
  FakeClockPort,
} from '@clmm/testing';
import { buildWalletVerificationMessage } from './WalletVerification.js';
import { makeWalletId } from '@clmm/domain';

const VALID_WALLET_ID = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';

function makeController(opts?: { now?: number }) {
  const monitoredWallets = new FakeMonitoredWalletRepository();
  const challenges = new FakeWalletChallengeRepository(monitoredWallets);
  const clock = new FakeClockPort(opts?.now ?? 1_000_000);
  const controller = new WalletController(challenges, clock);
  return { controller, challenges, monitoredWallets, clock };
}

describe('WalletController.issueChallenge', () => {
  it('issues a 64-char hex nonce, 5-min expiry, and exact backend-built message', async () => {
    const { controller, challenges } = makeController({ now: 1_000_000 });

    const result = await controller.issueChallenge(VALID_WALLET_ID);

    expect(result.walletId).toBe(VALID_WALLET_ID);
    expect(result.nonce).toMatch(/^[0-9a-fA-F]{64}$/);
    expect(result.expiresAt).toBe(1_000_000 + 5 * 60 * 1000);
    expect(result.message).toBe(
      buildWalletVerificationMessage({
        walletId: VALID_WALLET_ID,
        nonce: result.nonce,
        expiresAt: result.expiresAt as import('@clmm/domain').ClockTimestamp,
      }),
    );

    const stored = challenges.getRowForTest(makeWalletId(VALID_WALLET_ID));
    expect(stored?.nonce).toBe(result.nonce);
    expect(stored?.expiresAt).toBe(result.expiresAt);
    expect(stored?.issuedAt).toBe(1_000_000);
  });

  it('returns 400 WALLET_MALFORMED on invalid wallet id', async () => {
    const { controller, challenges } = makeController();

    await expect(controller.issueChallenge('not-a-real-address')).rejects.toMatchObject({
      status: 400,
      response: { code: 'WALLET_MALFORMED' },
    });
    expect(challenges.getRowForTest(makeWalletId('not-a-real-address'))).toBeUndefined();
  });

  it('is idempotent within the TTL: second call returns same nonce + expiry', async () => {
    const { controller, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(60_000);
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.nonce).toBe(first.nonce);
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.message).toBe(first.message);
  });

  it('does not extend expiry on idempotent re-issue', async () => {
    const { controller, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(60_000);
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.expiresAt).not.toBe(1_000_000 + 60_000 + 5 * 60 * 1000);
  });

  it('replaces nonce and expiry after the previous challenge expires', async () => {
    const { controller, clock } = makeController({ now: 1_000_000 });

    const first = await controller.issueChallenge(VALID_WALLET_ID);
    clock.advance(5 * 60 * 1000 + 1);
    const second = await controller.issueChallenge(VALID_WALLET_ID);

    expect(second.nonce).not.toBe(first.nonce);
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt);
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

async function makeSignedChallenge(now: number) {
  const ctx = makeController({ now });
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  ) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };
  const rawPubkey = new Uint8Array(
    await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
  );
  const walletId = bytesToBase58(rawPubkey);

  const challenge = await ctx.controller.issueChallenge(walletId);

  const signatureBytes = new Uint8Array(
    await globalThis.crypto.subtle.sign(
      { name: 'Ed25519' },
      keyPair.privateKey,
      new TextEncoder().encode(challenge.message),
    ),
  );

  return {
    ...ctx,
    walletId,
    nonce: challenge.nonce,
    message: challenge.message,
    signatureBase64: bytesToBase64(signatureBytes),
    keyPair,
  };
}

describe('WalletController.enroll', () => {
  it('enrolls the wallet when nonce, message, and signature all match', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    const result = await ctx.controller.enroll(ctx.walletId, {
      nonce: ctx.nonce,
      message: ctx.message,
      signature: ctx.signatureBase64,
    });

    expect(result.enrolled).toBe(true);
    expect(typeof result.enrolledAt).toBe('number');

    const active = await ctx.monitoredWallets.listActiveWallets();
    expect(active).toHaveLength(1);
    expect(active[0]?.walletId).toBe(ctx.walletId);

    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeUndefined();
  });

  it('returns 400 WALLET_MALFORMED for invalid walletId', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll('not-a-base58-address', {
        nonce: 'a'.repeat(64),
        message: 'whatever',
        signature: 'AAAA',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'WALLET_MALFORMED' } });
  });

  it('returns 400 BAD_REQUEST on missing nonce', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        message: 'm',
        signature: 'AAAA',
      } as never),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
  });

  it('returns 400 BAD_REQUEST on non-hex nonce', async () => {
    const { controller } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        nonce: 'not-hex',
        message: 'm',
        signature: 'AAAA',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
  });

  it('returns 400 CHALLENGE_NOT_FOUND when no challenge was issued', async () => {
    const { controller, monitoredWallets } = makeController();
    await expect(
      controller.enroll(VALID_WALLET_ID, {
        nonce: 'a'.repeat(64),
        message: 'whatever',
        signature: 'AAAA',
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHALLENGE_NOT_FOUND' } });
    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 410 CHALLENGE_EXPIRED on expired challenge and does not consume', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    ctx.clock.advance(5 * 60 * 1000 + 1);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 410, response: { code: 'CHALLENGE_EXPIRED' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('returns 409 CHALLENGE_MISMATCH on wrong nonce and does not consume', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: 'b'.repeat(64),
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CHALLENGE_MISMATCH' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('returns 409 CHALLENGE_MISMATCH when message does not match expected', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message + ' tampered',
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CHALLENGE_MISMATCH' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('returns 401 SIGNATURE_INVALID on bad signature and does not consume', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    const badSig = bytesToBase64(new Uint8Array(64));

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: badSig,
      }),
    ).rejects.toMatchObject({ status: 401, response: { code: 'SIGNATURE_INVALID' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
    expect(ctx.challenges.getRowForTest(makeWalletId(ctx.walletId))).toBeDefined();
  });

  it('rejects replay of a successful proof with CHALLENGE_NOT_FOUND', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await ctx.controller.enroll(ctx.walletId, {
      nonce: ctx.nonce,
      message: ctx.message,
      signature: ctx.signatureBase64,
    });

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHALLENGE_NOT_FOUND' } });
  });

  it('returns CHALLENGE_EXPIRED when consumeAndEnrollIfMatches reports expired', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    ctx.challenges.consumeAndEnrollIfMatches = async (params: unknown) => {
      void params;
      return { kind: 'expired' };
    };

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 410, response: { code: 'CHALLENGE_EXPIRED' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns CHALLENGE_MISMATCH when consumeAndEnrollIfMatches reports mismatch', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    ctx.challenges.consumeAndEnrollIfMatches = async (params: unknown) => {
      void params;
      return { kind: 'mismatch' };
    };

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CHALLENGE_MISMATCH' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns CHALLENGE_NOT_FOUND when consumeAndEnrollIfMatches reports not_found (race condition)', async () => {
    const ctx = await makeSignedChallenge(1_000_000);
    ctx.challenges.consumeAndEnrollIfMatches = async (params: unknown) => {
      void params;
      return { kind: 'not_found' };
    };

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'CHALLENGE_NOT_FOUND' } });

    expect(await ctx.monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns BAD_REQUEST on oversized message or signature', async () => {
    const ctx = await makeSignedChallenge(1_000_000);

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: 'x'.repeat(513),
        signature: ctx.signatureBase64,
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });

    await expect(
      ctx.controller.enroll(ctx.walletId, {
        nonce: ctx.nonce,
        message: ctx.message,
        signature: 'A'.repeat(257),
      }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
  });
});

describe('WalletController.monitor (tombstone)', () => {
  it('always returns 410 ENROLLMENT_UPGRADE_REQUIRED', async () => {
    const { controller, monitoredWallets } = makeController();

    try {
      controller.monitor(VALID_WALLET_ID);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(410);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'ENROLLMENT_UPGRADE_REQUIRED' });
    }

    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });

  it('returns 410 even for a malformed walletId — never falls through to enrollment', async () => {
    const { controller, monitoredWallets } = makeController();

    try {
      controller.monitor('not-a-base58-address');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(410);
      expect((err as HttpException).getResponse()).toMatchObject({ code: 'ENROLLMENT_UPGRADE_REQUIRED' });
    }

    expect(await monitoredWallets.listActiveWallets()).toHaveLength(0);
  });
});