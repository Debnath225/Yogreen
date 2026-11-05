import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, g, radius, shadow, space } from '../theme/theme';

type IconName = keyof typeof Ionicons.glyphMap;
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch { /* optional */ }
export const tap = () => {
  if (!Haptics) return;
  void (async () => {
    try { await Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* haptics are best-effort */ }
  })();
};

// ------------------------------------------------------------------ brand
/** Text logo: "yo" in ink + "green" in brand green, with a leaf accent. */
export function Logo({ size = 28, light = false, tagline = false }: { size?: number; light?: boolean; tagline?: boolean }) {
  const pill = { backgroundColor: light ? 'rgba(255,255,255,0.2)' : colors.primarySoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8, marginBottom: size * 0.18 };
  const ink = light ? colors.white : colors.text;
  const brand = light ? '#B9F3D5' : colors.primary;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="YoGreen Rider">
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text style={{ fontSize: size, fontWeight: '900', letterSpacing: -1, color: ink }}>yo</Text>
        <Text style={{ fontSize: size, fontWeight: '900', letterSpacing: -1, color: brand }}>green</Text>
        <View style={{ width: size * 0.32, height: size * 0.32, marginLeft: 2, marginBottom: size * 0.62, backgroundColor: brand, borderTopLeftRadius: size * 0.32, borderBottomRightRadius: size * 0.32, transform: [{ rotate: '-8deg' }] }} />
        <View style={pill}><Text style={{ fontSize: size * 0.34, fontWeight: '800', color: light ? '#fff' : colors.primaryDark }}>RIDER</Text></View>
      </View>
      {tagline && <Text style={{ fontSize: size * 0.4, color: light ? '#D7F7E6' : colors.sub, fontWeight: '600', marginTop: 2 }}>deliver fresh • earn every trip</Text>}
    </View>
  );
}

// -------------------------------------------------------------- animation
export function FadeIn({ children, delay = 0, from = 14, style }: { children: React.ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>{children}</Animated.View>;
}

export function PressableScale({ children, onPress, style, disabled, haptic = true, ...rest }: { children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; haptic?: boolean; accessibilityLabel?: string; accessibilityRole?: any; accessibilityState?: any; hitSlop?: any }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(s, { toValue: v, friction: 6, tension: 220, useNativeDriver: true }).start();
  return (
    <Pressable disabled={disabled} onPressIn={() => to(0.96)} onPressOut={() => to(1)} onPress={() => { if (haptic) tap(); onPress?.(); }} accessibilityRole="button" {...rest}>
      <Animated.View style={[style, { transform: [{ scale: s }] }, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Skeleton({ h = 16, w = '100%', r = 8, style }: { h?: number; w?: number | string; r?: number; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(0.4)).current;
  useEffect(() => { const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true })])); a.start(); return () => a.stop(); }, [o]);
  return <Animated.View style={[{ height: h, width: w as any, borderRadius: r, backgroundColor: '#DDE6E0', opacity: o }, style]} />;
}

/** Number that counts up/down smoothly (used for the YGC balance). */
export function CountUp({ value, style, prefix = '' }: { value: number; style?: any; prefix?: string }) {
  const a = useRef(new Animated.Value(value)).current;
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const id = a.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(a, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => a.removeListener(id);
  }, [value, a]);
  return <Text style={style}>{prefix}{shown}</Text>;
}

// ------------------------------------------------------------- primitives
export function Screen({ children, style, pad = true, edges = ['top'] as ('top' | 'bottom')[] }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean; edges?: ('top' | 'bottom')[] }) {
  const i = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: colors.bg, paddingTop: edges.includes('top') ? i.top : 0, paddingBottom: edges.includes('bottom') ? i.bottom : 0 }, pad && { paddingHorizontal: space.lg }, style]}>{children}</View>;
}

export function Button({ title, onPress, loading, disabled, variant = 'primary', icon, style }: { title: string; onPress?: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'gold' ? colors.gold : variant === 'secondary' ? colors.primarySoft : 'transparent';
  const fg = variant === 'secondary' ? colors.primaryDark : variant === 'ghost' ? colors.primary : variant === 'gold' ? '#3A2600' : colors.white;
  const off = disabled || loading;
  return (
    <PressableScale onPress={off ? undefined : onPress} disabled={off} accessibilityLabel={title} style={[{ minHeight: 52, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: space.lg }, variant === 'primary' && shadow, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>{icon && <Ionicons name={icon} size={20} color={fg} />}<Text style={{ ...font.bodyB, fontSize: 16, color: fg }}>{title}</Text></>}
    </PressableScale>
  );
}

export function TextField({ label, error, left, hint, style, ...p }: TextInputProps & { label: string; error?: string | null; left?: React.ReactNode; hint?: string }) {
  const [focus, setFocus] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (error) Animated.sequence([6, -6, 4, -4, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 50, useNativeDriver: true }))).start(); }, [error, shake]);
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      <Text style={{ ...font.small, fontWeight: '600', color: colors.sub, marginBottom: 6 }}>{label}</Text>
      <Animated.View style={[styles.field, focus && { borderColor: colors.primary, backgroundColor: colors.white }, !!error && { borderColor: colors.danger }, { transform: [{ translateX: shake }] }]}>
        {left}
        <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...p} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }} style={styles.input} />
      </Animated.View>
      {!!error ? <Text style={{ ...font.small, color: colors.danger, marginTop: 6 }} accessibilityLiveRegion="polite">{error}</Text> : !!hint ? <Text style={{ ...font.small, color: colors.muted, marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
      {icon && <Ionicons name={icon} size={16} color={active ? colors.white : colors.sub} />}
      <Text style={{ ...font.bodyB, fontSize: 14, color: active ? colors.white : colors.text }}>{label}</Text>
    </PressableScale>
  );
}

export function IconButton({ name, onPress, badge, label, color = colors.text }: { name: IconName; onPress: () => void; badge?: number; label: string; color?: string }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <Ionicons name={name} size={22} color={color} />
      {!!badge && badge > 0 && <View style={styles.badge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text></View>}
    </PressableScale>
  );
}

export function CoinPill({ amount, big }: { amount: number | string; big?: boolean }) {
  return (
    <View style={[styles.coin, big && { paddingHorizontal: 14, paddingVertical: 8 }]} accessibilityLabel={`${amount} YGC coins`}>
      <View style={[styles.coinDot, big && { width: 22, height: 22, borderRadius: 11 }]}><Text style={{ fontSize: big ? 12 : 10, fontWeight: '900', color: '#3A2600' }}>Y</Text></View>
      <Text style={{ fontWeight: '800', color: colors.goldDark, fontSize: big ? 17 : 13 }}>{amount}</Text>
    </View>
  );
}

export function EmptyState({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <FadeIn style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <Text style={{ fontSize: 56 }}>{emoji}</Text>
      <Text style={{ ...font.h3, color: colors.text, textAlign: 'center' }}>{title}</Text>
      {!!text && <Text style={{ ...font.body, color: colors.sub, textAlign: 'center' }}>{text}</Text>}
      {action && <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{action}</View>}
    </FadeIn>
  );
}

/** Header for stack screens (back arrow + title). */
export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.md }}>
      {onBack ? <IconButton name="chevron-back" onPress={onBack} label="Go back" /> : <View style={{ width: 0 }} />}
      <Text style={{ ...font.h2, flex: 1, color: colors.text }} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

export function Row({ icon, label, value, onPress, danger, right, last }: { icon: IconName; label: string; value?: string; onPress?: () => void; danger?: boolean; right?: React.ReactNode; last?: boolean }) {
  return (
    <PressableScale onPress={onPress} haptic={!!onPress} accessibilityLabel={label} style={[styles.rowItem, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}><Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...font.bodyB, color: danger ? colors.danger : colors.text }}>{label}</Text>
        {!!value && <Text style={{ ...font.small, color: colors.sub, marginTop: 2 }}>{value}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </PressableScale>
  );
}

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[g.card, { padding: space.lg }, style]}>{children}</View>;

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#F1F5F3', paddingHorizontal: space.lg, gap: 8 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.bg },
  coin: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.goldSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  coinDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
