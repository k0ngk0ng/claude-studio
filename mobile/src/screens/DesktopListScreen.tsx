/**
 * Desktop list screen — shows paired desktops, connect/scan QR.
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRemoteStore } from '../stores/remoteStore';
import { relayClient } from '../services/relay';
import { colors, spacing, fontSize, borderRadius } from '../utils/theme';

interface Props {
  onScanQR: () => void;
  onSelectDesktop: (desktopId: string) => Promise<void>;
}

export function DesktopListScreen({ onScanQR, onSelectDesktop }: Props) {
  const { connected, desktops, connect } = useRemoteStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    if (!connected) {
      connect();
    }
    relayClient.getDeviceId().then(setDeviceId);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await connect();
    setRefreshing(false);
  }, [connect]);

  const handleSelectDesktop = async (desktopId: string) => {
    const desktop = desktops.find(d => d.desktopId === desktopId);
    if (!desktop?.online) return;

    try {
      await onSelectDesktop(desktopId);
    } catch (err: any) {
      if (err?.message === 'NO_SESSION') {
        Alert.alert(
          'Re-pair Required',
          'Encryption keys are missing for this desktop. Please scan the QR code again to re-pair.',
          [
            { text: 'Scan QR', onPress: onScanQR },
            { text: 'Remove', style: 'destructive', onPress: () => relayClient.forgetDesktop(desktopId) },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
      }
    }
  };

  const handleLongPress = (desktopId: string, deviceName: string) => {
    Alert.alert(
      deviceName,
      'Remove this desktop from the list?',
      [
        { text: 'Remove', style: 'destructive', onPress: () => relayClient.forgetDesktop(desktopId) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleDisconnect = async () => {
    relayClient.disconnect();
    await relayClient.clearConfig();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Desktops</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, connected ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.statusText}>
              {connected ? 'Connected to relay' : 'Disconnected'}
            </Text>
          </View>
          {deviceId ? (
            <Text style={styles.deviceIdText} selectable>
              ID: {deviceId}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {/* Desktop list */}
      <FlatList
        data={desktops}
        keyExtractor={(item) => item.desktopId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🖥️</Text>
            <Text style={styles.emptyTitle}>No desktops paired</Text>
            <Text style={styles.emptyText}>
              Scan a QR code from your desktop's{'\n'}Settings → Remote Control to pair.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={() => (
              <TouchableOpacity
                style={styles.removeAction}
                onPress={() => handleLongPress(item.desktopId, item.deviceName)}
              >
                <Text style={styles.removeActionText}>Remove</Text>
              </TouchableOpacity>
            )}
            rightThreshold={40}
          >
            <TouchableOpacity
              style={[styles.desktopCard, !item.online && styles.desktopCardOffline]}
              onPress={() => handleSelectDesktop(item.desktopId)}
              activeOpacity={0.7}
            >
              <View style={styles.desktopInfo}>
                <Text style={styles.desktopIcon}>🖥️</Text>
                <View style={styles.desktopText}>
                  <Text style={[styles.desktopName, !item.online && styles.textOffline]}>
                    {item.deviceName}
                  </Text>
                  <View style={styles.desktopStatus}>
                    <View style={[styles.smallDot, item.online ? styles.dotOnline : styles.dotOffline]} />
                    <Text style={styles.desktopStatusText}>
                      {item.online ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>
              </View>
              {item.online && (
                <Text style={styles.connectArrow}>→</Text>
              )}
            </TouchableOpacity>
          </Swipeable>
        )}
      />

      {/* Scan QR button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={onScanQR}
          activeOpacity={0.8}
        >
          <Text style={styles.scanButtonText}>📷 Scan QR to Pair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  smallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOnline: {
    backgroundColor: colors.success,
  },
  dotOffline: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  deviceIdText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  disconnectBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disconnectText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  desktopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  desktopCardOffline: {
    opacity: 0.5,
  },
  desktopInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  desktopIcon: {
    fontSize: 28,
  },
  desktopText: {
    gap: 2,
  },
  desktopName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  textOffline: {
    color: colors.textMuted,
  },
  desktopStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  desktopStatusText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  connectArrow: {
    fontSize: fontSize.xl,
    color: colors.accent,
    fontWeight: '600',
  },
  removeAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  removeActionText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyIcon: {
    fontSize: 48,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomBar: {
    padding: spacing.xl,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scanButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  scanButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
