import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { api, claimTask, deliverTask, errorMessage, pickupTask, realtime, refreshTasks, releaseTask, setOnline, summary, tasks } from '../state/app';
import { useStore } from '../state/useStore';
import { ApiError } from '../core/baseApi';
import { formatINR } from '../core/money';
import type { Task } from '../core/types';
import { Button, Card, EmptyState, FadeIn, Header, IconButton, Logo, PressableScale, Screen, Skeleton } from '../components/ui';
import { OtpInput } from '../components/OtpInput';
import { OnlineToggle, Stat, TaskCard } from '../components/RiderUI';
import { popup } from '../components/Popup';
import { colors, font, g, radius, space } from '../theme/theme';

const Top = createMaterialTopTabNavigator();
const useNav = () => useNavigation<any>();

function List({ scope }: { scope: 'available' | 'active' | 'done' }) {
  const nav = useNav();
  const data = useStore(tasks, (s) => s[scope]);
  const loaded = useStore(tasks, (s) => s.loaded);
  const loading = useStore(tasks, (s) => s.loading);
  const online = useStore(summary, (s) => s.online);
  const [accepting, setAccepting] = useState<string | null>(null);

  const accept = useCallback(async (t: Task) => {
    setAccepting(t.id);
    try { await claimTask(t.id); popup.toast(`Order #${t.number} is yours`, 'success'); nav.navigate('TaskDetail', { orderId: t.id }); }
    catch (e) {
      popup.alert(e instanceof ApiError && e.code === 'order_unavailable' ? 'Too late!' : 'Can’t accept', errorMessage(e), 'info');
      void refreshTasks('available');
    } finally { setAccepting(null); }
  }, [nav]);

  if (scope === 'available' && !online) return <EmptyState emoji="😴" title="You’re offline" text="Go online to see and accept new orders." action={<Button title="Go online" icon="flash" onPress={() => setOnline(true)} />} />;
  if (!loaded) return <View style={{ padding: space.lg, gap: space.md }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={150} r={16} />)}</View>;
  const empty = scope === 'available' ? ['🛵', 'Waiting for orders', 'New orders appear here instantly. Keep the app open.'] : scope === 'active' ? ['📦', 'No active deliveries', 'Accept an order from the Available tab.'] : ['✅', 'No deliveries yet', 'Completed deliveries show up here.'];
  return (
    <FlatList
      data={data}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 110, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refreshTasks()} tintColor={colors.primary} colors={[colors.primary]} />}
      ListEmptyComponent={<EmptyState emoji={empty[0]} title={empty[1]} text={empty[2]} />}
      renderItem={({ item, index }) => <FadeIn delay={Math.min(index, 5) * 50} from={10}><TaskCard task={item} onPress={() => nav.navigate('TaskDetail', { orderId: item.id })} onAccept={scope === 'available' ? () => accept(item) : undefined} accepting={accepting === item.id} /></FadeIn>}
    />
  );
}
const TabLabel = ({ name, scope, color }: { name: string; scope: 'available' | 'active' | 'done'; color: string }) => {
  const n = useStore(tasks, (s) => s[scope].length);
  return <Text style={{ color, fontWeight: '700', fontSize: 14 }}>{name}{scope !== 'done' && n > 0 ? ` (${n})` : ''}</Text>;
};

export function TasksScreen() {
  const online = useStore(summary, (s) => s.online);
  const live = useStore(summary, (s) => s.live);
  const today = useStore(summary, (s) => s.today);
  const cash = useStore(summary, (s) => s.cashHeld);
  const [busy, setBusy] = useState(false);
  const toggle = async (v: boolean) => { setBusy(true); await setOnline(v); setBusy(false); };
  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={24} />
          <OnlineToggle online={online} onChange={toggle} busy={busy} />
        </View>
        {online && !live && <Text style={{ ...font.small, color: colors.danger, marginTop: 6 }} accessibilityLiveRegion="polite">Reconnecting… you may miss live alerts</Text>}
        <View style={{ flexDirection: 'row', gap: space.sm, marginVertical: space.md }}>
          <Stat label="Today’s earnings" value={formatINR(today.earnings)} tone="green" />
          <Stat label="Deliveries" value={String(today.deliveries)} />
          <Stat label="Cash to deposit" value={formatINR(cash)} tone={cash > 0 ? 'gold' : undefined} />
        </View>
      </View>
      <Top.Navigator screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.sub, tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3, borderRadius: 3 }, tabBarStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 }, sceneStyle: { backgroundColor: colors.bg } }}>
        <Top.Screen name="Available" children={() => <List scope="available" />} options={{ tabBarLabel: ({ color }) => <TabLabel name="Available" scope="available" color={color} /> }} />
        <Top.Screen name="Active" children={() => <List scope="active" />} options={{ tabBarLabel: ({ color }) => <TabLabel name="Active" scope="active" color={color} /> }} />
        <Top.Screen name="Done" children={() => <List scope="done" />} options={{ tabBarLabel: ({ color }) => <TabLabel name="Done" scope="done" color={color} /> }} />
      </Top.Navigator>
    </Screen>
  );
}

// ------------------------------------------------------------------ detail
const STEPS = ['Accepted', 'Picked up', 'Delivered'];
export function TaskDetailScreen({ route }: { route: { params: { orderId: string } } }) {
  const nav = useNav();
  const id = route.params.orderId;
  const fromStore = useStore(tasks, (s) => s.available.find((t) => t.id === id) ?? s.active.find((t) => t.id === id) ?? s.done.find((t) => t.id === id));
  const [fetched, setFetched] = useState<Task | null>(null);
  const task = fromStore ?? fetched;
  const [riderPosition, setRiderPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const focused = useIsFocused();
  const riderMapRef = useRef<MapView>(null);
  const fittedDelivery = useRef(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!fromStore) api.task(id).then((r) => setFetched(r.order)).catch(() => {}); }, [id, fromStore]);
  useEffect(() => { fittedDelivery.current = false; }, [id]);
  useEffect(() => {
    let active = true;
    let foreground = AppState.currentState === 'active';
    let starting = false;
    let watcher: Location.LocationSubscription | null = null;
    const stop = () => {
      watcher?.remove();
      watcher = null;
      realtime.clearLocation(id);
    };
    const start = async () => {
      if (!active || !foreground || starting || watcher || !focused || !task?.mine || task.status !== 'out_for_delivery') return;
      starting = true;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active || !foreground) return;
        if (status !== 'granted') {
          popup.alert('Location permission needed', 'Allow location access while using the app to share your live position during this delivery.', 'info');
          return;
        }
        const subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          ({ coords }) => {
            if (!active || !foreground || AppState.currentState !== 'active') return;
            const position = { latitude: coords.latitude, longitude: coords.longitude };
            setRiderPosition(position);
            realtime.publishLocation(id, position);
          },
        );
        if (!active || !foreground) subscription.remove();
        else watcher = subscription;
      } finally { starting = false; }
    };
    if (focused && task?.mine && task.status === 'out_for_delivery') {
      void start().catch((error: unknown) => {
        if (active) popup.alert('Could not share location', error instanceof Error ? error.message : 'Check location settings and try again.', 'error');
      });
    } else {
      setRiderPosition(null);
      stop();
    }
    const appState = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (foreground) void start().catch((error: unknown) => {
        if (active) popup.alert('Could not share location', error instanceof Error ? error.message : 'Check location settings and try again.', 'error');
      });
      else { stop(); setRiderPosition(null); }
    });
    return () => { active = false; appState.remove(); stop(); };
  }, [focused, id, task?.mine, task?.status]);
  useEffect(() => {
    if (!task?.address || task.address.lat === undefined || task.address.lng === undefined || !riderPosition || fittedDelivery.current) return;
    riderMapRef.current?.fitToCoordinates([
      { latitude: task.address.lat, longitude: task.address.lng },
      riderPosition,
    ], { edgePadding: { top: 44, right: 44, bottom: 44, left: 44 }, animated: true });
    fittedDelivery.current = true;
  }, [riderPosition, task?.address?.lat, task?.address?.lng]);

  const mapsUrl = useMemo(() => task?.address ? `${Platform.OS === 'ios' ? 'http://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query='}${encodeURIComponent(`${task.address.line1}, ${task.address.pincode}`)}` : '', [task]);
  const open = (url: string) => Linking.openURL(url).catch(() => popup.alert('Can’t open', 'No app available for this action.', 'error'));
  const run = async (fn: () => Promise<unknown>, errTitle: string) => { setBusy(true); try { await fn(); } catch (e) { popup.alert(errTitle, errorMessage(e), 'error'); } finally { setBusy(false); } };

  if (!task) return <Screen><Header title="Order" onBack={() => nav.goBack()} /><Skeleton h={220} r={16} /></Screen>;
  const mine = task.mine && task.status !== 'delivered';
  const step = task.status === 'delivered' ? 2 : task.status === 'out_for_delivery' ? 1 : 0;
  const allChecked = task.lines.every((_, i) => checked[i]);

  const pickup = async () => {
    if (!allChecked && !(await popup.confirm({ title: 'Items not all ticked', message: 'Confirm you’ve checked every item in the bag before leaving the hub.', confirmLabel: 'Picked up' }))) return;
    await run(() => pickupTask(task.id), 'Could not mark picked up');
  };
  const release = async () => {
    if (!(await popup.confirm({ title: 'Release this order?', message: 'It goes back to the available list for other riders.', confirmLabel: 'Release', destructive: true }))) return;
    await run(async () => { await releaseTask(task.id); nav.goBack(); }, 'Could not release');
  };
  const accept = () => run(async () => { await claimTask(task.id); }, 'Can’t accept');

  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg }}><Header title={`Order #${task.number}`} onBack={() => nav.goBack()} /></View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {task.mine && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {STEPS.map((l, i) => (
                <View key={l} style={{ alignItems: 'center', flex: 1 }}>
                  <View style={[s.dot, i <= step && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{i <= step && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
                  <Text style={{ ...font.tiny, marginTop: 4, color: i <= step ? colors.text : colors.muted }}>{l}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
          <Stat label="You earn" value={`₹${task.earning}`} tone="green" />
          <Stat label={task.cashToCollect > 0 ? 'Collect cash' : 'Payment'} value={task.cashToCollect > 0 ? formatINR(task.cashToCollect) : 'Prepaid'} tone={task.cashToCollect > 0 ? 'gold' : undefined} />
        </View>

        {task.mine && task.customer && task.address ? (
          <>
            <Text style={s.sec}>Deliver to</Text>
            {task.status === 'out_for_delivery' && task.address.lat !== undefined && task.address.lng !== undefined && (
              <View style={s.map}>
                <MapView
                  ref={riderMapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={{ latitude: task.address.lat, longitude: task.address.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
                >
                  <Marker coordinate={{ latitude: task.address.lat, longitude: task.address.lng }} title="Customer delivery address" />
                  {riderPosition && <Marker coordinate={riderPosition} title="Your live location" pinColor={colors.primary} />}
                </MapView>
              </View>
            )}
            <Card>
              <Text style={{ ...font.h3, color: colors.text }}>{task.customer.name}</Text>
              <Text style={{ ...font.body, color: colors.sub, marginTop: 4 }}>{task.address.label} · {task.address.line1}{task.address.landmark ? `, ${task.address.landmark}` : ''} – {task.address.pincode}</Text>
              {!!task.note && <View style={s.note}><Ionicons name="chatbox-ellipses" size={16} color={colors.goldDark} /><Text style={{ ...font.small, color: colors.goldDark, flex: 1 }}>{task.note}</Text></View>}
              {task.status !== 'delivered' && (
                <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.lg }}>
                  <View style={{ flex: 1 }}><Button title="Navigate" variant="secondary" icon="navigate" onPress={() => open(mapsUrl)} /></View>
                  {!!task.customer.phone && <View style={{ flex: 1 }}><Button title="Call" variant="secondary" icon="call" onPress={() => open(`tel:${task.customer!.phone}`)} /></View>}
                </View>
              )}
            </Card>
          </>
        ) : (
          <><Text style={s.sec}>Drop area</Text><Card><Text style={{ ...font.bodyB, color: colors.text }}>{task.area.landmark || 'Near ' + task.area.pincode} · {task.area.pincode}</Text><Text style={{ ...font.small, color: colors.sub, marginTop: 4 }}>The customer’s name, phone and full address appear after you accept.</Text></Card></>
        )}

        <Text style={s.sec}>{mine && step === 0 ? 'Pickup checklist' : 'Items'} ({task.itemCount})</Text>
        <Card>
          {task.lines.map((l, i) => (
            <PressableScale key={i} haptic={mine && step === 0} onPress={() => mine && step === 0 && setChecked((c) => ({ ...c, [i]: !c[i] }))} accessibilityRole="checkbox" accessibilityLabel={`${l.name}, quantity ${l.qty}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8 }}>
              {mine && step === 0 && <Ionicons name={checked[i] ? 'checkbox' : 'square-outline'} size={24} color={checked[i] ? colors.primary : colors.muted} />}
              <Text style={{ fontSize: 24 }}>{l.emoji}</Text>
              <Text style={{ ...font.bodyB, color: colors.text, flex: 1, textDecorationLine: checked[i] ? 'line-through' : 'none' }}>{l.name}</Text>
              <Text style={{ ...font.bodyB, color: colors.sub }}>× {l.qty}</Text>
            </PressableScale>
          ))}
        </Card>
        {mine && step === 0 && <Text style={{ color: colors.danger, fontWeight: '700', textAlign: 'center', marginTop: space.xl }} onPress={release} accessibilityRole="button">Release this order</Text>}
      </ScrollView>
      <View style={s.bar}>
        {!task.mine && task.status === 'packed' && <Button title="Accept order" icon="checkmark-circle" loading={busy} onPress={accept} />}
        {mine && step === 0 && <Button title="Confirm pickup" icon="bag-check" loading={busy} onPress={pickup} />}
        {mine && step === 1 && <Button title="Complete delivery" icon="shield-checkmark" variant="gold" onPress={() => nav.navigate('Deliver', { orderId: task.id })} />}
        {task.status === 'delivered' && <Button title="Back to tasks" variant="secondary" onPress={() => nav.goBack()} />}
      </View>
    </Screen>
  );
}

// ------------------------------------------------------------- proof of delivery
export function DeliverScreen({ route }: { route: { params: { orderId: string } } }) {
  const nav = useNav();
  const task = useStore(tasks, (s) => s.active.find((t) => t.id === route.params.orderId));
  const [code, setCode] = useState('');
  const [collected, setCollected] = useState(false);
  const [st, setSt] = useState({ loading: false, error: null as string | null, k: 0 });
  const cash = task?.cashToCollect ?? 0;
  const submit = useCallback(async (c: string) => {
    if (!task || st.loading) return;
    if (cash > 0 && !collected) { popup.alert('Collect the cash first', `Collect ${formatINR(cash)} from the customer and tick the box.`, 'info'); setCode(''); return; }
    setSt((x) => ({ ...x, loading: true, error: null }));
    try {
      const done = await deliverTask(task.id, c);
      popup.show({ type: 'success', title: 'Delivered! 🎉', message: `You earned ₹${done.earning}.${cash > 0 ? ` Remember to deposit ${formatINR(cash)} cash.` : ''}`, actions: [{ label: 'Great', style: 'primary' }] });
      nav.navigate('Tabs');
    } catch (e) {
      setCode('');
      setSt((x) => ({ loading: false, error: errorMessage(e), k: x.k + 1 }));
      if (e instanceof ApiError && e.code === 'code_locked') popup.alert('PIN locked', e.message, 'error');
    }
  }, [task, st.loading, cash, collected, nav]);
  useEffect(() => { if (code.length === 4) void submit(code); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!task) return <Screen><Header title="Delivery" onBack={() => nav.goBack()} /><EmptyState emoji="✅" title="Nothing to deliver" /></Screen>;
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Complete delivery" onBack={() => nav.goBack()} />
      <FadeIn><Text style={{ ...font.body, color: colors.sub, lineHeight: 22 }}>Ask {task.customer?.name?.split(' ')[0] || 'the customer'} for the 4-digit delivery PIN shown in their YoGreen app.</Text></FadeIn>
      {cash > 0 && (
        <FadeIn delay={80} style={{ marginTop: space.lg }}>
          <PressableScale onPress={() => setCollected(!collected)} accessibilityRole="checkbox" accessibilityState={{ checked: collected }} style={[s.cashCard, collected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
            <Ionicons name={collected ? 'checkbox' : 'square-outline'} size={26} color={collected ? colors.primary : colors.goldDark} />
            <View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>I collected {formatINR(cash)}</Text><Text style={{ ...font.small, color: colors.sub }}>Cash / UPI on delivery</Text></View>
          </PressableScale>
        </FadeIn>
      )}
      <FadeIn delay={160} style={{ marginTop: space.xl, paddingHorizontal: space.xxl }}>
        <OtpInput length={4} value={code} onChange={(v) => { setCode(v); if (st.error) setSt((x) => ({ ...x, error: null })); }} error={!!st.error} errorKey={st.k} />
        {!!st.error && <Text style={{ ...font.small, color: colors.danger, marginTop: space.md, textAlign: 'center' }} accessibilityLiveRegion="polite">{st.error}</Text>}
      </FadeIn>
      <View style={{ flex: 1 }} />
      <Button title="Confirm delivery" loading={st.loading} disabled={code.length !== 4} onPress={() => submit(code)} />
    </Screen>
  );
}
const s = StyleSheet.create({
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sec: { ...font.h3, color: colors.text, marginTop: space.xl, marginBottom: space.md },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.goldSoft, borderRadius: 10, padding: space.md, marginTop: space.md },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, paddingBottom: space.xl, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  map: { height: 240, overflow: 'hidden', borderRadius: radius.md, marginBottom: space.md },
  cashCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#F7DC9B', backgroundColor: colors.goldSoft },
});
