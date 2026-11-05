import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PopupProvider } from './src/components/Popup';
import { RootNavigator } from './src/navigation/Navigators';
import { bootstrap, loadCatalog, realtime, refreshInbox, session } from './src/state/app';

export default function App() {
  useEffect(() => { void bootstrap(); }, []);
  useEffect(() => {
    // Foreground: re-sync prices (ETag => cheap 304) and reconnect the realtime channel. Background: drop the socket to save battery.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        void loadCatalog(true);
        if (session.get().status === 'in') { realtime.start(); void refreshInbox(); }
      } else if (st === 'background') realtime.stop();
    });
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <PopupProvider>
        <StatusBar style="dark" />
        <RootNavigator onRetry={bootstrap} />
      </PopupProvider>
    </SafeAreaProvider>
  );
}
