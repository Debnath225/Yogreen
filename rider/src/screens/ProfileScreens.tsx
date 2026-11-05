import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, errorMessage, session, signOut, summary } from '../state/app';
import { useStore } from '../state/useStore';
import { maskPhone, validateName } from '../core/validators';
import { Button, Card, FadeIn, Header, Logo, PressableScale, Row, Screen, TextField } from '../components/ui';
import { OnlineToggle } from '../components/RiderUI';
import { popup } from '../components/Popup';
import { setOnline } from '../state/app';
import { APP_VERSION, SUPPORT } from '../config';
import { COMPANY, FAQ, PRIVACY } from '../content/legal';
import { colors, font, g, space } from '../theme/theme';

const useNav = () => useNavigation<any>();
const sec = { ...font.h3, color: colors.text, marginTop: space.xl, marginBottom: space.md } as const;

export function ProfileScreen() {
  const nav = useNav();
  const user = useStore(session, (s) => s.user);
  const online = useStore(summary, (s) => s.online);
  const logout = async () => { if (await popup.confirm({ title: 'Log out?', message: online ? 'You’ll be taken offline and stop receiving orders.' : 'You’ll need an OTP to log back in.', confirmLabel: 'Log out' })) await signOut(); };
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Header title="Profile" />
        <FadeIn>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{(user?.name || 'R').trim()[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}><Text style={{ ...font.h3, color: colors.text }} numberOfLines={1}>{user?.name || 'Rider'}</Text><Text style={{ ...font.small, color: colors.sub }}>{user ? maskPhone(user.phone) : ''}</Text></View>
            <OnlineToggle online={online} onChange={setOnline} />
          </Card>
        </FadeIn>
        <Text style={sec}>Account</Text>
        <Card style={{ paddingVertical: 0 }}><Row icon="person-outline" label="Edit name" onPress={() => nav.navigate('EditName')} last /></Card>
        <Text style={sec}>Support & legal</Text>
        <Card style={{ paddingVertical: 0 }}>
          <Row icon="help-buoy-outline" label="Help & support" onPress={() => nav.navigate('Help')} />
          <Row icon="shield-checkmark-outline" label="Privacy & data use" onPress={() => nav.navigate('Privacy')} />
          <Row icon="information-circle-outline" label="About" value={`Version ${APP_VERSION}`} onPress={() => nav.navigate('About')} last />
        </Card>
        <Card style={{ paddingVertical: 0, marginTop: space.xl }}><Row icon="log-out-outline" label="Log out" onPress={logout} last /></Card>
      </ScrollView>
    </Screen>
  );
}

export function EditNameScreen() {
  const nav = useNav();
  const user = useStore(session, (s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setTouched(true);
    if (validateName(name)) return;
    setSaving(true);
    try { const r = await api.rename(name.trim()); session.set({ user: r.rider }); popup.toast('Name updated', 'success'); nav.goBack(); }
    catch (e) { popup.alert('Could not save', errorMessage(e), 'error'); } finally { setSaving(false); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Edit name" onBack={() => nav.goBack()} />
        <TextField label="Full name" value={name} onChangeText={setName} error={touched ? validateName(name) : null} autoCapitalize="words" maxLength={60} hint="Customers see your first name when you’re assigned." />
        <View style={{ flex: 1 }} />
        <Button title="Save" loading={saving} onPress={save} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function PrivacyScreen() {
  const nav = useNav();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Privacy & data use" onBack={() => nav.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={{ ...font.small, color: colors.muted }}>{COMPANY.name} · Last updated {COMPANY.updated}</Text>
        {PRIVACY.map((p, i) => <FadeIn key={p.h} delay={Math.min(i, 5) * 50} from={8}><Text style={{ ...font.h3, color: colors.text, marginTop: space.lg }} accessibilityRole="header">{i + 1}. {p.h}</Text><Text style={{ ...font.body, color: colors.sub, lineHeight: 23, marginTop: 6 }}>{p.p}</Text></FadeIn>)}
      </ScrollView>
    </Screen>
  );
}

export function HelpScreen() {
  const nav = useNav();
  const [open, setOpen] = useState<number | null>(0);
  const go = useCallback((url: string) => Linking.openURL(url).catch(() => popup.alert('Can’t open', 'No app available for this action.', 'error')), []);
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Rider support" onBack={() => nav.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <FadeIn style={{ flexDirection: 'row', gap: space.md }}>
          <PressableScale style={[g.card, { flex: 1, padding: space.lg, alignItems: 'center', gap: 6 }]} onPress={() => go(`tel:${SUPPORT.phone}`)} accessibilityLabel="Call rider support"><Ionicons name="call" size={26} color={colors.primary} /><Text style={{ ...font.bodyB, color: colors.text }}>Call support</Text></PressableScale>
          <PressableScale style={[g.card, { flex: 1, padding: space.lg, alignItems: 'center', gap: 6 }]} onPress={() => go(`mailto:${SUPPORT.email}`)} accessibilityLabel="Email rider support"><Ionicons name="mail" size={26} color={colors.primary} /><Text style={{ ...font.bodyB, color: colors.text }}>Email</Text></PressableScale>
        </FadeIn>
        <Text style={{ ...font.small, color: colors.muted, textAlign: 'center', marginTop: space.sm }}>Support hours: {SUPPORT.hours}</Text>
        <Text style={sec}>Rider FAQ</Text>
        {FAQ.map((f, i) => (
          <PressableScale key={f.q} haptic={false} onPress={() => setOpen(open === i ? null : i)} accessibilityLabel={f.q} style={[g.card, { padding: space.lg, marginBottom: space.sm }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}><Text style={{ ...font.bodyB, color: colors.text, flex: 1 }}>{f.q}</Text><Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></View>
            {open === i && <FadeIn from={4}><Text style={{ ...font.body, color: colors.sub, marginTop: space.sm, lineHeight: 22 }}>{f.a}</Text></FadeIn>}
          </PressableScale>
        ))}
      </ScrollView>
    </Screen>
  );
}

export function AboutScreen() {
  const nav = useNav();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="About" onBack={() => nav.goBack()} />
      <FadeIn style={{ alignItems: 'center', marginTop: space.xxl, gap: space.md }}>
        <Logo size={40} tagline />
        <Text style={{ ...font.small, color: colors.muted, marginTop: space.xl }}>Version {APP_VERSION}</Text>
        <Text style={{ ...font.small, color: colors.muted }}>© {new Date().getFullYear()} {COMPANY.name}</Text>
      </FadeIn>
    </Screen>
  );
}
