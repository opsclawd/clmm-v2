import {
  Controller,
  Post,
  Param,
  Body,
  Inject,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { MonitoredWalletRepository, ClockPort } from '@clmm/application';
import type { WalletId } from '@clmm/domain';
import { MONITORED_WALLET_REPOSITORY, CLOCK_PORT } from './tokens.js';
import {
  issueWalletChallenge,
  consumeWalletChallenge,
  buildWalletVerificationMessage,
  verifyWalletSignature,
} from './WalletVerification.js';

class WalletEnrollmentBody {
  challenge!: string;
  message!: string;
  signature!: string; // base64-encoded 64-byte ed25519 signature
}

@Controller('wallets')
export class WalletController {
  constructor(
    @Inject(MONITORED_WALLET_REPOSITORY)
    private readonly monitoredWalletRepo: MonitoredWalletRepository,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  /**
   * Step 1: Request a ownership challenge for the given wallet address.
   * The returned nonce must be signed by that wallet and submitted
   * together with an enrollment request.
   */
  @Post(':walletId/challenge')
  async requestChallenge(@Param('walletId') walletId: string) {
    const challenge = issueWalletChallenge(walletId);
    return {
      challenge: challenge.nonce,
      expiresAt: challenge.expiresAt,
    };
  }

  /**
   * Step 2: Submit wallet address + proof of ownership.
   * The proof is a signed verification message (see WalletVerification.ts).
   */
  @Post(':walletId/enroll')
  async enrollForMonitoring(
    @Param('walletId') walletId: string,
    @Body() body: WalletEnrollmentBody,
  ) {
    if (!body.challenge || !body.message || !body.signature) {
      throw new BadRequestException(
        'Missing required fields: challenge, message, signature',
      );
    }

    // Verify the challenge is valid, non-expired, and matches the wallet address
    const challenge = consumeWalletChallenge(body.challenge, walletId);
    if (!challenge) {
      throw new BadRequestException(
        'Invalid or expired challenge. Request a new one at POST /wallets/:walletId/challenge',
      );
    }

    // Reconstruct the exact message that should have been signed
    const expectedMessage = buildWalletVerificationMessage(
      walletId,
      challenge.nonce,
    );
    if (body.message !== expectedMessage) {
      throw new BadRequestException(
        'Message does not match expected verification format',
      );
    }

    // Decode base64 signature to Buffer
    let signatureBuffer: Buffer;
    try {
      signatureBuffer = Buffer.from(body.signature, 'base64');
    } catch {
      throw new BadRequestException('Signature must be valid base64');
    }

    // Verify the ed25519 signature against the wallet's public key
    const signatureValid = await verifyWalletSignature({
      message: expectedMessage,
      signature: signatureBuffer,
      walletAddress: walletId,
    });
    if (!signatureValid) {
      throw new BadRequestException(
        'Wallet signature verification failed. Ensure you signed the exact message shown by the app.',
      );
    }

    // Signature proven — enroll the wallet
    const enrolledAt = this.clock.now();
    try {
      await this.monitoredWalletRepo.enroll(walletId as WalletId, enrolledAt);
    } catch (err: unknown) {
      // Duplicate key means already enrolled — surface as 409 Conflict, not 500
      if (err instanceof Error && err.message.includes('duplicate')) {
        throw new ConflictException(`Wallet ${walletId} is already enrolled`);
      }
      throw err;
    }
    return { enrolled: true, enrolledAt };
  }

  /**
   * @deprecated Use POST /wallets/:walletId/challenge then POST /wallets/:walletId/enroll instead.
   * This endpoint is kept for backward compatibility during the transition period.
   * It will be removed in a future release.
   */
  @Post(':walletId/monitor')
  async legacyEnrollForMonitoring(@Param('walletId') _walletId: string) {
    throw new BadRequestException(
      'This endpoint is deprecated. Please update your app to the latest version. ' +
        'Use POST /wallets/:walletId/challenge to get a challenge, then ' +
        'POST /wallets/:walletId/enroll with the signed proof.',
    );
  }
}
