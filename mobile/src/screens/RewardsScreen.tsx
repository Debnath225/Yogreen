import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Text, View, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { api, errorMessage, refreshMe, session } from '../state/app';
import { useStore } from '../state/useStore';
import { ApiError } from '../core/api';
import type { LedgerEntry, WalletRules } from '../core/types';
import { timeAgo } from '../core/money';
import { Button, Card, CountUp, EmptyState, FadeIn, Screen, Skeleton } from '../components/ui';
import { popup } from '../components/Popup';
import { colors, font, radius, space } from '../theme/theme';

const Top = createMaterialTopTabNavigator();
const ICON: Record<LedgerEntry['type'], string> = { bonus: '🎁', earn: '🛒', redeem: '🏷️', refund: '↩️', checkin: '📅' };

function Hero() {
  const w = useStore(session, (s) => s.wallet);
  const [busy, setBusy] = useState(false);
  const streak = w?.streak ?? 0;
  const filled = streak > 0 ? ((streak - 1) % 7) + 1 : 0;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.sequence([Animated.timing(glow, { toValue: 1, duration: 1400, useNativeDriver: true }), Animated.timing(glow, { toValue: 0, duration: 1400, useNativeDriver: true })])); a.start(); return () => a.stop(); }, [glow]);

  const checkin = async () => {
    setBusy(true);
    try {
      const r = await api.checkin();
      await refreshMe();
      popup.show({ type: 'coins', title: `+${r.earned} YGC earned!`, message: `Day ${r.streak} streak. Come back tomorrow for even more.`, actions: [{ label: 'Awesome', style: 'primary' }] });
    } catch (e) { popup.alert(e instanceof ApiError && e.code === 'already_checked_in' ? 'Already claimed' : 'Check-in failed', errorMessage(e), e instanceof ApiError && e.code === 'already_checked_in' ? 'info' : 'error'); }
    finally { setBusy(false); }
  };
  return (
    <View style={styles.hero}>
      <Animated.View style={[styles.halo, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]} />
      <Text style={{ ...font.small, color: '#7A5200', fontWeight: '700' }}>YGC COINS</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <View style={styles.bigCoin}><Text style={{ fontWeight: '900', fontSize: 20, color: '#3A2600' }}>Y</Text></View>
        <CountUp value={w?.balance ?? 0} style={{ fontSize: 44, fontWeight: '900', color: '#3A2600', letterSpacing: -1 }} />
      </View>
      <Text style={{ ...font.small, color: '#7A5200' }}>Worth ₹{w?.valueInr ?? 0} on your next order</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: space.lg }} accessible accessibilityLabel={`${streak} day streak`}>
        {Array.from({ length: 7 }).map((_, i) => <View key={i} style={[styles.pip, i < filled && { backgroundColor: colors.gold, borderColor: colors.gold }]}><Text style={{ fontSize: 10, fontWeight: '800', color: i < filled ? '#3A2600' : '#B38A3A' }}>{i + 1}</Text></View>)}
      </View>
      <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}><Button title={w?.checkedInToday ? 'Checked in today ✓' : 'Daily check-in'} variant={w?.checkedInToday ? 'secondary' : 'gold'} disabled={w?.checkedInToday} loading={busy} onPress={checkin} /></View>
    </View>
  );
}

function Earn() {
  const [rules, setRules] = useState<WalletRules | null>(null);
  useEffect(() => { api.wallet().then((r) => setRules(r.rules)).catch(() => {}); }, []);
  const cards = [
    ['🛒', `Shop & earn ${rules?.earnRatePct ?? 2}% back`, 'Coins are credited when your order is delivered.'],
    ['📅', 'Daily check-in streak', 'Claim every day — the longer the streak, the bigger the reward (up to day 7).'],
    ['🏷️', `Redeem up to ${rules?.maxRedeemPct ?? 10}% per order`, `1 YGC = ₹${rules?.coinValueInr ?? 1}. Turn on “Use YGC coins” at checkout.`],
    ['↩️', 'Cancelled? Coins come back', 'Coins used on a cancelled order are refunded instantly.'],
  ];
  return <FlatList data={cards} keyExtractor={(c) => c[1]} contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }} renderItem={({ item, index }) => <FadeIn delay={index * 70} from={10}><Card style={{ flexDirection: 'row', gap: space.md, marginBottom: space.md, alignItems: 'center' }}><Text style={{ fontSize: 32 }}>{item[0]}</Text><View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>{item[1]}</Text><Text style={{ ...font.small, color: colors.sub, marginTop: 2 }}>{item[2]}</Text></View></Card></FadeIn>} />;
}

function History() {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const balance = useStore(session, (s) => s.wallet?.balance);
  const load = useCallback(async (before?: number) => {
    try { const r = await api.walletHistory(before); setItems((p) => (before ? [...p, ...r.items] : r.items)); setNext(r.nextBefore); setState('ready'); } catch { setState('error'); }
  }, []);
  useEffect(() => { void load(); }, [load, balance]);
  if (state === 'loading') return <View style={{ padding: space.lg, gap: space.md }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} r={14} />)}</View>;
  if (state === 'error') return <EmptyState emoji="📡" title="Couldn’t load history" action={<Button title="Retry" onPress={() => load()} />} />;
  return (
    <FlatList data={items} keyExtractor={(e) => e.id} contentContainerStyle={{ padding: space.lg, paddingBottom: 110, flexGrow: 1 }} onEndReachedThreshold={0.4} onEndReached={() => next && load(next)}
      ListEmptyComponent={<EmptyState emoji="🪙" title="No coin activity yet" text="Your earnings and redemptions will appear here." />}
      renderItem={({ item: e }) => (
        <View style={styles.entry}><Text style={{ fontSize: 24 }}>{ICON[e.type]}</Text><View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>{e.reason}</Text><Text style={{ ...font.small, color: colors.muted }}>{timeAgo(e.at)} · balance {e.balanceAfter}</Text></View><Text style={{ fontWeight: '800', fontSize: 16, color: e.amount > 0 ? colors.primary : colors.danger }}>{e.amount > 0 ? '+' : ''}{e.amount}</Text></View>
      )} />
  );
}

export function RewardsScreen() {
  useEffect(() => { void refreshMe(); }, []);
  return (
    <Screen pad={false}>
      <FadeIn style={{ padding: space.lg, paddingBottom: space.sm }}><Hero /></FadeIn>
      <Top.Navigator screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.sub, tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3, borderRadius: 3 }, tabBarStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 }, tabBarLabelStyle: { fontWeight: '700', textTransform: 'none', fontSize: 15 }, sceneStyle: { backgroundColor: colors.bg } }}>
        <Top.Screen name="How to earn" component={Earn} />
        <Top.Screen name="History" component={History} />
      </Top.Navigator>
    </Screen>
  );
}
const styles = StyleSheet.create({
  hero: { backgroundColor: colors.goldSoft, borderRadius: radius.xl, padding: space.xl, borderWidth: 1, borderColor: '#F7DC9B', overflow: 'hidden' },
  halo: { position: 'absolute', right: -40, top: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: colors.gold },
  bigCoin: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFD27A' },
  pip: { flex: 1, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: '#F0D79A', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFBEF' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
