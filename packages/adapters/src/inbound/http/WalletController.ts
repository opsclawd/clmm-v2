import { Controller, Post, Param, Body, Inject, HttpException } from '@nestjs/common';
import type { WalletChallengeRepository, ClockPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';
import { makeClockTimestamp } from '@clmm/domain';
import { WALLET_CHALLENGE_REPOSITORY, CLOCK_PORT } from './tokens.js';
import {
  base58ToBuffer,
  buildWalletVerificationMessage,
  verifyWalletSignature,
} from './WalletVerification.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 512;
const MAX_SIGNATURE_LENGTH = 256;

@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(WALLET_CHALLENGE_REPOSITORY)
    private readonly challenges: WalletChallengeRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  @Post(':walletId/challenge')
  async issueChallenge(@Param('walletId') walletId: string) {
    assertValidWalletId(walletId);
    const now = this.clock.now();
    const candidateExpiresAt = makeClockTimestamp(now + CHALLENGE_TTL_MS);
    const candidateNonce = generateNonceHex();
    const row = await this.challenges.issue({
      walletId,
      nonce: candidateNonce,
      expiresAt: candidateExpiresAt,
      issuedAt: now,
      now,
    });
    const message = buildWalletVerificationMessage({
      walletId: row.walletId,
      nonce: row.nonce,
      expiresAt: row.expiresAt,
    });
    return {
      walletId: row.walletId,
      nonce: row.nonce,
      expiresAt: unbrand(row.expiresAt),
      message,
    };
  }

  @Post(':walletId/enroll')
  async enroll(
    @Param('walletId') walletId: string,
    @Body() body: { nonce?: unknown; message?: unknown; signature?: unknown },
  ) {
    assertValidWalletId(walletId);
    const { nonce, message, signature } = assertEnrollBody(body);

    const challenge = await this.challenges.get(walletId);
    if (challenge === null) {
      throw new HttpException({ code: 'CHALLENGE_NOT_FOUND' }, 400);
    }

    const expectedMessage = buildWalletVerificationMessage({
      walletId,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    });
    if (message !== expectedMessage) {
      throw new HttpException({ code: 'CHALLENGE_MISMATCH' }, 409);
    }

    const verified = await verifyWalletSignature({
      walletId,
      message: expectedMessage,
      signatureBase64: signature,
    });
    if (!verified) {
      throw new HttpException({ code: 'SIGNATURE_INVALID' }, 401);
    }

    const now = this.clock.now();
    const result = await this.challenges.consumeAndEnrollIfMatches({
      walletId,
      nonce,
      now,
      enrolledAt: now,
    });

    switch (result.kind) {
      case 'consumed':
        return { enrolled: true, enrolledAt: unbrand(now) };
      case 'not_found':
        throw new HttpException({ code: 'CHALLENGE_NOT_FOUND' }, 400);
      case 'expired':
        throw new HttpException({ code: 'CHALLENGE_EXPIRED' }, 410);
      case 'mismatch':
        throw new HttpException({ code: 'CHALLENGE_MISMATCH' }, 409);
      default:
        throw new HttpException({ code: 'INTERNAL_ERROR' }, 500);
    }
  }

  @Post(':walletId/monitor')
  monitor(@Param('walletId') _walletId: string): never {
    throw new HttpException({ code: 'ENROLLMENT_UPGRADE_REQUIRED' }, 410);
  }
}

function assertValidWalletId(walletId: string): asserts walletId is WalletId {
  if (walletId.length > 88) {
    throw new HttpException({ code: 'WALLET_MALFORMED' }, 400);
  }
  try {
    base58ToBuffer(walletId, 32);
  } catch {
    throw new HttpException({ code: 'WALLET_MALFORMED' }, 400);
  }
}

function assertEnrollBody(body: { nonce?: unknown; message?: unknown; signature?: unknown }): {
  nonce: string;
  message: string;
  signature: string;
} {
  const { nonce, message, signature } = body ?? {};
  if (
    typeof nonce !== 'string' ||
    !/^[0-9a-fA-F]{64}$/.test(nonce) ||
    typeof message !== 'string' ||
    message.length === 0 ||
    message.length > MAX_MESSAGE_LENGTH ||
    typeof signature !== 'string' ||
    signature.length === 0 ||
    signature.length > MAX_SIGNATURE_LENGTH
  ) {
    throw new HttpException({ code: 'BAD_REQUEST' }, 400);
  }
  return { nonce, message, signature };
}

function generateNonceHex(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function unbrand(t: import('@clmm/domain').ClockTimestamp): number {
  return t as number;
}
