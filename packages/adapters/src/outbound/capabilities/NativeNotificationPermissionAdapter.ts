/**
 * NativeNotificationPermissionAdapter
 *
 * Handles notification permission for native mobile (React Native / Expo).
 * Uses Expo Notifications API for permission management.
 *
 * Docs: expo-notifications SDK 52
 *       https://docs.expo.dev/versions/latest/sdk/notifications/
 */
import * as Notifications from 'expo-notifications';
import type { NotificationPermissionPort } from '@clmm/application';

export class NativeNotificationPermissionAdapter implements NotificationPermissionPort {
  async getPermissionState(): Promise<'granted' | 'denied' | 'undetermined'> {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  }
}