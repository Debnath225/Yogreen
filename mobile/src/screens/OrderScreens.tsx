import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { api, errorMessage, ordersStore, realtime, refreshOrders, setWallet } from '../state/app';
import { useStore } from '../state/useStore';
import type { Order, OrderStatus } from '../core/types';
import { formatINR, timeAgo } from '../core/money';
import { Button, Card, EmptyState, FadeIn, Header, PressableScale, Screen, Skeleton } from '../components/ui';
import { popup } from '../components/Popup';
import { colors, font, radius, space } from '../theme/theme';

const Top = createMaterialTopTabNavigator();
const LABEL: Record<OrderStatus, string> = { placed: 'Order placed', confirmed: 'Confirmed', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const TONE: Record<OrderStatus, [string, string]> = { placed: [colors.infoSoft, colors.info], confirmed: [colors.infoSoft, colors.info], packed: [colors.goldSoft, colors.goldDark], out_for_delivery: [colors.goldSoft, colors.goldDark], delivered: [colors.primarySoft, colors.primaryDark], cancelled: [colors.dangerSoft, colors.danger] };
const FLOW: OrderStatus[] = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered'];
const isActive = (o: Order) => o.status !== 'delivered' && o.status !== 'cancelled';

export function StatusChip({ status }: { status: OrderStatus }) {
  const [bg, fg] = TONE[status];
  return <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}><Text style={{ ...font.tiny, color: fg }}>{LABEL[status]}</Text></View>;
}

function OrderList({ active }: { active: boolean }) {
  const nav = useNavigation<any>();
  const all = useStore(ordersStore, (s) => s.items);
  const loaded = useStore(ordersStore, (s) => s.loaded);
  const loading = useStore(ordersStore, (s) => s.loading);
  const data = useMemo(() => all.filter((o) => isActive(o) === active), [all, active]);
  if (!loaded) return <View style={{ padding: space.lg, gap: space.md }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={110} r={16} />)}</View>;
  return (
    <FlatList
      data={data}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: space.lg, paddingBottom: 110, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshOrders} tintColor={colors.primary} colors={[colors.primary]} />}
      ListEmptyComponent={<EmptyState emoji={active ? '🛵' : '🧾'} title={active ? 'No active orders' : 'No past orders yet'} text={active ? 'Orders you place will show up here with live status.' : 'Delivered and cancelled orders appear here.'} action={active ? <Button title="Shop now" variant="secondary" onPress={() => nav.navigate('Home')} /> : undefined} />}
      renderItem={({ item: o, index }) => (
        <FadeIn delay={Math.min(index, 6) * 50} from={10}>
          <PressableScale onPress={() => nav.navigate('OrderDetail', { orderId: o.id })} accessibilityLabel={`Order ${o.number}, ${LABEL[o.status]}`} style={styles.order}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ ...font.h3, color: colors.text }}>#{o.number}</Text><StatusChip status={o.status} /></View>
            <Text style={{ fontSize: 24, marginVertical: 8 }}>{o.lines.slice(0, 6).map((l) => l.emoji).join(' ')}{o.lines.length > 6 ? ' …' : ''}</Text>
            <Text style={{ ...font.small, color: colors.sub }} numberOfLines={1}>{o.lines.map((l) => `${l.name} ×${l.qty}`).join(', ')}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}><Text style={{ ...font.bodyB, color: colors.text }}>{formatINR(o.total)}</Text><Text style={{ ...font.small, color: colors.muted }}>{timeAgo(o.createdAt)}</Text></View>
          </PressableScale>
        </FadeIn>
      )}
    />
  );
}

export function OrdersScreen() {
  useEffect(() => { void refreshOrders(); }, []);
  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg }}><Header title="My orders" /></View>
      <Top.Navigator screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.sub, tabBarIndicatorStyle: { backgroundColor: colors.primary, height: 3, borderRadius: 3 }, tabBarStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0 }, tabBarLabelStyle: { fontWeight: '700', textTransform: 'none', fontSize: 15 }, sceneStyle: { backgroundColor: colors.bg } }}>
        <Top.Screen name="Active" children={() => <OrderList active />} />
        <Top.Screen name="Past" children={() => <OrderList active={false} />} />
      </Top.Navigator>
    </Screen>
  );
}

export function OrderDetailScreen({ route }: { route: { params: { orderId: string } } }) {
  const nav = useNavigation<any>();
  const id = route.params.orderId;
  const order = useStore(ordersStore, (s) => s.items.find((o) => o.id === id));
  const [cancelling, setCancelling] = useState(false);
  const [riderLocation, setRiderLocation] = useState<{ latitude: number; longitude: number; updatedAt: number } | null>(null);
  const prog = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView>(null);
  const fittedLocations = useRef(false);
  const step = order ? Math.max(0, FLOW.indexOf(order.status)) : 0;

  useEffect(() => { // make sure a deep-linked / pushed order is present and fresh
    api.order(id).then((r) => ordersStore.set((s) => ({ items: s.items.some((o) => o.id === id) ? s.items.map((o) => (o.id === id ? r.order : o)) : [r.order, ...s.items] }))).catch(() => {});
  }, [id]);
  useEffect(() => {
    fittedLocations.current = false;
  }, [id]);
  useEffect(() => {
    if (!order || order.status !== 'out_for_delivery') {
      setRiderLocation(null);
      return;
    }
    realtime.subscribeOrder(order.id, setRiderLocation, () => {
      void api.order(order.id).then((r) => ordersStore.set((s) => ({
        items: s.items.map((current) => current.id === r.order.id ? r.order : current),
      }))).catch((error: unknown) => popup.toast(error instanceof Error ? error.message : 'Could not refresh order status', 'error'));
    });
    return () => realtime.unsubscribeOrder(order.id);
  }, [order?.id, order?.status]);
  const hasDeliveryCoordinates = order?.address.lat !== undefined && order?.address.lng !== undefined;
  useEffect(() => {
    if (!order || !riderLocation || !hasDeliveryCoordinates || fittedLocations.current) return;
    mapRef.current?.fitToCoordinates([
      { latitude: order.address.lat!, longitude: order.address.lng! },
      { latitude: riderLocation.latitude, longitude: riderLocation.longitude },
    ], { edgePadding: { top: 44, right: 44, bottom: 44, left: 44 }, animated: true });
    fittedLocations.current = true;
  }, [hasDeliveryCoordinates, order?.address.lat, order?.address.lng, riderLocation]);
  useEffect(() => { Animated.timing(prog, { toValue: step / (FLOW.length - 1), duration: 700, useNativeDriver: false }).start(); }, [step, prog]);

  const cancel = useCallback(async () => {
    if (!order) return;
    if (!(await popup.confirm({ title: 'Cancel this order?', message: order.coinsUsed ? `Your ${order.coinsUsed} YGC coins will be refunded.` : 'Items go back to stock immediately.', confirmLabel: 'Yes, cancel', cancelLabel: 'Keep order', destructive: true }))) return;
    setCancelling(true);
    try { const r = await api.cancelOrder(order.id); setWallet(r.wallet); await refreshOrders(); popup.toast('Order cancelled', 'success'); }
    catch (e) { popup.alert('Can’t cancel', errorMessage(e), 'error'); }
    finally { setCancelling(false); }
  }, [order]);

  if (!order) return <Screen><Header title="Order" onBack={() => nav.goBack()} /><Skeleton h={200} r={16} /></Screen>;
  const cancelled = order.status === 'cancelled';
  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg }}><Header title={`Order #${order.number}`} onBack={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Tabs'))} right={<StatusChip status={order.status} />} /></View>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Card>
          {cancelled ? <View style={{ alignItems: 'center', gap: 6 }}><Text style={{ fontSize: 40 }}>❌</Text><Text style={{ ...font.h3, color: colors.danger }}>Order cancelled</Text></View> : (
            <View>
              <Text style={{ ...font.h3, color: colors.text, marginBottom: space.lg }}>{order.status === 'delivered' ? 'Delivered — enjoy! 🥗' : 'Tracking your order'}</Text>
              {FLOW.map((s, i) => {
                const done = i <= step;
                const at = order.history.find((h) => h.status === s)?.at;
                return (
                  <View key={s} style={{ flexDirection: 'row', gap: space.md }}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={[styles.node, done && { backgroundColor: colors.primary, borderColor: colors.primary }, i === step && order.status !== 'delivered' && styles.nodeNow]}>{done && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
                      {i < FLOW.length - 1 && <View style={{ width: 3, height: 34, backgroundColor: i < step ? colors.primary : colors.border, borderRadius: 2 }} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}><Text style={{ ...font.bodyB, color: done ? colors.text : colors.muted }}>{LABEL[s]}</Text>{!!at && <Text style={{ ...font.small, color: colors.sub }}>{timeAgo(at)}</Text>}</View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
        {order.status === 'out_for_delivery' && (
          <>
            <Text style={styles.sec}>Live delivery location</Text>
            {hasDeliveryCoordinates || riderLocation ? (
              <>
                <View style={styles.map}>
                  <MapView
                    ref={mapRef}
                    style={StyleSheet.absoluteFill}
                    initialRegion={{
                      latitude: order.address.lat ?? riderLocation!.latitude,
                      longitude: order.address.lng ?? riderLocation!.longitude,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }}
                  >
                    {hasDeliveryCoordinates && <Marker coordinate={{ latitude: order.address.lat!, longitude: order.address.lng! }} title="Delivery address" pinColor={colors.primary} />}
                    {riderLocation && <Marker coordinate={riderLocation} title="Rider" />}
                  </MapView>
                </View>
                <Text style={{ ...font.small, color: colors.sub, marginTop: -space.sm, marginBottom: space.md }}>
                  {riderLocation ? `Rider location updated ${timeAgo(riderLocation.updatedAt)}.${hasDeliveryCoordinates ? '' : ' This order has no saved delivery pin.'}` : 'Waiting for the rider to share a location. Location is shared only while the rider app is open during delivery.'}
                </Text>
              </>
            ) : (
              <Card><Text style={{ ...font.body, color: colors.sub }}>Waiting for the rider to share a location. This saved address has no map pin, so the customer destination will not appear.</Text></Card>
            )}
          </>
        )}
        <Text style={styles.sec}>Items</Text>
        <Card>
          {order.lines.map((l) => <View key={l.productId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 }}><Text style={{ fontSize: 26 }}>{l.emoji}</Text><View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>{l.name}</Text><Text style={{ ...font.small, color: colors.sub }}>{l.qty} × {formatINR(l.unitPrice)}</Text></View><Text style={{ ...font.bodyB, color: colors.text }}>{formatINR(l.lineTotal)}</Text></View>)}
        </Card>
        <Text style={styles.sec}>Bill</Text>
        <Card>
          <Line label="Items" value={formatINR(order.subtotal)} /><Line label="Delivery" value={order.deliveryFee ? formatINR(order.deliveryFee) : 'FREE'} />
          {order.coinsUsed > 0 && <Line label={`YGC coins (${order.coinsUsed})`} value={`− ${formatINR(order.coinDiscount)}`} good />}
          <Line label="Total" value={formatINR(order.total)} bold />
          <Text style={{ ...font.small, color: colors.sub, marginTop: 6 }}>Payment: {order.payment.method === 'cod' ? 'Cash / UPI on delivery' : order.payment.method} · {order.payment.status}</Text>
          {order.status === 'delivered' && order.coinsAwarded > 0 && <Text style={{ ...font.bodyB, color: colors.goldDark, marginTop: 8 }}>🪙 You earned {order.coinsAwarded} YGC</Text>}
          {isActive(order) && order.earnEstimate > 0 && <Text style={{ ...font.small, color: colors.goldDark, marginTop: 8 }}>🪙 You’ll earn ~{order.earnEstimate} YGC on delivery</Text>}
        </Card>
        <Text style={styles.sec}>Delivery address</Text>
        <Card><Text style={{ ...font.bodyB, color: colors.text }}>{order.address.label}</Text><Text style={{ ...font.body, color: colors.sub }}>{order.address.line1}{order.address.landmark ? `, ${order.address.landmark}` : ''} – {order.address.pincode}</Text>{!!order.note && <Text style={{ ...font.small, color: colors.sub, marginTop: 6 }}>Note: {order.note}</Text>}</Card>
        {(order.status === 'placed' || order.status === 'confirmed') && <View style={{ marginTop: space.xl }}><Button title="Cancel order" variant="secondary" loading={cancelling} onPress={cancel} /></View>}
      </ScrollView>
    </Screen>
  );
}
const Line = ({ label, value, good, bold }: { label: string; value: string; good?: boolean; bold?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={{ ...(bold ? font.bodyB : font.body), color: bold ? colors.text : colors.sub }}>{label}</Text><Text style={{ ...font.bodyB, color: good ? colors.primary : colors.text, fontSize: bold ? 17 : 15 }}>{value}</Text></View>
);
const styles = StyleSheet.create({
  order: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  node: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  nodeNow: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  map: { height: 240, overflow: 'hidden', borderRadius: radius.md, marginBottom: space.md },
  sec: { ...font.h3, color: colors.text, marginTop: space.xl, marginBottom: space.md },
});
