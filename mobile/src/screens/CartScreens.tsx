import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { api, cart, catalog, clearCart, errorMessage, loadCatalog, newIdempotencyKey, refreshOrders, session, setLineQty, setWallet } from '../state/app';
import { useStore } from '../state/useStore';
import { estimate, DELIVERY } from '../core/cartMath';
import { formatINR } from '../core/money';
import type { Quote } from '../core/types';
import { ApiError } from '../core/api';
import { Button, Card, CoinPill, EmptyState, FadeIn, Header, PressableScale, Screen, Toggle } from '../components/ui';
import { popup } from '../components/Popup';
import { colors, font, radius, space } from '../theme/theme';

const useNav = () => useNavigation<any>();

function Progress({ value }: { value: number }) {
  const w = useRef(new Animated.Value(value)).current;
  useEffect(() => { Animated.timing(w, { toValue: value, duration: 500, useNativeDriver: false }).start(); }, [value, w]);
  return <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}><Animated.View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primary, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /></View>;
}

export function CartScreen() {
  const nav = useNav();
  const lines = useStore(cart, (s) => s.lines);
  const map = useStore(catalog, (s) => s.map);
  const balance = useStore(session, (s) => s.wallet?.balance ?? 0);
  const e = useMemo(() => estimate(lines, map, balance, false), [lines, map, balance]);

  // drop lines for products that no longer exist; clamp quantities to live stock
  useEffect(() => {
    if (!map.size) return;
    for (const l of lines) { const p = map.get(l.productId); if (!p || !p.stock) setLineQty(l.productId, 0); else if (l.qty > p.stock) setLineQty(l.productId, p.stock); }
  }, [lines, map]);

  if (!e.detailed.length) {
    return <Screen><Header title="Your cart" /><EmptyState emoji="🧺" title="Your basket is empty" text="Add fresh veggies and fruits to get started." action={<Button title="Browse the market" onPress={() => nav.navigate('Home')} />} /></Screen>;
  }
  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg }}><Header title="Your cart" right={<Text onPress={() => popup.confirm({ title: 'Clear cart?', message: 'All items will be removed.', confirmLabel: 'Clear', destructive: true }).then((y) => y && clearCart())} style={{ color: colors.danger, fontWeight: '700' }}>Clear</Text>} /></View>
      <FlatList
        data={e.detailed}
        keyExtractor={(d) => d.product.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 200 }}
        ListHeaderComponent={
          <Card style={{ marginBottom: space.md, backgroundColor: e.deliveryFee === 0 ? colors.primarySoft : colors.card }}>
            <Text style={{ ...font.bodyB, color: colors.text, marginBottom: 8 }}>{e.deliveryFee === 0 ? '🎉 You’ve unlocked free delivery!' : `Add ${formatINR(e.toFreeDelivery)} more for free delivery`}</Text>
            <Progress value={e.freeProgress} />
          </Card>
        }
        renderItem={({ item: { line, product: p } }) => (
          <FadeIn from={8}><View style={styles.line}>
            <View style={styles.thumb}><Text style={{ fontSize: 30 }}>{p.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...font.bodyB, color: colors.text }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ ...font.small, color: colors.sub }}>{formatINR(p.price)} / {p.unit}</Text>
              <Text style={{ ...font.bodyB, color: colors.text, marginTop: 4 }}>{formatINR(Math.round(p.price * line.qty * 100) / 100)}</Text>
            </View>
            <View style={styles.stepper}>
              <PressableScale onPress={() => setLineQty(p.id, line.qty - 1)} accessibilityLabel={`Remove one ${p.name}`}><Ionicons name={line.qty === 1 ? 'trash-outline' : 'remove'} size={18} color="#fff" /></PressableScale>
              <Text style={{ color: '#fff', fontWeight: '800', minWidth: 18, textAlign: 'center' }}>{line.qty}</Text>
              <PressableScale onPress={() => setLineQty(p.id, Math.min(line.qty + 1, p.stock))} accessibilityLabel={`Add one more ${p.name}`}><Ionicons name="add" size={18} color="#fff" /></PressableScale>
            </View>
          </View></FadeIn>
        )}
        ListFooterComponent={<Card style={{ marginTop: space.md }}>
          <BillRow label={`Items (${e.count})`} value={formatINR(e.subtotal)} />
          <BillRow label="Delivery" value={e.deliveryFee === 0 ? 'FREE' : formatINR(e.deliveryFee)} good={e.deliveryFee === 0} />
          {e.savings > 0 && <BillRow label="You save vs MRP" value={formatINR(e.savings)} good />}
        </Card>}
      />
      <View style={styles.bar}>
        <View>
          <Text style={{ ...font.small, color: colors.sub }}>Estimated total</Text>
          <Text style={{ fontSize: 22, fontWeight: '900', color: colors.text }}>{formatINR(e.total)}</Text>
        </View>
        <View style={{ flex: 1 }}><Button title={e.belowMin ? `Min order ${formatINR(DELIVERY.minOrder)}` : 'Checkout'} disabled={e.belowMin} onPress={() => nav.navigate('Checkout')} /></View>
      </View>
    </Screen>
  );
}

const BillRow = ({ label, value, good, bold }: { label: string; value: string; good?: boolean; bold?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
    <Text style={{ ...(bold ? font.bodyB : font.body), color: bold ? colors.text : colors.sub }}>{label}</Text>
    <Text style={{ ...font.bodyB, color: good ? colors.primary : colors.text, fontSize: bold ? 17 : 15 }}>{value}</Text>
  </View>
);

export function CheckoutScreen() {
  const nav = useNav();
  const lines = useStore(cart, (s) => s.lines);
  const addresses = useStore(session, (s) => s.addresses);
  const balance = useStore(session, (s) => s.wallet?.balance ?? 0);
  const [addrId, setAddrId] = useState<string | undefined>(addresses[0]?.id);
  const [useCoins, setUseCoins] = useState(false);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const idem = useRef(newIdempotencyKey()); // reused on retry => a double tap / flaky network can never create two orders

  useEffect(() => { if (!addrId && addresses[0]) setAddrId(addresses[0].id); }, [addresses, addrId]);
  const fetchQuote = useCallback(async () => {
    setQErr(null);
    try { const q = await api.quote(lines, useCoins ? balance : 0); setQuote(q); }
    catch (e) { setQuote(null); setQErr(errorMessage(e)); if (e instanceof ApiError && (e.code === 'insufficient_stock' || e.code === 'product_unavailable')) void loadCatalog(true); }
  }, [lines, useCoins, balance]);
  useEffect(() => { void fetchQuote(); }, [fetchQuote]);

  const place = async () => {
    if (!quote || !addrId) return;
    setPlacing(true);
    try {
      const r = await api.placeOrder({ items: lines, addressId: addrId, useCoins: quote.coinsUsed, note: note.trim() || undefined }, idem.current);
      clearCart(); setWallet(r.wallet); void refreshOrders(); void loadCatalog(true);
      nav.dispatch(CommonActions.reset({ index: 1, routes: [{ name: 'Tabs', params: { screen: 'Orders' } }, { name: 'OrderDetail', params: { orderId: r.order.id } }] }));
      popup.show({ type: 'success', title: 'Order placed! 🎉', message: `Order ${r.order.number} is confirmed. You’ll earn about ${r.order.earnEstimate} YGC once it’s delivered.`, actions: [{ label: 'Track order', style: 'primary' }] });
    } catch (e) {
      popup.alert('Could not place order', errorMessage(e), 'error');
      if (e instanceof ApiError && ['insufficient_stock', 'product_unavailable', 'below_minimum'].includes(e.code)) { idem.current = newIdempotencyKey(); void fetchQuote(); }
    } finally { setPlacing(false); }
  };

  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: space.lg }}><Header title="Checkout" onBack={() => nav.goBack()} /></View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.sec}>Delivery address</Text>
        {addresses.map((a) => (
          <PressableScale key={a.id} onPress={() => setAddrId(a.id)} accessibilityRole="radio" accessibilityLabel={`${a.label}, ${a.line1}`} style={[styles.opt, addrId === a.id && styles.optOn]}>
            <Ionicons name={addrId === a.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={addrId === a.id ? colors.primary : colors.muted} />
            <View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>{a.label}</Text><Text style={{ ...font.small, color: colors.sub }}>{a.line1}{a.landmark ? `, ${a.landmark}` : ''} – {a.pincode}</Text></View>
          </PressableScale>
        ))}
        <Text style={{ color: colors.primary, fontWeight: '700', marginBottom: space.md }} onPress={() => nav.navigate('AddAddress')} accessibilityRole="button">+ Add new address</Text>

        <Text style={styles.sec}>YGC coins</Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <CoinPill amount={balance} big />
          <View style={{ flex: 1 }}>
            <Text style={{ ...font.bodyB, color: colors.text }}>Use YGC coins</Text>
            <Text style={{ ...font.small, color: colors.sub }}>{quote && quote.maxRedeemable > 0 ? `Save up to ${formatINR(quote.maxRedeemable)} on this order` : 'Earn coins on this order to use next time'}</Text>
          </View>
          <Toggle value={useCoins} disabled={!quote || quote.maxRedeemable === 0} onValueChange={setUseCoins} activeColor={colors.gold} accessibilityLabel="Use YGC coins" />
        </Card>

        <Text style={styles.sec}>Payment</Text>
        <View style={[styles.opt, styles.optOn]}><Ionicons name="cash-outline" size={22} color={colors.primary} /><View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>Cash / UPI on delivery</Text><Text style={{ ...font.small, color: colors.sub }}>Pay the rider when your order arrives</Text></View></View>
        <View style={[styles.opt, { opacity: 0.5 }]}><Ionicons name="card-outline" size={22} color={colors.muted} /><View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>Pay online</Text><Text style={{ ...font.small, color: colors.sub }}>Coming soon</Text></View></View>

        <Text style={styles.sec}>Delivery note (optional)</Text>
        <TextInput value={note} onChangeText={setNote} placeholder="e.g. Ring the bell twice" placeholderTextColor={colors.muted} maxLength={200} style={styles.note} accessibilityLabel="Delivery note" />

        <Text style={styles.sec}>Bill details</Text>
        <Card>
          {quote ? <>
            <BillRow label="Items" value={formatINR(quote.subtotal)} />
            <BillRow label="Delivery" value={quote.deliveryFee ? formatINR(quote.deliveryFee) : 'FREE'} good={!quote.deliveryFee} />
            {quote.coinsUsed > 0 && <BillRow label={`YGC coins (${quote.coinsUsed})`} value={`− ${formatINR(quote.coinDiscount)}`} good />}
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
            <BillRow label="To pay" value={formatINR(quote.total)} bold />
            <Text style={{ ...font.small, color: colors.goldDark, marginTop: 6 }}>🪙 You’ll earn ~{quote.earnEstimate} YGC after delivery</Text>
          </> : qErr ? <Text style={{ color: colors.danger, ...font.body }}>{qErr}</Text> : <Text style={{ color: colors.sub }}>Calculating…</Text>}
        </Card>
      </ScrollView>
      <View style={styles.bar}><View style={{ flex: 1 }}><Button title={quote ? `Place order · ${formatINR(quote.total)}` : 'Place order'} loading={placing} disabled={!quote || !addrId} onPress={place} /></View></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.lg, paddingBottom: space.xl, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sec: { ...font.h3, color: colors.text, marginTop: space.xl, marginBottom: space.md },
  opt: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, marginBottom: space.sm },
  optOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  note: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, fontSize: 15, color: colors.text },
});
