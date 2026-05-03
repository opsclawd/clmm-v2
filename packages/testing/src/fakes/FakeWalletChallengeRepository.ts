import type {
  WalletChallengeRepository,
  WalletChallengeRow,
  ConsumeAndEnrollResult,
  MonitoredWalletRepository,
} from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

export class FakeWalletChallengeRepository implements WalletChallengeRepository {
  private rows = new Map<string, WalletChallengeRow>();

  constructor(private readonly monitoredWallets: MonitoredWalletRepository) {}

  async issue(params: {
    walletId: WalletId;
    nonce: string;
    expiresAt: ClockTimestamp;
    issuedAt: ClockTimestamp;
    now: ClockTimestamp;
  }): Promise<WalletChallengeRow> {
    const existing = this.rows.get(params.walletId);
    if (existing && existing.expiresAt >= params.now) {
      return existing;
    }
    const fresh: WalletChallengeRow = {
      walletId: params.walletId,
      nonce: params.nonce,
      expiresAt: params.expiresAt,
      issuedAt: params.issuedAt,
    };
    this.rows.set(params.walletId, fresh);
    return fresh;
  }

  async get(walletId: WalletId): Promise<WalletChallengeRow | null> {
    return this.rows.get(walletId) ?? null;
  }

  async consumeAndEnrollIfMatches(params: {
    walletId: WalletId;
    nonce: string;
    now: ClockTimestamp;
    enrolledAt: ClockTimestamp;
  }): Promise<ConsumeAndEnrollResult> {
    const row = this.rows.get(params.walletId);
    if (row === undefined) return { kind: 'not_found' };
    if (row.nonce !== params.nonce) return { kind: 'mismatch' };
    if (row.expiresAt < params.now) return { kind: 'expired' };

    this.rows.delete(params.walletId);
    await this.monitoredWallets.enroll(params.walletId, params.enrolledAt);
    return { kind: 'consumed' };
  }

  getRowForTest(walletId: WalletId): WalletChallengeRow | undefined {
    return this.rows.get(walletId);
  }
}