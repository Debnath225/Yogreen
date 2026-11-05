import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, shadow, space } from '../theme/theme';

export type PopupType = 'success' | 'error' | 'confirm' | 'info' | 'coins';
export interface PopupAction { label: string; style?: 'primary' | 'secondary' | 'danger'; onPress?: () => void | Promise<void> }
export interface PopupOptions { type?: PopupType; title: string; message?: string; actions?: PopupAction[]; dismissable?: boolean }
type ToastType = 'success' | 'error' | 'info';

let showImpl: ((o: PopupOptions) => void) | null = null;
let toastImpl: ((m: string, t: ToastType) => void) | null = null;

/** Imperative API usable from anywhere (screens, stores, realtime handlers). */
export const popup = {
  show: (o: PopupOptions) => showImpl?.(o),
  toast: (message: string, type: ToastType = 'info') => toastImpl?.(message, type),
  alert: (title: string, message?: string, type: PopupType = 'info') => showImpl?.({ type, title, message, actions: [{ label: 'Got it', style: 'primary' }] }),
  confirm: (o: { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean }) =>
    new Promise<boolean>((resolve) => {
      showImpl?.({
        type: 'confirm', title: o.title, message: o.message, dismissable: true,
        actions: [
          { label: o.cancelLabel ?? 'Cancel', style: 'secondary', onPress: () => resolve(false) },
          { label: o.confirmLabel ?? 'Confirm', style: o.destructive ? 'danger' : 'primary', onPress: () => resolve(true) },
        ],
      });
    }),
};

const ICON: Record<PopupType, { name: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  success: { name: 'checkmark-circle', fg: colors.primary, bg: colors.primarySoft },
  error: { name: 'alert-circle', fg: colors.danger, bg: colors.dangerSoft },
  confirm: { name: 'help-circle', fg: colors.info, bg: colors.infoSoft },
  info: { name: 'information-circle', fg: colors.info, bg: colors.infoSoft },
  coins: { name: 'sparkles', fg: colors.goldDark, bg: colors.goldSoft },
};

export function PopupProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<PopupOptions | null>(null);
  const [visible, setVisible] = useState(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);

  const open = useCallback((o: PopupOptions) => {
    setOpts(o); setVisible(true); busy.current = false;
    backdrop.setValue(0); card.setValue(0); bounce.setValue(0);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(card, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
    ]).start(() => Animated.spring(bounce, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }).start());
  }, [backdrop, card, bounce]);

  const close = useCallback((after?: () => void | Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(card, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => { setVisible(false); setOpts(null); void after?.(); });
  }, [backdrop, card]);

  useEffect(() => { showImpl = open; return () => { showImpl = null; }; }, [open]);

  const icon = ICON[opts?.type ?? 'info'];
  const actions = opts?.actions?.length ? opts.actions : [{ label: 'OK', style: 'primary' as const }];
  const dismissable = opts?.dismissable ?? actions.length > 1;
  const cancelAction = () => { const a = opts?.actions?.find((x) => x.style === 'secondary'); close(a?.onPress); };

  return (
    <>
      {children}
      <ToastHost />
      <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={() => (dismissable ? cancelAction() : undefined)}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => (dismissable ? cancelAction() : undefined)} accessibilityLabel="Dismiss" />
        </Animated.View>
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View accessibilityViewIsModal style={[styles.card, { opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
            <Animated.View style={[styles.iconWrap, { backgroundColor: icon.bg, transform: [{ scale: bounce.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
              <Ionicons name={icon.name} size={34} color={icon.fg} />
            </Animated.View>
            <Text style={styles.title} accessibilityRole="header">{opts?.title}</Text>
            {!!opts?.message && <Text style={styles.msg}>{opts.message}</Text>}
            <View style={[styles.actions, actions.length > 2 && { flexDirection: 'column' }]}>
              {actions.map((a, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  onPress={() => close(a.onPress)}
                  style={({ pressed }) => [styles.btn, a.style === 'secondary' ? styles.btnSecondary : a.style === 'danger' ? styles.btnDanger : styles.btnPrimary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                >
                  <Text style={[styles.btnText, a.style === 'secondary' && { color: colors.text }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function ToastHost() {
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<{ m: string; type: ToastType; k: number } | null>(null);
  const y = useRef(new Animated.Value(-120)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    toastImpl = (m, type) => {
      if (timer.current) clearTimeout(timer.current);
      setT({ m, type, k: Date.now() });
      y.setValue(-120);
      Animated.spring(y, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }).start();
      timer.current = setTimeout(() => Animated.timing(y, { toValue: -120, duration: 200, useNativeDriver: true }).start(() => setT(null)), 3200);
    };
    return () => { toastImpl = null; if (timer.current) clearTimeout(timer.current); };
  }, [y]);
  if (!t) return null;
  const c = t.type === 'success' ? colors.primary : t.type === 'error' ? colors.danger : colors.text;
  const icon = t.type === 'success' ? 'checkmark-circle' : t.type === 'error' ? 'alert-circle' : 'notifications';
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { top: insets.top + 8, transform: [{ translateY: y }] }]}>
      <Ionicons name={icon as any} size={20} color={c} />
      <Text style={styles.toastText} numberOfLines={2}>{t.m}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: radius.xl, padding: space.xl, alignItems: 'center', ...shadow },
  iconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  title: { ...font.h3, fontSize: 19, color: colors.text, textAlign: 'center' },
  msg: { ...font.body, color: colors.sub, textAlign: 'center', marginTop: space.sm, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.xl, alignSelf: 'stretch' },
  btn: { flex: 1, minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  btnPrimary: { backgroundColor: colors.primary },
  btnDanger: { backgroundColor: colors.danger },
  btnSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { ...font.bodyB, color: colors.white },
  toast: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: space.lg, ...shadow, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  toastText: { ...font.bodyB, flex: 1, color: colors.text },
});
