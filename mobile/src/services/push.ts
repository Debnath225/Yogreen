import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { ApiClient } from '../core/api';

// In foreground the app shows its own animated toast (from the realtime channel), so suppress the OS banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: false, shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false } as any),
});

export async function pushPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try { return (await Notifications.getPermissionsAsync()).status as any; } catch { return 'undetermined'; }
}

/** Asks permission (if needed) and registers the Expo push token with the backend. Returns whether push is active. */
export async function enablePush(api: ApiClient): Promise<boolean> {
  try {
    if (!Device.isDevice) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Orders & offers', importance: Notifications.AndroidImportance.HIGH, lightColor: '#0B8F5A' });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId && !projectId.startsWith('REPLACE') ? { projectId } : undefined)).data;
    await api.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch {
    return false;
  }
}
