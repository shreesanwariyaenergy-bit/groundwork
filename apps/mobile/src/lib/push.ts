import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { api } from './supabase';

const TOKEN_KEY = 'gw.pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Asks for permission (Android 13+ requires POST_NOTIFICATIONS) and registers the Expo push token with the backend. */
export async function registerForPush(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS !== 'android' || !Device.isDevice) return 'unavailable';
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#0F6E4F',
  });
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted' && current.canAskAgain) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) return 'unavailable';
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerDevice(token, 'android');
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'granted';
  } catch {
    return 'unavailable';
  }
}

/** Call BEFORE signing out / deleting the account so the device stops receiving this user's notifications. */
export async function unregisterPush() {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    await api.unregisterDevice(token).catch(() => {});
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

/** Notification paths are platform-neutral (e.g. "/messages/<id>") and match app routes. */
const ALLOWED = /^\/(messages(\/[0-9a-f-]{36})?|connections|discover|think(\/[0-9a-f-]{36})?|notifications|inbox|home)?$/i;
export function openNotificationPath(path: unknown) {
  if (typeof path !== 'string' || !ALLOWED.test(path)) { router.push('/inbox'); return; }
  router.push((path === '/' ? '/' : path) as never);
}

export function subscribeToNotificationTaps(): () => void {
  const last = Notifications.getLastNotificationResponse();
  if (last) setTimeout(() => openNotificationPath(last.notification.request.content.data?.path), 300);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => openNotificationPath(r.notification.request.content.data?.path));
  return () => sub.remove();
}
