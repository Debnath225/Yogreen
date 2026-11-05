import { Platform } from 'react-native';
import Constants from 'expo-constants';

const expoHostUri = Constants.expoConfig?.hostUri
  || Constants.manifest2?.extra?.expoGo?.debuggerHost
  || Constants.expoGoConfig?.debuggerHost
  || Constants.manifest?.debuggerHost;
const expoHost = (() => {
  if (!expoHostUri) return undefined;
  try {
    return new URL(expoHostUri.includes('://') ? expoHostUri : `http://${expoHostUri}`).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return undefined;
  }
})();
const fallback = __DEV__ && expoHost
  ? `http://${expoHost}:4000`
  : Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || fallback).replace(/\/$/, '');
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/v1/ws';
export const SUPPORT = { email: 'support@yogreen.example', phone: '+911800000000', hours: '7 AM – 10 PM, every day' };
export const APP_VERSION = '1.0.0';
