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
    // boundary: expo-notifications PermissionStatus is an enum; we compare as string
    const statusStr = status as string;
    if (statusStr === 'granted') return 'granted';
    if (statusStr === 'denied') return 'denied';
    return 'undetermined';
  }

  async requestPermission(): Promise<'granted' | 'denied'> {
    const { status } = await Notifications.requestPermissionsAsync();
    // boundary: expo-notifications PermissionStatus is an enum; we compare as string
    return (status as string) === 'granted' ? 'granted' : 'denied';
  }
}