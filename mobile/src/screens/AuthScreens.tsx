import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, afterLogin, errorMessage } from '../state/app';
import { ApiError } from '../core/api';
import { formatPhone, isValidPhone, maskPhone, normalizePhone } from '../core/validators';
import { Button, FadeIn, Header, Logo, Screen, TextField } from '../components/ui';
import { OtpInput } from '../components/OtpInput';
import { popup } from '../components/Popup';
import { colors, font, radius, space } from '../theme/theme';

const useNav = () => useNavigation<any>();

export function WelcomeScreen() {
  const nav = useNav();
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.sequence([Animated.timing(float, { toValue: 1, duration: 2200, useNativeDriver: true }), Animated.timing(float, { toValue: 0, duration: 2200, useNativeDriver: true })])); a.start(); return () => a.stop(); }, [float]);
  const perks = [['🌾', 'Harvested at dawn, at your door in minutes'], ['📈', 'Live market prices — no hidden markups'], ['🪙', 'Earn YGC coins on every order']];
  return (
    <View style={{ flex: 1, backgroundColor: colors.primary }}>
      <View style={[styles.blob, { top: -90, right: -70, width: 260, height: 260, backgroundColor: '#12A56A' }]} />
      <View style={[styles.blob, { bottom: 120, left: -100, width: 240, height: 240, backgroundColor: '#087A4C' }]} />
      <Screen style={{ backgroundColor: 'transparent', justifyContent: 'space-between' }} edges={['top', 'bottom']}>
        <FadeIn style={{ marginTop: space.xl }}><Logo size={40} light tagline /></FadeIn>
        <View>
          <Animated.Text style={{ fontSize: 76, textAlign: 'center', transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }}>🥬</Animated.Text>
          <FadeIn delay={150}><Text style={styles.hero}>Fresh from the farm,{'\n'}fair on your wallet.</Text></FadeIn>
          <View style={{ marginTop: space.xl, gap: space.md }}>
            {perks.map(([e, t], i) => (
              <FadeIn key={t} delay={300 + i * 120} style={styles.perk}><Text style={{ fontSize: 22 }}>{e}</Text><Text style={styles.perkText}>{t}</Text></FadeIn>
            ))}
          </View>
        </View>
        <FadeIn delay={700} style={{ gap: space.md, paddingBottom: space.lg }}>
          <Button title="Create account" variant="gold" onPress={() => nav.navigate('SignUp')} />
          <Button title="I already have an account" variant="ghost" style={{ borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' }} onPress={() => nav.navigate('Login')} />
        </FadeIn>
      </Screen>
    </View>
  );
}

function PhoneEntry({ mode }: { mode: 'login' | 'signup' }) {
  const nav = useNav();
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const [agree, setAgree] = useState(mode === 'login');
  const [loading, setLoading] = useState(false);
  const err = touched && !isValidPhone(phone) ? 'Enter a valid 10-digit mobile number' : null;

  const submit = useCallback(async () => {
    setTouched(true);
    const p = normalizePhone(phone);
    if (!p) return;
    if (!agree) { popup.alert('One more thing', 'Please accept the Terms and Privacy Policy to continue.', 'info'); return; }
    setLoading(true);
    try {
      const r = await api.sendOtp(p, mode);
      nav.navigate('Otp', { phone: p, mode, devOtp: __DEV__ ? r.devOtp : undefined });
    } catch (e) {
      popup.alert(e instanceof ApiError && e.code === 'otp_cooldown' ? 'Please wait' : 'Could not send OTP', errorMessage(e), 'error');
    } finally { setLoading(false); }
  }, [phone, agree, mode, nav]);

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <Header title="" onBack={() => nav.goBack()} />
          <FadeIn><Logo size={30} /></FadeIn>
          <FadeIn delay={100}><Text style={styles.h1}>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</Text></FadeIn>
          <FadeIn delay={180}><Text style={styles.sub}>{mode === 'signup' ? 'Enter your mobile number. We’ll text you a one-time password — no passwords to remember.' : 'Log in with your mobile number. We’ll send you a one-time password.'}</Text></FadeIn>
          <FadeIn delay={260} style={{ marginTop: space.xl }}>
            <TextField
              label="Mobile number" placeholder="98300 12345" value={phone} onChangeText={(t) => setPhone(t.replace(/[^\d+\s]/g, '').slice(0, 14))}
              keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" maxLength={14} error={err} returnKeyType="done" onSubmitEditing={submit}
              left={<View style={styles.cc}><Text style={{ fontSize: 18 }}>🇮🇳</Text><Text style={styles.ccText}>+91</Text></View>}
            />
          </FadeIn>
          {mode === 'signup' && (
            <Pressable onPress={() => setAgree(!agree)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={styles.consent}>
              <View style={[styles.box, agree && { backgroundColor: colors.primary, borderColor: colors.primary }]}>{agree && <Ionicons name="checkmark" size={16} color="#fff" />}</View>
              <Text style={styles.consentText}>
                I agree to the <Text style={styles.link} onPress={() => nav.navigate('Terms')}>Terms of Use</Text> and <Text style={styles.link} onPress={() => nav.navigate('Privacy')}>Privacy Policy</Text>
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => nav.replace(mode === 'signup' ? 'Login' : 'SignUp')} style={{ alignItems: 'center', padding: space.lg }} accessibilityRole="link">
            <Text style={{ ...font.body, color: colors.sub }}>{mode === 'signup' ? 'Already have an account? ' : 'New to YoGreen? '}<Text style={styles.link}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Text></Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate('Help')} style={{ alignItems: 'center', paddingBottom: space.md }}><Text style={{ ...font.small, color: colors.muted }}>Need help? <Text style={styles.link}>Contact support</Text></Text></Pressable>
        </ScrollView>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.bg }}>
          <Button title="Send OTP" loading={loading} onPress={submit} style={{ minHeight: 56 }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
export const LoginScreen = () => <PhoneEntry mode="login" />;
export const SignUpScreen = () => <PhoneEntry mode="signup" />;

export function OtpScreen({ route }: { route: { params: { phone: string; mode: 'login' | 'signup'; devOtp?: string } } }) {
  const { phone, devOtp } = route.params;
  const nav = useNav();
  const [otp, setOtp] = useState('');
  const [state, setState] = useState<{ loading: boolean; error: string | null; k: number }>({ loading: false, error: null, k: 0 });
  const [left, setLeft] = useState(30);
  const [resending, setResending] = useState(false);
  const submitting = useRef(false);

  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((l) => l - 1), 1000); return () => clearTimeout(t); }, [left]);
  useEffect(() => { if (__DEV__ && devOtp && /^\d{6}$/.test(devOtp)) { const t = setTimeout(() => setOtp(devOtp), 700); return () => clearTimeout(t); } }, [devOtp]);

  const verify = useCallback(async (code: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const auth = await api.verifyOtp(phone, code, undefined, route.params.mode);
      if ('pendingApproval' in auth) {
        popup.alert('Application submitted', auth.message || 'Your rider application is waiting for admin approval.', 'info');
        nav.popToTop();
        return;
      }
      await afterLogin(auth); // root navigator swaps to Setup or Main automatically
    } catch (e) {
      setOtp('');
      setState((s) => ({ loading: false, error: errorMessage(e), k: s.k + 1 }));
      if (e instanceof ApiError && (e.code === 'wrong_app' || e.code === 'otp_attempts')) popup.alert(e.code === 'wrong_app' ? 'Different app' : 'Too many attempts', e.message, 'error');
    } finally { submitting.current = false; }
  }, [phone, route.params.mode]);

  useEffect(() => { if (otp.length === 6) void verify(otp); }, [otp, verify]);

  const resend = async () => {
    setResending(true);
    try { const r = await api.sendOtp(phone, route.params.mode); setLeft(r.resendIn || 30); setOtp(''); setState((s) => ({ ...s, error: null })); popup.toast('A new OTP has been sent', 'success'); if (__DEV__ && r.devOtp) setTimeout(() => setOtp(r.devOtp!), 600); }
    catch (e) { popup.alert('Could not resend', errorMessage(e), 'error'); if (e instanceof ApiError && e.retryAfter) setLeft(e.retryAfter); }
    finally { setResending(false); }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Header title="" onBack={() => nav.goBack()} />
        <FadeIn><View style={styles.shield}><Ionicons name="shield-checkmark" size={34} color={colors.primary} /></View></FadeIn>
        <FadeIn delay={100}><Text style={styles.h1}>Verify your number</Text></FadeIn>
        <FadeIn delay={160}><Text style={styles.sub}>Enter the 6-digit code sent to{'\n'}<Text style={{ fontWeight: '800', color: colors.text }}>{maskPhone(`+91${phone.replace(/^\+91/, '')}`)}</Text>{'  '}<Text style={styles.link} onPress={() => nav.goBack()}>Change</Text></Text></FadeIn>
        <FadeIn delay={240} style={{ marginTop: space.xl }}>
          <OtpInput value={otp} onChange={(v) => { setOtp(v); if (state.error) setState((s) => ({ ...s, error: null })); }} error={!!state.error} errorKey={state.k} />
          {!!state.error && <Text style={{ ...font.small, color: colors.danger, marginTop: space.md, textAlign: 'center' }} accessibilityLiveRegion="polite">{state.error}</Text>}
          {__DEV__ && !!devOtp && <Text style={{ ...font.small, color: colors.goldDark, marginTop: space.md, textAlign: 'center' }}>Dev mode: OTP auto-filled</Text>}
        </FadeIn>
        <View style={{ alignItems: 'center', marginTop: space.xl }}>
          {left > 0 ? <Text style={{ ...font.body, color: colors.sub }}>Resend OTP in <Text style={{ fontWeight: '800', color: colors.text }}>0:{String(left).padStart(2, '0')}</Text></Text>
            : <Pressable onPress={resend} disabled={resending} accessibilityRole="button" hitSlop={12}><Text style={{ ...font.bodyB, color: colors.primary }}>{resending ? 'Sending…' : 'Resend OTP'}</Text></Pressable>}
        </View>
        <View style={{ flex: 1 }} />
        <Button title="Verify & continue" loading={state.loading} disabled={otp.length !== 6} onPress={() => verify(otp)} />
        <Text style={{ ...font.small, color: colors.muted, textAlign: 'center', padding: space.lg }}>Never share your OTP. YoGreen will never call or message asking for it.</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute', borderRadius: 999 },
  hero: { fontSize: 32, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: -0.8, lineHeight: 38, marginTop: space.md },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg, padding: space.md },
  perkText: { ...font.bodyB, color: '#fff', flex: 1 },
  h1: { ...font.h1, color: colors.text, marginTop: space.xl },
  sub: { ...font.body, color: colors.sub, marginTop: space.sm, lineHeight: 22 },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10, borderRightWidth: 1, borderColor: colors.border },
  ccText: { ...font.bodyB, fontSize: 16, color: colors.text },
  consent: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.sm },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  consentText: { ...font.small, flex: 1, color: colors.sub, lineHeight: 20 },
  link: { color: colors.primary, fontWeight: '700' },
  shield: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
