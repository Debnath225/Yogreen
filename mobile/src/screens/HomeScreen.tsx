import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { catalog, inbox, loadCatalog, session, setLineQty, cart } from '../state/app';
import { useStore } from '../state/useStore';
import { createStore } from '../core/createStore';
import { qtyOf } from '../core/cartMath';
import { ProductCard } from '../components/ProductCard';
import { Button, CoinPill, EmptyState, FadeIn, IconButton, Logo, Screen, Skeleton, PressableScale } from '../components/ui';
import { colors, font, radius, space } from '../theme/theme';
import type { Product } from '../core/types';

const Top = createMaterialTopTabNavigator();
const ui = createStore({ search: '' });

function ProductList({ category }: { category: string }) {
  const items = useStore(catalog, (s) => s.items);
  const status = useStore(catalog, (s) => s.status);
  const flash = useStore(catalog, (s) => s.flash);
  const lines = useStore(cart, (s) => s.lines);
  const q = useStore(ui, (s) => s.search).trim().toLowerCase();
  const [refreshing, setRefreshing] = useState(false);
  const data = useMemo(() => items.filter((p) => (category === 'All' || p.category === category) && (!q || p.name.toLowerCase().includes(q))), [items, category, q]);
  const onChange = useCallback((id: string, qty: number) => setLineQty(id, qty), []);
  const nav = useNavigation<any>();
  const render = useCallback(({ item }: { item: Product }) => <ProductCard product={item} qty={qtyOf(lines, item.id)} flash={flash[item.id]} onChange={onChange} onOpen={(p) => nav.navigate('ProductDetail', { productId: p.id })} />, [lines, flash, onChange, nav]);
  const refresh = async () => { setRefreshing(true); await loadCatalog(true); setRefreshing(false); };

  if (status === 'loading' || (status === 'idle' && !items.length)) {
    return <View style={styles.grid}>{Array.from({ length: 6 }).map((_, i) => <View key={i} style={{ width: '50%', padding: 6 }}><Skeleton h={190} r={16} /></View>)}</View>;
  }
  if (status === 'error') return <EmptyState emoji="📡" title="Can’t load the market" text="Check your connection and try again." action={<Button title="Retry" onPress={() => loadCatalog()} />} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(p) => p.id}
      renderItem={render}
      numColumns={2}
      initialNumToRender={8}
      windowSize={7}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 6, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      ListEmptyComponent={<EmptyState emoji="🔍" title="Nothing found" text={q ? `No results for “${q}”.` : 'No items in this category right now.'} />}
    />
  );
}

export function HomeScreen() {
  const nav = useNavigation<any>();
  const categories = useStore(catalog, (s) => s.categories);
  const live = useStore(catalog, (s) => s.live);
  const unread = useStore(inbox, (s) => s.unread);
  const balance = useStore(session, (s) => s.wallet?.balance ?? 0);
  const pin = useStore(session, (s) => s.addresses[0]);
  const search = useStore(ui, (s) => s.search);
  const names = useMemo(() => ['All', ...categories], [categories]);
  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <View style={styles.top}>
          <Logo size={26} />
          <View style={{ flex: 1 }} />
          <PressableScale onPress={() => nav.navigate('Rewards')} accessibilityLabel={`${balance} YGC coins, open rewards`}><CoinPill amount={balance} /></PressableScale>
          <IconButton name="notifications-outline" label="Notifications" badge={unread} onPress={() => nav.navigate('Notifications')} />
        </View>
        <FadeIn style={[styles.top, { marginTop: space.md }]}>
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={{ ...font.small, color: colors.sub, flex: 1 }} numberOfLines={1}>Deliver to <Text style={{ fontWeight: '700', color: colors.text }}>{pin ? `${pin.label} · ${pin.line1}` : 'your address'}</Text></Text>
          <View style={[styles.live, { backgroundColor: live ? colors.primarySoft : colors.border }]}>
            <View style={[styles.dot, { backgroundColor: live ? colors.primary : colors.muted }]} />
            <Text style={{ ...font.tiny, color: live ? colors.primaryDark : colors.muted }}>{live ? 'Live prices' : 'Offline'}</Text>
          </View>
        </FadeIn>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput value={search} onChangeText={(t) => ui.set({ search: t })} placeholder="Search vegetables, fruits, staples…" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 }} returnKeyType="search" accessibilityLabel="Search products" autoCorrect={false} />
          {!!search && <Ionicons name="close-circle" size={18} color={colors.muted} onPress={() => ui.set({ search: '' })} />}
        </View>
      </View>
      {names.length > 1 ? (
        <Top.Navigator key={names.join('|')} screenOptions={{ lazy: true, tabBarScrollEnabled: true, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.sub, tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3, borderRadius: 3 }, tabBarStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 }, tabBarLabelStyle: { fontWeight: '700', textTransform: 'none', fontSize: 14 }, tabBarItemStyle: { width: 'auto', minWidth: 80, paddingHorizontal: 14 }, sceneStyle: { backgroundColor: colors.bg } }}>
          {names.map((n) => <Top.Screen key={n} name={n} children={() => <ProductList category={n} />} />)}
        </Top.Navigator>
      ) : <ProductList category="All" />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  dot: { width: 7, height: 7, borderRadius: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, marginVertical: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 6 },
});
