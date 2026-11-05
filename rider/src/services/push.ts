import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { RiderApi } from '../core/riderApi';

// Foreground: the app shows its own toast + haptic from the live channel; background: the OS shows the push.
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: false, shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false } as any) });

export async function enablePush(api: RiderApi): Promise<boolean> {
  try {
    if (!Device.isDevice) return false;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'New orders', importance: Notifications.AndroidImportance.MAX, lightColor: '#0B8F5A', vibrationPattern: [0, 250, 150, 250] });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return false;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId && !projectId.startsWith('REPLACE') ? { projectId } : undefined)).data;
    await api.registerPush(token, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch { return false; }
}
