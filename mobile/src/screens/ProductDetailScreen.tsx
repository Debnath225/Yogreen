import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Product } from '../core/types';
import { discountPct, formatINR, unitLabel } from '../core/money';
import { cart, catalog, setLineQty } from '../state/app';
import { useStore } from '../state/useStore';
import { Button, Header, Screen } from '../components/ui';
import { colors, font, radius, shadow, space } from '../theme/theme';

export function ProductDetailScreen({ route }: { route: { params: { productId: string } } }) {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const product = useStore(catalog, (s) => s.map.get(route.params.productId));
  const qty = useStore(cart, (s) => s.lines.find((line) => line.productId === route.params.productId)?.qty ?? 0);
  const [imageFailed, setImageFailed] = useState(false);

  if (!product) {
    return <Screen><Header title="Product" onBack={() => nav.goBack()} /><Text style={{ ...font.body, color: colors.sub }}>This product is no longer available.</Text></Screen>;
  }
  const p: Product = product;
  const out = p.stock <= 0;
  return (
    <Screen pad={false} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: space.lg }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {!imageFailed && <Image source={{ uri: p.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setImageFailed(true)} />}
          {imageFailed && <Text style={{ fontSize: 100 }}>{p.emoji}</Text>}
          <View style={styles.imageShade} />
          <View style={[styles.heroActions, { top: insets.top + space.sm }]}>
            <Pressable onPress={() => nav.goBack()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={colors.white} />
            </Pressable>
            {discountPct(p.price, p.mrp) > 0 && <Text style={styles.discount}>{discountPct(p.price, p.mrp)}% OFF</Text>}
          </View>
          <View style={styles.imageMeta}>
            <View style={styles.imageCategory}><Ionicons name="leaf" size={14} color={colors.white} /><Text style={styles.imageLabel}>{p.category}</Text></View>
            <Text style={styles.imageCaption}>Farm fresh · carefully selected</Text>
          </View>
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...font.h1, color: colors.text }}>{p.name}</Text>
              <Text style={{ ...font.body, color: colors.sub, marginTop: 4 }}>{unitLabel(p.unit)} · {p.category}</Text>
            </View>
            <View style={[styles.stockPill, out && styles.outPill]}>
              <View style={[styles.stockDot, out && { backgroundColor: colors.danger }]} />
              <Text style={{ ...font.tiny, color: out ? colors.danger : colors.primaryDark }}>{out ? 'Sold out' : 'In stock'}</Text>
            </View>
          </View>
          <View style={styles.priceRow}>
            <Text style={{ ...font.h2, color: colors.text }}>{formatINR(p.price)}</Text>
            {p.mrp > p.price && <Text style={styles.mrp}>{formatINR(p.mrp)}</Text>}
            <View style={{ flex: 1 }} />
            {!out && <Text style={styles.stockCount}>{p.stock} available</Text>}
          </View>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>About this product</Text>
          <Text style={styles.description}>{p.description}</Text>
          <Text style={[styles.sectionTitle, { marginTop: space.xl }]}>Product details</Text>
          <View style={styles.detailList}>
            <Detail icon="pricetag-outline" label="Category" value={p.category} />
            <Detail icon="scale-outline" label="Unit / pack size" value={unitLabel(p.unit)} />
            <Detail icon="cube-outline" label="Availability" value={out ? 'Currently unavailable' : `${p.stock} in stock`} />
            <Detail icon="leaf-outline" label="Storage" value={p.storage} />
          </View>
          <View style={styles.qualityCard}>
            <View style={styles.qualityIcon}><Ionicons name="leaf" size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...font.bodyB, color: colors.text }}>Picked for everyday freshness</Text>
              <Text style={{ ...font.small, color: colors.sub, marginTop: 3 }}>Please check the item on delivery and store it as recommended.</Text>
            </View>
          </View>
          <Text style={styles.sectionTitle}>Highlights</Text>
          <View style={styles.highlights}>
            {p.highlights.map((highlight) => <View key={highlight} style={styles.highlight}><Ionicons name="checkmark-circle" size={16} color={colors.primary} /><Text style={{ ...font.small, color: colors.text }}>{highlight}</Text></View>)}
          </View>
          <Text style={styles.sku}>Product code: {p.sku}</Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {out ? <Button title="Currently unavailable" disabled onPress={() => undefined} /> : qty === 0
          ? <Button title={`Add to cart · ${formatINR(p.price)}`} icon="cart" onPress={() => setLineQty(p.id, 1)} />
          : <View style={styles.stepper}>
              <Button title="−" variant="secondary" onPress={() => setLineQty(p.id, qty - 1)} />
              <Text style={{ ...font.h3, color: colors.text }}>{qty} in cart</Text>
              <Button title="+" variant="secondary" disabled={qty >= Math.min(20, p.stock)} onPress={() => setLineQty(p.id, qty + 1)} />
            </View>}
      </View>
    </Screen>
  );
}

function Detail({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Ionicons name={icon} size={19} color={colors.primary} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 410, width: '100%', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  imageShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.12)' },
  heroActions: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,31,24,0.42)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  imageMeta: { position: 'absolute', bottom: 22, left: space.lg, right: space.lg },
  imageCategory: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(15,31,24,0.48)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  imageLabel: { color: '#fff', fontSize: 13, fontWeight: '800' },
  imageCaption: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 9, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 5 },
  discount: { backgroundColor: colors.gold, color: '#3A2600', fontWeight: '900', overflow: 'hidden', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  content: { marginTop: -20, paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.lg, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg },
  mrp: { ...font.body, color: colors.muted, textDecorationLine: 'line-through' },
  stockCount: { ...font.tiny, color: colors.sub },
  stockPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  outPill: { backgroundColor: colors.dangerSoft },
  stockDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.xl },
  sectionTitle: { ...font.h3, color: colors.text, marginBottom: space.sm },
  description: { ...font.body, color: colors.sub, lineHeight: 23 },
  detailList: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  detail: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  detailLabel: { ...font.small, color: colors.sub, width: 96 },
  detailValue: { ...font.small, color: colors.text, flex: 1, fontWeight: '600' },
  qualityCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md, marginVertical: space.xl },
  qualityIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  highlights: { gap: space.sm },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sku: { ...font.tiny, color: colors.muted, marginTop: space.xl },
  footer: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg, ...shadow },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
});
