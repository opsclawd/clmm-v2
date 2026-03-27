/**
 * WebNotificationPermissionAdapter
 *
 * Handles notification permission for web (Browser).
 * Uses the Notification API for permission management.
 */
import type { NotificationPermissionPort } from '@clmm/application';

export class WebNotificationPermissionAdapter implements NotificationPermissionPort {
  async getPermissionState(): Promise<'granted' | 'denied' | 'undetermined'> {
    if (typeof Notification === 'undefined') {
      return 'undetermined';
    }
    const permission = Notification.permission;
    if (permission === 'granted') return 'granted';
    if (permission === 'denied') return 'denied';
    return 'undetermined';
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    if (typeof Notification === 'undefined') {
      return 'denied';
    }
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
}