import React, { useEffect } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { earnings, refreshEarnings, summary } from '../state/app';
import { useStore } from '../state/useStore';
import { formatINR, timeAgo } from '../core/money';
import { Card, CountUp, EmptyState, FadeIn, Screen, Skeleton } from '../components/ui';
import { Stat } from '../components/RiderUI';
import { colors, font, radius, space } from '../theme/theme';

const Top = createMaterialTopTabNavigator();

function History() {
  const items = useStore(earnings, (s) => s.items);
  const loaded = useStore(earnings, (s) => s.loaded);
  if (!loaded) return <View style={{ padding: space.lg, gap: space.md }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={64} r={14} />)}</View>;
  return (
    <FlatList data={items} keyExtractor={(e) => e.id} contentContainerStyle={{ padding: space.lg, paddingBottom: 110, flexGrow: 1 }}
      ListEmptyComponent={<EmptyState emoji="💸" title="No earnings yet" text="Complete a delivery to see it here." />}
      renderItem={({ item: e, index }) => (
        <FadeIn delay={Math.min(index, 6) * 40} from={8}><View style={s.row}>
          <View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>Order #{e.number}</Text><Text style={{ ...font.small, color: colors.muted }}>{timeAgo(e.at)}{e.cash > 0 ? ` · collected ${formatINR(e.cash)}` : ''}</Text></View>
          <Text style={{ fontWeight: '900', fontSize: 17, color: colors.primary }}>+{formatINR(e.amount)}</Text>
        </View></FadeIn>
      )} />
  );
}
function Cash() {
  const cash = useStore(summary, (s) => s.cashHeld);
  return (
    <View style={{ padding: space.lg, gap: space.md }}>
      <Card style={{ backgroundColor: cash > 0 ? colors.goldSoft : colors.primarySoft, borderColor: cash > 0 ? '#F7DC9B' : colors.primaryTint }}>
        <Text style={{ ...font.small, fontWeight: '700', color: cash > 0 ? colors.goldDark : colors.primaryDark }}>CASH TO DEPOSIT</Text>
        <Text style={{ fontSize: 36, fontWeight: '900', color: colors.text, marginTop: 4 }}>{formatINR(cash)}</Text>
        <Text style={{ ...font.small, color: colors.sub, marginTop: 6 }}>{cash > 0 ? 'Hand this cash to your hub manager. They’ll mark it settled and it will drop to ₹0 here.' : 'You’re all settled. Nothing to deposit.'}</Text>
      </Card>
      <Text style={{ ...font.small, color: colors.muted }}>Cash collected on cash-on-delivery orders is tracked automatically after each completed delivery.</Text>
    </View>
  );
}

export function EarningsScreen() {
  const today = useStore(summary, (s) => s.today);
  const week = useStore(summary, (s) => s.week);
  useEffect(() => { void refreshEarnings(); }, []);
  return (
    <Screen pad={false}>
      <FadeIn style={{ padding: space.lg, paddingBottom: space.sm }}>
        <View style={s.hero}>
          <Text style={{ ...font.small, color: '#B9F3D5', fontWeight: '700' }}>TODAY’S EARNINGS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><Text style={{ fontSize: 28, fontWeight: '900', color: '#fff' }}>₹</Text><CountUp value={today.earnings} style={{ fontSize: 46, fontWeight: '900', color: '#fff', letterSpacing: -1 }} /></View>
          <Text style={{ ...font.small, color: '#D7F7E6' }}>{today.deliveries} {today.deliveries === 1 ? 'delivery' : 'deliveries'} today</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <Stat label="This week" value={formatINR(week.earnings)} tone="green" />
          <Stat label="Week deliveries" value={String(week.deliveries)} />
        </View>
      </FadeIn>
      <Top.Navigator screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.sub, tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3, borderRadius: 3 }, tabBarStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 }, tabBarLabelStyle: { fontWeight: '700', textTransform: 'none', fontSize: 15 }, sceneStyle: { backgroundColor: colors.bg } }}>
        <Top.Screen name="History" component={History} />
        <Top.Screen name="Cash" component={Cash} />
      </Top.Navigator>
    </Screen>
  );
}
const s = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
