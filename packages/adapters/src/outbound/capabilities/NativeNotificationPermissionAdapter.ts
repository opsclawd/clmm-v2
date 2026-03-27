/**
 * NativeNotificationPermissionAdapter
 *
 * Handles notification permission for native mobile (React Native / Expo).
 * Uses Expo Notifications API for permission management.
 */
import type { NotificationPermissionPort } from '@clmm/application';

export class NativeNotificationPermissionAdapter implements NotificationPermissionPort {
  async getPermissionState(): Promise<'granted' | 'denied' | 'undetermined'> {
    // TODO: Use Expo Notifications to check current permission state
    // const { status } = await Notifications.getPermissionsAsync();
    // return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    return 'undetermined';
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    // TODO: Use Expo Notifications to request permission
    // const { status } = await Notifications.requestPermissionsAsync();
    // return status === 'granted' ? 'granted' : 'denied';
    return 'denied';
  }
}