import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, FadeIn, Header, Screen, TextField, CoinPill, Toggle } from '../components/ui';
import { AddressForm } from '../components/AddressForm';
import { popup } from '../components/Popup';
import { setupDraft } from '../state/setupDraft';
import { useStore } from '../state/useStore';
import { errorMessage, finishSetup, signOut } from '../state/app';
import { validateEmail, validateName } from '../core/validators';
import { colors, font, radius, space } from '../theme/theme';

const useNav = () => useNavigation<any>();

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const w = useRef(new Animated.Value(step / 3)).current;
  useEffect(() => { Animated.timing(w, { toValue: step / 3, duration: 450, useNativeDriver: false }).start(); }, [step, w]);
  return (
    <View accessible accessibilityLabel={`Step ${step} of 3`}>
      <Text style={{ ...font.small, color: colors.sub, marginBottom: 6, fontWeight: '600' }}>Step {step} of 3</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
        <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
    </View>
  );
}

export function SetupProfileScreen() {
  const nav = useNav();
  const d = useStore(setupDraft, (s) => s);
  const [touched, setTouched] = useState(false);
  const nameErr = touched ? validateName(d.name) : null;
  const mailErr = touched ? validateEmail(d.email) : null;
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <Header title="" right={<Text onPress={async () => { if (await popup.confirm({ title: 'Log out?', message: 'You can finish setting up later.', confirmLabel: 'Log out' })) await signOut(); }} style={{ color: colors.sub, fontWeight: '600' }}>Log out</Text>} />
          <StepBar step={1} />
          <FadeIn><Text style={{ ...font.h1, color: colors.text, marginTop: space.xl }}>What should we call you?</Text></FadeIn>
          <FadeIn delay={80}><Text style={{ ...font.body, color: colors.sub, marginVertical: space.sm, marginBottom: space.xl }}>This helps riders and support find your order.</Text></FadeIn>
          <FadeIn delay={160}>
            <TextField label="Full name" placeholder="Asha Roy" value={d.name} onChangeText={(t) => setupDraft.set({ name: t })} error={nameErr} autoCapitalize="words" textContentType="name" autoComplete="name" maxLength={60} returnKeyType="next" />
            <TextField label="Email (optional)" placeholder="asha@example.com" value={d.email} onChangeText={(t) => setupDraft.set({ email: t })} error={mailErr} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" autoComplete="email" maxLength={120} hint="For receipts and offers. We never spam." />
          </FadeIn>
          <View style={{ flex: 1, minHeight: space.xl }} />
          <Button title="Continue" onPress={() => { setTouched(true); if (!validateName(d.name) && !validateEmail(d.email)) nav.navigate('SetupAddress'); }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function SetupAddressScreen() {
  const nav = useNav();
  const address = useStore(setupDraft, (s) => s.address);
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Header title="" onBack={() => nav.goBack()} />
          <StepBar step={2} />
          <FadeIn><Text style={{ ...font.h1, color: colors.text, marginTop: space.xl }}>Where should we deliver?</Text></FadeIn>
          <FadeIn delay={80}><Text style={{ ...font.body, color: colors.sub, marginVertical: space.sm, marginBottom: space.xl }}>You can add more addresses later from your profile.</Text></FadeIn>
          <FadeIn delay={160}><AddressForm value={address} onChange={(a) => setupDraft.set({ address: a })} onSubmit={() => nav.navigate('SetupFinish')} submitLabel="Continue" /></FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

export function SetupFinishScreen() {
  const nav = useNav();
  const d = useStore(setupDraft, (s) => s);
  const [loading, setLoading] = useState(false);
  const coin = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.loop(Animated.sequence([Animated.timing(coin, { toValue: 1, duration: 900, useNativeDriver: true }), Animated.timing(coin, { toValue: 0, duration: 900, useNativeDriver: true })])).start(); }, [coin]);

  const done = async () => {
    setLoading(true);
    try {
      const bonus = await finishSetup({ name: d.name.trim(), email: d.email.trim(), address: { ...d.address, line1: d.address.line1.trim(), landmark: d.address.landmark.trim(), pincode: d.address.pincode.trim() }, pushEnabled: d.pushEnabled });
      if (bonus > 0) popup.show({ type: 'coins', title: `${bonus} YGC coins added! 🎉`, message: 'Welcome to YoGreen. Use your coins for up to 10% off every order.', actions: [{ label: 'Start shopping', style: 'primary' }] });
    } catch (e) {
      popup.alert('Could not finish setup', errorMessage(e), 'error');
      setLoading(false);
    }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="" onBack={() => nav.goBack()} />
      <StepBar step={3} />
      <FadeIn><Text style={{ ...font.h1, color: colors.text, marginTop: space.xl }}>Almost there, {d.name.split(' ')[0] || 'friend'}!</Text></FadeIn>
      <FadeIn delay={100} style={{ marginTop: space.xl }}>
        <Card style={{ backgroundColor: colors.goldSoft, borderColor: '#F7DC9B', flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <Animated.View style={{ transform: [{ translateY: coin.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }, { rotate: coin.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] }) }] }}><Text style={{ fontSize: 44 }}>🪙</Text></Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...font.h3, color: '#5C3B00' }}>Welcome bonus</Text>
            <Text style={{ ...font.small, color: '#7A5200', marginTop: 2 }}>Finish setup to claim your starter YGC coins.</Text>
          </View>
          <CoinPill amount="+50" big />
        </Card>
      </FadeIn>
      <FadeIn delay={200} style={{ marginTop: space.lg }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="notifications" size={22} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...font.bodyB, color: colors.text }}>Order updates & offers</Text>
            <Text style={{ ...font.small, color: colors.sub }}>Live delivery status and price drops.</Text>
          </View>
          <Toggle value={d.pushEnabled} onValueChange={(v) => setupDraft.set({ pushEnabled: v })} accessibilityLabel="Enable push notifications" />
        </Card>
      </FadeIn>
      <FadeIn delay={280} style={{ marginTop: space.lg }}>
        <Card>
          <Text style={{ ...font.small, color: colors.sub, fontWeight: '600' }}>DELIVERING TO</Text>
          <Text style={{ ...font.bodyB, color: colors.text, marginTop: 4 }}>{d.address.label} · {d.address.line1}</Text>
          <Text style={{ ...font.small, color: colors.sub }}>{d.address.landmark ? `${d.address.landmark}, ` : ''}{d.address.pincode}</Text>
        </Card>
      </FadeIn>
      <View style={{ flex: 1 }} />
      <Button title="Finish & claim 50 YGC" variant="gold" loading={loading} onPress={done} />
    </Screen>
  );
}
