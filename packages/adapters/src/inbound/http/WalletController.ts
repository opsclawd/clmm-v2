import {
  Controller,
  Post,
  Param,
  Body,
  Inject,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
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
      walletId: walletId as WalletId,
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
      expiresAt: row.expiresAt as number,
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

    const now = this.clock.now();
    const existing = await this.challenges.get(walletId as WalletId);
    if (existing === null) {
      throw new BadRequestException({ code: 'CHALLENGE_NOT_FOUND' });
    }
    if (existing.expiresAt < now) {
      throw new HttpException({ code: 'CHALLENGE_EXPIRED' }, 410);
    }
    if (existing.nonce !== nonce) {
      throw new ConflictException({ code: 'CHALLENGE_MISMATCH' });
    }

    const expectedMessage = buildWalletVerificationMessage({
      walletId,
      nonce: existing.nonce,
      expiresAt: existing.expiresAt,
    });
    if (message !== expectedMessage) {
      throw new ConflictException({ code: 'CHALLENGE_MISMATCH' });
    }

    const verified = await verifyWalletSignature({
      walletId,
      message: expectedMessage,
      signatureBase64: signature,
    });
    if (!verified) {
      throw new UnauthorizedException({ code: 'SIGNATURE_INVALID' });
    }

    const enrolledAt = this.clock.now();
    const result = await this.challenges.consumeAndEnrollIfMatches({
      walletId: walletId as WalletId,
      nonce,
      now: enrolledAt,
      enrolledAt,
    });

    switch (result.kind) {
      case 'consumed':
        return { enrolled: true, enrolledAt: enrolledAt as number };
      case 'not_found':
        throw new BadRequestException({ code: 'CHALLENGE_NOT_FOUND' });
      case 'expired':
        throw new HttpException({ code: 'CHALLENGE_EXPIRED' }, 410);
      case 'mismatch':
        throw new ConflictException({ code: 'CHALLENGE_MISMATCH' });
    }
  }

  @Post(':walletId/monitor')
  monitor(@Param('walletId') _walletId: string): never {
    throw new HttpException({ code: 'ENROLLMENT_UPGRADE_REQUIRED' }, 410);
  }
}

function assertValidWalletId(walletId: string): void {
  try {
    base58ToBuffer(walletId, 32);
  } catch {
    throw new BadRequestException({ code: 'WALLET_MALFORMED' });
  }
}

function assertEnrollBody(body: {
  nonce?: unknown;
  message?: unknown;
  signature?: unknown;
}): { nonce: string; message: string; signature: string } {
  const { nonce, message, signature } = body ?? {};
  if (
    typeof nonce !== 'string' ||
    !/^[0-9a-f]{64}$/.test(nonce) ||
    typeof message !== 'string' ||
    message.length === 0 ||
    typeof signature !== 'string' ||
    signature.length === 0
  ) {
    throw new BadRequestException({ code: 'BAD_REQUEST' });
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