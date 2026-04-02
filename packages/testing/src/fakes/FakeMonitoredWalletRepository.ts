import type { MonitoredWalletRepository } from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

type WalletRecord = {
  walletId: WalletId;
  enrolledAt: ClockTimestamp;
  lastScannedAt: ClockTimestamp | null;
  active: boolean;
};

export class FakeMonitoredWalletRepository implements MonitoredWalletRepository {
  private wallets = new Map<string, WalletRecord>();

  async enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void> {
    const existing = this.wallets.get(walletId);
    if (existing) {
      existing.active = true;
      existing.enrolledAt = enrolledAt;
    } else {
      this.wallets.set(walletId, {
        walletId,
        enrolledAt,
        lastScannedAt: null,
        active: true,
      });
    }
  }

  async unenroll(walletId: WalletId): Promise<void> {
    const existing = this.wallets.get(walletId);
    if (existing) {
      existing.active = false;
    }
  }

  async listActiveWallets(): Promise<
    Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>
  > {
    return Array.from(this.wallets.values())
      .filter((w) => w.active)
      .map((w) => ({ walletId: w.walletId, lastScannedAt: w.lastScannedAt }));
  }

  async markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void> {
    const existing = this.wallets.get(walletId);
    if (existing) {
      existing.lastScannedAt = scannedAt;
    }
  }
}
