import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, afterLogin, errorMessage } from '../state/app';
import { ApiError } from '../core/baseApi';
import { isValidPhone, maskPhone, normalizePhone } from '../core/validators';
import { Button, FadeIn, Header, Logo, Screen, TextField } from '../components/ui';
import { OtpInput } from '../components/OtpInput';
import { popup } from '../components/Popup';
import { colors, font, space } from '../theme/theme';

const useNav = () => useNavigation<any>();

export function LoginScreen() {
  const nav = useNav();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = touched && !isValidPhone(phone) ? 'Enter a valid 10-digit mobile number' : null;
  const submit = useCallback(async () => {
    setTouched(true);
    const p = normalizePhone(phone);
    if (!p) return;
    setLoading(true);
    try { const r = await api.sendOtp(p, 'login'); nav.navigate('Otp', { phone: p, mode: 'login', devOtp: __DEV__ ? r.devOtp : undefined }); }
    catch (e) { popup.alert('Could not send OTP', errorMessage(e), 'error'); }
    finally { setLoading(false); }
  }, [phone, nav]);
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={{ height: space.xxl }} />
          <FadeIn><Logo size={34} tagline /></FadeIn>
          <FadeIn delay={100}><Text style={s.h1}>Rider login</Text></FadeIn>
          <FadeIn delay={160}><Text style={s.sub}>Enter your registered mobile number to receive a one-time password.</Text></FadeIn>
          <FadeIn delay={240} style={{ marginTop: space.xl }}>
            <TextField label="Mobile number" placeholder="98300 12345" value={phone} onChangeText={(t) => setPhone(t.replace(/[^\d+\s]/g, '').slice(0, 14))} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={14} error={err} returnKeyType="done" onSubmitEditing={submit}
              left={<View style={s.cc}><Text style={{ fontSize: 18 }}>🇮🇳</Text><Text style={s.ccText}>+91</Text></View>} />
          </FadeIn>
          <Pressable onPress={() => nav.navigate('SignUp')} style={{ alignItems: 'center', padding: space.lg }} accessibilityRole="link">
            <Text style={{ ...font.body, color: colors.sub }}>New rider? <Text style={s.link}>Apply to join</Text></Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate('Help')} style={{ alignItems: 'center', padding: space.lg }}><Text style={{ ...font.small, color: colors.muted }}>Need help? <Text style={s.link}>Contact rider support</Text></Text></Pressable>
        </ScrollView>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.bg }}>
          <Button title="Send OTP" loading={loading} onPress={submit} style={{ minHeight: 56 }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function OtpScreen({ route }: { route: { params: { phone: string; mode: 'login' | 'signup'; application?: import('../core/types').RiderApplication; devOtp?: string } } }) {
  const { phone, mode, application, devOtp: initialDevOtp } = route.params;
  const nav = useNav();
  const [devOtp, setDevOtp] = useState(initialDevOtp);
  const [otp, setOtp] = useState('');
  const [st, setSt] = useState<{ loading: boolean; error: string | null; k: number; fails: number }>({ loading: false, error: null, k: 0, fails: 0 });
  const [left, setLeft] = useState(30);
  const busy = useRef(false);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((l) => l - 1), 1000); return () => clearTimeout(t); }, [left]);
  useEffect(() => {
    if (!__DEV__ || !devOtp || !/^\d{6}$/.test(devOtp)) return;
    const t = setTimeout(() => setOtp(devOtp), 250);
    return () => clearTimeout(t);
  }, [devOtp]);

  const verify = useCallback(async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setSt((x) => ({ ...x, loading: true, error: null }));
    try {
      const result = await api.verifyOtp(phone, code, undefined, mode, application);
      if ('pendingApproval' in result) {
        popup.alert('Application submitted', result.message, 'info');
        nav.popToTop();
        return;
      }
      await afterLogin(result.user);
    }
    catch (e) {
      setOtp('');
      setSt((x) => ({ loading: false, error: errorMessage(e), k: x.k + 1, fails: x.fails + 1 }));
      if (e instanceof ApiError && e.code === 'wrong_app') popup.alert('Not a rider account', 'This number is registered for a different YoGreen app.', 'error');
      if (e instanceof ApiError && (e.code === 'rider_pending_approval' || e.code === 'rider_application_rejected')) {
        popup.alert(e.code === 'rider_pending_approval' ? 'Approval pending' : 'Application not approved', e.message, 'info');
        nav.popToTop();
      }
    } finally { busy.current = false; }
  }, [phone, mode, application, nav]);
  useEffect(() => { if (otp.length === 6) void verify(otp); }, [otp, verify]);

  const resend = async () => {
    try { const r = await api.sendOtp(phone, mode); setLeft(r.resendIn || 30); setOtp(''); setDevOtp(__DEV__ ? r.devOtp : undefined); popup.toast('OTP sent again', 'success'); }
    catch (e) { popup.alert('Could not resend', errorMessage(e), 'error'); if (e instanceof ApiError && e.retryAfter) setLeft(e.retryAfter); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="" onBack={() => nav.goBack()} />
        <FadeIn><View style={s.shield}><Ionicons name="shield-checkmark" size={34} color={colors.primary} /></View></FadeIn>
        <FadeIn delay={100}><Text style={s.h1}>Enter your OTP</Text></FadeIn>
        <FadeIn delay={160}><Text style={s.sub}>Code sent to <Text style={{ fontWeight: '800', color: colors.text }}>{maskPhone(phone.startsWith('+') ? phone : `+91${phone}`)}</Text></Text></FadeIn>
        <FadeIn delay={240} style={{ marginTop: space.xl }}>
          <OtpInput value={otp} onChange={(v) => { setOtp(v); if (st.error) setSt((x) => ({ ...x, error: null })); }} error={!!st.error} errorKey={st.k} />
          {!!st.error && <Text style={{ ...font.small, color: colors.danger, marginTop: space.md, textAlign: 'center' }} accessibilityLiveRegion="polite">{st.error}</Text>}
          {st.fails >= 2 && <Text style={{ ...font.small, color: colors.sub, marginTop: space.md, textAlign: 'center' }}>Not receiving the OTP? Your number may not be registered as a rider. Contact your hub.</Text>}
          {__DEV__ && !!devOtp && <Text style={{ ...font.small, color: colors.goldDark, marginTop: space.md, textAlign: 'center' }}>Dev mode: OTP auto-filled</Text>}
          {__DEV__ && !devOtp && <Text style={{ ...font.small, color: colors.sub, marginTop: space.md, textAlign: 'center' }}>No development OTP returned. Check that this phone belongs to an active rider and backend OTP exposure is enabled.</Text>}
        </FadeIn>
        <View style={{ alignItems: 'center', marginTop: space.xl }}>
          {left > 0 ? <Text style={{ ...font.body, color: colors.sub }}>Resend in <Text style={{ fontWeight: '800', color: colors.text }}>0:{String(left).padStart(2, '0')}</Text></Text> : <Pressable onPress={resend} hitSlop={12} accessibilityRole="button"><Text style={{ ...font.bodyB, color: colors.primary }}>Resend OTP</Text></Pressable>}
        </View>
        <View style={{ flex: 1 }} />
        <Button title="Verify & log in" loading={st.loading} disabled={otp.length !== 6} onPress={() => verify(otp)} />
        <Text style={{ ...font.small, color: colors.muted, textAlign: 'center', padding: space.lg }}>Never share your OTP with anyone.</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const s = StyleSheet.create({
  h1: { ...font.h1, color: colors.text, marginTop: space.xl },
  sub: { ...font.body, color: colors.sub, marginTop: space.sm, lineHeight: 22 },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10, borderRightWidth: 1, borderColor: colors.border },
  ccText: { ...font.bodyB, fontSize: 16, color: colors.text },
  link: { color: colors.primary, fontWeight: '700' },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.infoSoft, borderRadius: 12, padding: space.md },
  shield: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
