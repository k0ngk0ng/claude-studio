/**
 * App entry point — scan-first flow, no login required.
 *
 * Flow: loading → scanner (if no saved config) → desktops → remote
 *       loading → desktops (if saved config exists) → remote
 */

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRemoteStore, initRelayListeners } from './stores/remoteStore';
import { relayClient } from './services/relay';
import { QRScannerScreen } from './screens/QRScannerScreen';
import { DesktopListScreen } from './screens/DesktopListScreen';
import { RemoteControlScreen } from './screens/RemoteControlScreen';
import { colors } from './utils/theme';

type Screen = 'loading' | 'scanner' | 'desktops' | 'remote';

export default function App() {
  const { controllingDesktopId } = useRemoteStore();
  const [screen, setScreen] = useState<Screen>('loading');

  // Initialize relay event listeners
  useEffect(() => {
    const cleanup = initRelayListeners();
    return cleanup;
  }, []);

  // On mount: try to load saved config and auto-connect
  useEffect(() => {
    (async () => {
      const config = await relayClient.loadSavedConfig();
      if (config) {
        // Has saved config from previous QR scan — try to reconnect
        const connected = await relayClient.connect();
        setScreen(connected ? 'desktops' : 'scanner');
      } else {
        // No config — need to scan QR first
        setScreen('scanner');
      }
    })();
  }, []);

  // Navigate to remote screen when controlling a desktop
  useEffect(() => {
    if (controllingDesktopId && screen !== 'remote') {
      setScreen('remote');
    }
    if (!controllingDesktopId && screen === 'remote') {
      setScreen('desktops');
    }
  }, [controllingDesktopId]);

  let content: React.ReactNode;

  if (screen === 'loading') {
    content = (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  } else if (screen === 'scanner') {
    content = (
      <QRScannerScreen
        onPaired={() => setScreen('desktops')}
        onCancel={() => {
          // If we have config (came from desktops), go back
          if (relayClient.hasConfig()) {
            setScreen('desktops');
          }
        }}
        showCancel={relayClient.hasConfig()}
      />
    );
  } else if (screen === 'remote') {
    content = (
      <RemoteControlScreen
        onBack={() => setScreen('desktops')}
      />
    );
  } else {
    // Default: desktop list
    content = (
      <DesktopListScreen
        onScanQR={() => setScreen('scanner')}
        onSelectDesktop={async (id) => {
          const store = useRemoteStore.getState();
          await store.selectDesktop(id);
        }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      {content}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
});
