import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Task } from '../core/types';
import { formatINR, timeAgo } from '../core/money';
import { colors, font, radius, shadow, space } from '../theme/theme';
import { Button, PressableScale, tap } from './ui';

/** Animated Online/Offline pill. */
export function OnlineToggle({ online, onChange, busy }: { online: boolean; onChange: (v: boolean) => void; busy?: boolean }) {
  const x = useRef(new Animated.Value(online ? 1 : 0)).current;
  useEffect(() => { Animated.spring(x, { toValue: online ? 1 : 0, friction: 7, tension: 140, useNativeDriver: false }).start(); }, [online, x]);
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: online }} accessibilityLabel={online ? 'You are online. Tap to go offline' : 'You are offline. Tap to go online'} onPress={() => { tap(); onChange(!online); }} disabled={busy}>
      <Animated.View style={[styles.pill, { backgroundColor: x.interpolate({ inputRange: [0, 1], outputRange: ['#DDE6E0', colors.primary] }) }]}>
        <Animated.View style={[styles.knob, { left: x.interpolate({ inputRange: [0, 1], outputRange: [4, 78] }) }]}>
          {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={online ? 'flash' : 'power'} size={16} color={online ? colors.primary : colors.muted} />}
        </Animated.View>
        <Text style={[styles.pillText, { left: online ? 14 : undefined, right: online ? undefined : 14, color: online ? '#fff' : colors.sub }]}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function TaskCard({ task, onPress, onAccept, accepting }: { task: Task; onPress: () => void; onAccept?: () => void; accepting?: boolean }) {
  const cod = task.cashToCollect > 0;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={`Order ${task.number}, ${task.itemCount} items, earn ${task.earning} rupees`} style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={{ ...font.h3, color: colors.text }}>#{task.number}</Text>
        <View style={styles.earn}><Text style={{ fontWeight: '900', color: colors.primaryDark }}>₹{task.earning}</Text></View>
      </View>
      <View style={[styles.row, { marginTop: 8 }]}><Ionicons name="location" size={16} color={colors.primary} /><Text style={{ ...font.body, color: colors.text, flex: 1 }} numberOfLines={1}>{task.address ? `${task.address.line1}` : (task.area.landmark || 'Pickup area')} · {task.area.pincode}</Text></View>
      <Text style={{ fontSize: 22, marginVertical: 6 }}>{task.lines.slice(0, 7).map((l) => l.emoji).join(' ')}</Text>
      <View style={styles.rowBetween}>
        <Text style={{ ...font.small, color: colors.sub }}>{task.itemCount} items · {timeAgo(task.createdAt)}</Text>
        {cod ? <View style={styles.cash}><Ionicons name="cash" size={14} color={colors.goldDark} /><Text style={{ ...font.tiny, color: colors.goldDark }}>Collect {formatINR(task.cashToCollect)}</Text></View> : <Text style={{ ...font.tiny, color: colors.primary }}>PREPAID</Text>}
      </View>
      {task.status === 'out_for_delivery' && <View style={[styles.tag, { backgroundColor: colors.goldSoft }]}><Text style={{ ...font.tiny, color: colors.goldDark }}>OUT FOR DELIVERY</Text></View>}
      {onAccept && <View style={{ marginTop: space.md }}><Button title="Accept order" loading={accepting} onPress={onAccept} icon="checkmark-circle" /></View>}
    </PressableScale>
  );
}

export const Stat = ({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'green' }) => (
  <View style={[styles.stat, tone === 'gold' && { backgroundColor: colors.goldSoft }, tone === 'green' && { backgroundColor: colors.primarySoft }]}>
    <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text }}>{value}</Text>
    <Text style={{ ...font.tiny, color: colors.sub, marginTop: 2 }}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  pill: { width: 118, height: 36, borderRadius: 18, justifyContent: 'center' },
  knob: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  pillText: { position: 'absolute', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earn: { backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  cash: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.goldSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  tag: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
