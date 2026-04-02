import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { monitoredWallets } from './schema/index.js';
import type { MonitoredWalletRepository } from '@clmm/application';
import type { WalletId, ClockTimestamp } from '@clmm/domain';

export class MonitoredWalletStorageAdapter implements MonitoredWalletRepository {
  constructor(private readonly db: Db) {}

  async enroll(walletId: WalletId, enrolledAt: ClockTimestamp): Promise<void> {
    await this.db
      .insert(monitoredWallets)
      .values({
        walletId,
        enrolledAt,
        active: true,
      })
      .onConflictDoUpdate({
        target: monitoredWallets.walletId,
        set: { active: true, enrolledAt },
      });
  }

  async unenroll(walletId: WalletId): Promise<void> {
    await this.db
      .update(monitoredWallets)
      .set({ active: false })
      .where(eq(monitoredWallets.walletId, walletId));
  }

  async listActiveWallets(): Promise<
    Array<{ walletId: WalletId; lastScannedAt: ClockTimestamp | null }>
  > {
    const rows = await this.db
      .select()
      .from(monitoredWallets)
      .where(eq(monitoredWallets.active, true));

    return rows.map((row) => ({
      walletId: row.walletId as WalletId,
      lastScannedAt: row.lastScannedAt != null
        ? (row.lastScannedAt as ClockTimestamp)
        : null,
    }));
  }

  async markScanned(walletId: WalletId, scannedAt: ClockTimestamp): Promise<void> {
    await this.db
      .update(monitoredWallets)
      .set({ lastScannedAt: scannedAt })
      .where(eq(monitoredWallets.walletId, walletId));
  }
}
