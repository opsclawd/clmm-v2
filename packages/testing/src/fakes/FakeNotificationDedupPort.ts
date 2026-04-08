import type { NotificationDedupPort } from '@clmm/application';

export class FakeNotificationDedupPort implements NotificationDedupPort {
  private readonly _dispatched = new Set<string>();

  async hasDispatched(triggerId: string): Promise<boolean> {
    return this._dispatched.has(triggerId);
  }

  async markDispatched(triggerId: string): Promise<void> {
    this._dispatched.add(triggerId);
  }

  clear(): void {
    this._dispatched.clear();
  }
}
