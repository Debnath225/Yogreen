import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PopupProvider } from './src/components/Popup';
import { RootNavigator } from './src/navigation/Navigators';
import { bootstrap, realtime, refreshAll, session } from './src/state/app';

export default function App() {
  useEffect(() => { void bootstrap(); }, []);
  useEffect(() => {
    // Foreground: reconnect the live channel and re-sync tasks. Background: drop the socket (new-order pushes take over).
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && session.get().status === 'in') { realtime.start(); void refreshAll(); }
      else if (st === 'background') realtime.stop();
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
