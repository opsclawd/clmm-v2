import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import { notificationDedup } from './schema/index.js';
import type { NotificationDedupPort } from '@clmm/application';

export class NotificationDedupStorageAdapter implements NotificationDedupPort {
  constructor(private readonly db: Db) {}

  async hasDispatched(triggerId: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(notificationDedup)
      .where(eq(notificationDedup.triggerId, triggerId));
    return rows.length > 0;
  }

  async markDispatched(triggerId: string): Promise<void> {
    await this.db
      .insert(notificationDedup)
      .values({
        triggerId,
        dispatchedAt: Date.now(),
      })
      .onConflictDoNothing();
  }
}
