import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Product } from '../core/types';
import { discountPct, formatINR, unitLabel } from '../core/money';
import { colors, font, g, radius, shadow, space } from '../theme/theme';
import { PressableScale, tap } from './ui';

interface Props { product: Product; qty: number; flash?: 'up' | 'down'; onChange: (id: string, qty: number) => void; onOpen: (product: Product) => void }

/** Memoised so that a live price tick only re-renders the cards that actually changed. */
export const ProductCard = memo(function ProductCard({ product: p, qty, flash, onChange, onOpen }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    if (!flash) return;
    pulse.setValue(1);
    Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: false }).start();
  }, [flash, p.v, pulse]);
  const bg = pulse.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', flash === 'down' ? '#D9F5E5' : '#FFE9D6'] });
  const off = discountPct(p.price, p.mrp);
  const out = p.stock <= 0;
  const max = Math.min(20, p.stock);
  return (
    <Animated.View style={[styles.card, { backgroundColor: bg }]}>
      <PressableScale onPress={() => onOpen(p)} accessibilityLabel={`View ${p.name} details`} style={styles.art}>
        {!imageFailed && <Image source={{ uri: p.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setImageFailed(true)} />}
        {imageFailed && <Text style={styles.emoji} accessibilityElementsHidden>{p.emoji}</Text>}
        {off > 0 && !out && <View style={styles.off}><Text style={styles.offText}>{off}% OFF</Text></View>}
      </PressableScale>
      <PressableScale onPress={() => onOpen(p)} accessibilityLabel={`View ${p.name} details`}><Text style={styles.name} numberOfLines={1}>{p.name}</Text></PressableScale>
      <Text style={styles.unit}>{unitLabel(p.unit)}</Text>
      {!out && p.stock <= 10 && <Text style={styles.low}>Only {p.stock} left</Text>}
      <View style={[g.row, { justifyContent: 'space-between', marginTop: space.sm }]}>
        <View>
          <View style={g.row}>
            <Text style={styles.price}>{formatINR(p.price)}</Text>
            {!!flash && <Ionicons name={flash === 'down' ? 'arrow-down' : 'arrow-up'} size={14} color={flash === 'down' ? colors.primary : colors.danger} />}
          </View>
          {p.mrp > p.price && <Text style={styles.mrp}>{formatINR(p.mrp)}</Text>}
        </View>
        {out ? <Text style={styles.oos}>Sold out</Text> : qty === 0 ? (
          <PressableScale onPress={() => onChange(p.id, 1)} accessibilityLabel={`Add ${p.name}`} style={styles.add}><Text style={styles.addText}>ADD</Text></PressableScale>
        ) : (
          <View style={styles.stepper} accessibilityLabel={`${qty} in cart`}>
            <PressableScale onPress={() => onChange(p.id, qty - 1)} accessibilityLabel={`Remove one ${p.name}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}><Ionicons name="remove" size={18} color={colors.white} /></PressableScale>
            <Text style={styles.qty}>{qty}</Text>
            <PressableScale onPress={() => (qty < max ? onChange(p.id, qty + 1) : tap())} accessibilityLabel={`Add one more ${p.name}`} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}><Ionicons name="add" size={18} color={colors.white} /></PressableScale>
          </View>
        )}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, margin: 6, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  art: { height: 104, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  emoji: { fontSize: 44, textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 6 },
  off: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  offText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  name: { ...font.bodyB, color: colors.text },
  unit: { ...font.small, color: colors.sub, marginTop: 1 },
  low: { ...font.tiny, color: colors.danger, marginTop: 3 },
  price: { fontSize: 17, fontWeight: '800', color: colors.text },
  mrp: { ...font.small, color: colors.muted, textDecorationLine: 'line-through' },
  add: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: colors.primarySoft },
  addText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 7, gap: 10 },
  qty: { color: '#fff', fontWeight: '800', minWidth: 16, textAlign: 'center' },
  oos: { ...font.small, fontWeight: '700', color: colors.muted },
});
