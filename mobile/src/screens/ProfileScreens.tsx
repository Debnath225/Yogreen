import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, deleteAccount, errorMessage, inbox, markInboxRead, refreshInbox, refreshMe, session, signOut } from '../state/app';
import { useStore } from '../state/useStore';
import { enablePush } from '../services/push';
import { validateEmail, validateName, maskPhone } from '../core/validators';
import { timeAgo } from '../core/money';
import { AddressForm } from '../components/AddressForm';
import { Button, Card, CoinPill, EmptyState, FadeIn, Header, IconButton, Logo, PressableScale, Row, Screen, TextField, Toggle } from '../components/ui';
import { popup } from '../components/Popup';
import { APP_VERSION, SUPPORT } from '../config';
import { COMPANY, FAQ, PRIVACY, TERMS } from '../content/legal';
import { colors, font, g, radius, space } from '../theme/theme';

const useNav = () => useNavigation<any>();
const Back = () => { const n = useNav(); return <Header title="" onBack={() => n.goBack()} />; };

export function ProfileScreen() {
  const nav = useNav();
  const user = useStore(session, (s) => s.user);
  const wallet = useStore(session, (s) => s.wallet);
  const addrCount = useStore(session, (s) => s.addresses.length);
  const [push, setPush] = useState(user?.prefs.pushEnabled ?? true);
  useEffect(() => setPush(user?.prefs.pushEnabled ?? true), [user?.prefs.pushEnabled]);

  const togglePush = async (v: boolean) => {
    setPush(v);
    try {
      if (v) { const ok = await enablePush(api); if (!ok) popup.alert('Notifications are off', 'Allow notifications for YoGreen in your phone settings to get order updates.', 'info'); }
      await api.patchMe({ prefs: { pushEnabled: v } }); await refreshMe();
    } catch (e) { setPush(!v); popup.alert('Could not update', errorMessage(e), 'error'); }
  };
  const logout = async () => { if (await popup.confirm({ title: 'Log out?', message: 'You’ll need your mobile number and an OTP to log back in.', confirmLabel: 'Log out' })) await signOut(); };
  const del = async () => {
    if (!(await popup.confirm({ title: 'Delete your account?', message: 'This permanently removes your personal details and signs you out everywhere. Unused YGC coins will be lost. This can’t be undone.', confirmLabel: 'Delete forever', destructive: true }))) return;
    try { await deleteAccount(); } catch (e) { popup.alert('Could not delete', errorMessage(e), 'error'); }
  };
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Header title="Profile" />
        <FadeIn>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }}>{(user?.name || 'Y').trim()[0]?.toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...font.h3, color: colors.text }} numberOfLines={1}>{user?.name || 'YoGreen member'}</Text>
              <Text style={{ ...font.small, color: colors.sub }}>{user ? maskPhone(user.phone) : ''}</Text>
              {!!user?.email && <Text style={{ ...font.small, color: colors.sub }} numberOfLines={1}>{user.email}</Text>}
            </View>
            <PressableScale onPress={() => nav.navigate('Rewards')} accessibilityLabel="Open rewards"><CoinPill amount={wallet?.balance ?? 0} big /></PressableScale>
          </Card>
        </FadeIn>
        <Text style={sec}>Account</Text>
        <Card style={{ paddingVertical: 0 }}>
          <Row icon="person-outline" label="Edit profile" onPress={() => nav.navigate('EditProfile')} />
          <Row icon="location-outline" label="Saved addresses" value={`${addrCount} saved`} onPress={() => nav.navigate('Addresses')} />
          <Row icon="notifications-outline" label="Push notifications" value="Order updates & offers" right={<Toggle value={push} onValueChange={togglePush} accessibilityLabel="Push notifications" />} last />
        </Card>
        <Text style={sec}>Support & legal</Text>
        <Card style={{ paddingVertical: 0 }}>
          <Row icon="help-buoy-outline" label="Help & support" onPress={() => nav.navigate('Help')} />
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => nav.navigate('Privacy')} />
          <Row icon="document-text-outline" label="Terms of use" onPress={() => nav.navigate('Terms')} />
          <Row icon="information-circle-outline" label="About YoGreen" value={`Version ${APP_VERSION}`} onPress={() => nav.navigate('About')} last />
        </Card>
        <Card style={{ paddingVertical: 0, marginTop: space.xl }}>
          <Row icon="log-out-outline" label="Log out" onPress={logout} />
          <Row icon="trash-outline" label="Delete account" danger onPress={del} last />
        </Card>
      </ScrollView>
    </Screen>
  );
}
const sec = { ...font.h3, color: colors.text, marginTop: space.xl, marginBottom: space.md } as const;

export function EditProfileScreen() {
  const nav = useNav();
  const user = useStore(session, (s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setTouched(true);
    if (validateName(name) || validateEmail(email)) return;
    setSaving(true);
    try { await api.patchMe({ name: name.trim(), ...(email.trim() ? { email: email.trim() } : {}) }); await refreshMe(); popup.toast('Profile updated', 'success'); nav.goBack(); }
    catch (e) { popup.alert('Could not save', errorMessage(e), 'error'); } finally { setSaving(false); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title="Edit profile" onBack={() => nav.goBack()} />
        <TextField label="Full name" value={name} onChangeText={setName} error={touched ? validateName(name) : null} autoCapitalize="words" maxLength={60} />
        <TextField label="Email" value={email} onChangeText={setEmail} error={touched ? validateEmail(email) : null} keyboardType="email-address" autoCapitalize="none" maxLength={120} />
        <TextField label="Mobile number" value={user ? maskPhone(user.phone) : ''} editable={false} hint="Your number is your login and can’t be changed here." />
        <View style={{ flex: 1 }} />
        <Button title="Save changes" loading={saving} onPress={save} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function AddressesScreen() {
  const nav = useNav();
  const list = useStore(session, (s) => s.addresses);
  const remove = async (id: string) => {
    if (!(await popup.confirm({ title: 'Delete address?', confirmLabel: 'Delete', destructive: true }))) return;
    try { await api.deleteAddress(id); await refreshMe(); } catch (e) { popup.alert('Could not delete', errorMessage(e), 'error'); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Saved addresses" onBack={() => nav.goBack()} />
      <FlatList data={list} keyExtractor={(a) => a.id} contentContainerStyle={{ flexGrow: 1 }} ListEmptyComponent={<EmptyState emoji="📍" title="No saved addresses" text="Add an address to get your groceries delivered." />}
        renderItem={({ item: a }) => (
          <FadeIn from={8}><View style={[g.card, { padding: space.lg, marginBottom: space.md, flexDirection: 'row', gap: space.md, alignItems: 'center' }]}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={a.label === 'Home' ? 'home' : a.label === 'Work' ? 'briefcase' : 'location'} size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={{ ...font.bodyB, color: colors.text }}>{a.label}</Text><Text style={{ ...font.small, color: colors.sub }}>{a.line1}{a.landmark ? `, ${a.landmark}` : ''} – {a.pincode}</Text></View>
            <IconButton name="trash-outline" label={`Delete ${a.label} address`} color={colors.danger} onPress={() => remove(a.id)} />
          </View></FadeIn>
        )} />
      <Button title="Add new address" icon="add" onPress={() => nav.navigate('AddAddress')} />
    </Screen>
  );
}

export function AddAddressScreen() {
  const nav = useNav();
  const [a, setA] = useState({ label: 'Home' as 'Home' | 'Work' | 'Other', line1: '', landmark: '', pincode: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await api.addAddress({ ...a, line1: a.line1.trim(), landmark: a.landmark.trim(), pincode: a.pincode.trim() }); await refreshMe(); nav.goBack(); }
    catch (e) { popup.alert('Could not save address', errorMessage(e), 'error'); } finally { setSaving(false); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Header title="Add address" onBack={() => nav.goBack()} /><AddressForm value={a} onChange={setA as any} onSubmit={save} submitLabel="Save address" loading={saving} /></ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function NotificationsScreen() {
  const nav = useNav();
  const items = useStore(inbox, (s) => s.items);
  const unread = useStore(inbox, (s) => s.unread);
  useEffect(() => { void refreshInbox(); const t = setTimeout(() => void markInboxRead(), 1500); return () => clearTimeout(t); }, []);
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Notifications" onBack={() => nav.goBack()} right={unread > 0 ? <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={markInboxRead}>Mark all read</Text> : undefined} />
      <FlatList data={items} keyExtractor={(n) => n.id} contentContainerStyle={{ flexGrow: 1 }} ListEmptyComponent={<EmptyState emoji="🔔" title="You’re all caught up" text="Order updates and offers will show up here." />}
        renderItem={({ item: n, index }) => (
          <FadeIn delay={Math.min(index, 6) * 40} from={8}>
            <PressableScale onPress={() => n.data?.orderId && nav.navigate('OrderDetail', { orderId: n.data.orderId })} accessibilityLabel={`${n.title}. ${n.body}`} style={[g.card, { padding: space.lg, marginBottom: space.sm, flexDirection: 'row', gap: space.md }, n.unread && { borderColor: colors.primaryTint, backgroundColor: '#F2FBF6' }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={n.data?.type === 'order' ? 'bag-handle' : n.data?.type === 'wallet' ? 'wallet' : 'megaphone'} size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ ...font.bodyB, color: colors.text, flex: 1 }}>{n.title}</Text>{n.unread && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 5 }} />}</View><Text style={{ ...font.small, color: colors.sub, marginTop: 2 }}>{n.body}</Text><Text style={{ ...font.tiny, color: colors.muted, marginTop: 6 }}>{timeAgo(n.createdAt)}</Text></View>
            </PressableScale>
          </FadeIn>
        )} />
    </Screen>
  );
}

function Doc({ title, sections, footer }: { title: string; sections: { h: string; p: string }[]; footer?: string }) {
  const nav = useNav();
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={title} onBack={() => nav.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={{ ...font.small, color: colors.muted, marginBottom: space.lg }}>{COMPANY.name} · Last updated {COMPANY.updated}</Text>
        {sections.map((s, i) => <FadeIn key={s.h} delay={Math.min(i, 5) * 50} from={8}><Text style={{ ...font.h3, color: colors.text, marginTop: space.lg }} accessibilityRole="header">{i + 1}. {s.h}</Text><Text style={{ ...font.body, color: colors.sub, lineHeight: 23, marginTop: 6 }}>{s.p}</Text></FadeIn>)}
        {!!footer && <Text style={{ ...font.small, color: colors.muted, marginTop: space.xl }}>{footer}</Text>}
      </ScrollView>
    </Screen>
  );
}
export const PrivacyScreen = () => <Doc title="Privacy policy" sections={PRIVACY} />;
export const TermsScreen = () => <Doc title="Terms of use" sections={TERMS} />;

export function HelpScreen() {
  const nav = useNav();
  const [open, setOpen] = useState<number | null>(0);
  const go = useCallback((url: string) => Linking.openURL(url).catch(() => popup.alert('Can’t open', 'No app available to handle this action.', 'error')), []);
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Help & support" onBack={() => nav.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <FadeIn style={{ flexDirection: 'row', gap: space.md }}>
          <PressableScale style={[g.card, { flex: 1, padding: space.lg, alignItems: 'center', gap: 6 }]} onPress={() => go(`tel:${SUPPORT.phone}`)} accessibilityLabel="Call support"><Ionicons name="call" size={26} color={colors.primary} /><Text style={{ ...font.bodyB, color: colors.text }}>Call us</Text></PressableScale>
          <PressableScale style={[g.card, { flex: 1, padding: space.lg, alignItems: 'center', gap: 6 }]} onPress={() => go(`mailto:${SUPPORT.email}?subject=YoGreen%20support`)} accessibilityLabel="Email support"><Ionicons name="mail" size={26} color={colors.primary} /><Text style={{ ...font.bodyB, color: colors.text }}>Email us</Text></PressableScale>
        </FadeIn>
        <Text style={{ ...font.small, color: colors.muted, textAlign: 'center', marginTop: space.sm }}>Support hours: {SUPPORT.hours}</Text>
        <Text style={{ ...font.h3, color: colors.text, marginTop: space.xl, marginBottom: space.md }}>Frequently asked questions</Text>
        {FAQ.map((f, i) => (
          <PressableScale key={f.q} haptic={false} onPress={() => setOpen(open === i ? null : i)} accessibilityLabel={f.q} style={[g.card, { padding: space.lg, marginBottom: space.sm }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}><Text style={{ ...font.bodyB, color: colors.text, flex: 1 }}>{f.q}</Text><Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></View>
            {open === i && <FadeIn from={4}><Text style={{ ...font.body, color: colors.sub, marginTop: space.sm, lineHeight: 22 }}>{f.a}</Text></FadeIn>}
          </PressableScale>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xl, marginTop: space.xl }}>
          <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => nav.navigate('Privacy')}>Privacy policy</Text>
          <Text style={{ color: colors.primary, fontWeight: '700' }} onPress={() => nav.navigate('Terms')}>Terms of use</Text>
        </View>
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
        <Logo size={44} tagline />
        <Text style={{ ...font.body, color: colors.sub, textAlign: 'center', marginTop: space.lg, lineHeight: 22 }}>Fresh vegetables, fruits and staples sourced straight from farms and delivered to your door, at live market prices.</Text>
        <Text style={{ ...font.small, color: colors.muted, marginTop: space.lg }}>Version {APP_VERSION}</Text>
        <Text style={{ ...font.small, color: colors.muted }}>© {new Date().getFullYear()} {COMPANY.name}</Text>
      </FadeIn>
    </Screen>
  );
}
