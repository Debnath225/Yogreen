import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cart, session } from '../state/app';
import { useStore } from '../state/useStore';
import { Button, Logo } from '../components/ui';
import { colors, font } from '../theme/theme';
import type { AuthStackParams, MainStackParams, SetupStackParams } from './types';
import { LoginScreen, OtpScreen, SignUpScreen, WelcomeScreen } from '../screens/AuthScreens';
import { SetupAddressScreen, SetupFinishScreen, SetupProfileScreen } from '../screens/SetupScreens';
import { HomeScreen } from '../screens/HomeScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CartScreen, CheckoutScreen } from '../screens/CartScreens';
import { OrderDetailScreen, OrdersScreen } from '../screens/OrderScreens';
import { RewardsScreen } from '../screens/RewardsScreen';
import { AboutScreen, AddAddressScreen, AddressesScreen, EditProfileScreen, HelpScreen, NotificationsScreen, PrivacyScreen, ProfileScreen, TermsScreen } from '../screens/ProfileScreens';

export const navRef = createNavigationContainerRef<any>();
const Auth = createNativeStackNavigator<AuthStackParams>();
const Setup = createNativeStackNavigator<SetupStackParams>();
const Main = createNativeStackNavigator<MainStackParams>();
const Tabs = createBottomTabNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, card: colors.card, text: colors.text, border: colors.border } };

function TabIcon({ name, focused, color }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; color: string }) {
  const s = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => { Animated.spring(s, { toValue: focused ? 1 : 0, friction: 4, tension: 140, useNativeDriver: true }).start(); }, [focused, s]);
  return <Animated.View style={{ transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }, { translateY: s.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }}><Ionicons name={name} size={24} color={color} /></Animated.View>;
}

function BottomTabs() {
  const count = useStore(cart, (s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const i = useSafeAreaInsets();
  const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = { Home: ['storefront', 'storefront-outline'], Rewards: ['wallet', 'wallet-outline'], Cart: ['cart', 'cart-outline'], Orders: ['receipt', 'receipt-outline'], Profile: ['person', 'person-outline'] };
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { height: 62 + i.bottom, paddingTop: 6, paddingBottom: Math.max(i.bottom, 8), backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarIcon: ({ focused, color }) => <TabIcon name={icons[route.name][focused ? 0 : 1]} focused={focused} color={color} />,
        tabBarBadge: route.name === 'Cart' && count > 0 ? count : undefined,
        tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 10, fontWeight: '800' },
        animation: 'fade',
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Rewards" component={RewardsScreen} options={{ title: 'YGC' }} />
      <Tabs.Screen name="Cart" component={CartScreen} />
      <Tabs.Screen name="Orders" component={OrdersScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

const common = { headerShown: false, animation: 'slide_from_right' as const, contentStyle: { backgroundColor: colors.bg } };
function AuthStack() {
  return (
    <Auth.Navigator screenOptions={common}>
      <Auth.Screen name="Welcome" component={WelcomeScreen} options={{ animation: 'fade' }} />
      <Auth.Screen name="Login" component={LoginScreen} />
      <Auth.Screen name="SignUp" component={SignUpScreen} />
      <Auth.Screen name="Otp" component={OtpScreen as any} options={{ animation: 'slide_from_bottom' }} />
      <Auth.Screen name="Help" component={HelpScreen} options={{ animation: 'slide_from_bottom' }} />
      <Auth.Screen name="Privacy" component={PrivacyScreen} options={{ animation: 'slide_from_bottom' }} />
      <Auth.Screen name="Terms" component={TermsScreen} options={{ animation: 'slide_from_bottom' }} />
    </Auth.Navigator>
  );
}
function SetupStack() {
  return (
    <Setup.Navigator screenOptions={{ ...common, gestureEnabled: true }}>
      <Setup.Screen name="SetupProfile" component={SetupProfileScreen} options={{ animation: 'fade' }} />
      <Setup.Screen name="SetupAddress" component={SetupAddressScreen} />
      <Setup.Screen name="SetupFinish" component={SetupFinishScreen} />
    </Setup.Navigator>
  );
}
function MainStack() {
  return (
    <Main.Navigator screenOptions={common}>
      <Main.Screen name="Tabs" component={BottomTabs} options={{ animation: 'fade' }} />
      <Main.Screen name="Checkout" component={CheckoutScreen} options={{ animation: 'slide_from_bottom' }} />
      <Main.Screen name="OrderDetail" component={OrderDetailScreen as any} />
      <Main.Screen name="ProductDetail" component={ProductDetailScreen as any} />
      <Main.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'fade_from_bottom' }} />
      <Main.Screen name="EditProfile" component={EditProfileScreen} />
      <Main.Screen name="Addresses" component={AddressesScreen} />
      <Main.Screen name="AddAddress" component={AddAddressScreen} options={{ animation: 'slide_from_bottom' }} />
      <Main.Screen name="Help" component={HelpScreen} />
      <Main.Screen name="Privacy" component={PrivacyScreen} />
      <Main.Screen name="Terms" component={TermsScreen} />
      <Main.Screen name="About" component={AboutScreen} />
    </Main.Navigator>
  );
}

export function Splash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(s, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start(); }, [s]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Animated.View style={{ opacity: s, transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}><Logo size={52} light tagline /></Animated.View>
      {error && <View style={{ marginTop: 40, alignSelf: 'stretch', gap: 12 }}><Text style={{ color: '#fff', textAlign: 'center', ...font.body }}>{error}</Text><Button title="Try again" variant="gold" onPress={onRetry} /></View>}
    </View>
  );
}

export function RootNavigator({ onRetry }: { onRetry: () => void }) {
  const status = useStore(session, (s) => s.status);
  const err = useStore(session, (s) => s.bootError);
  const setupDone = useStore(session, (s) => !!s.user?.setupCompleted);

  useEffect(() => { // tapping a push notification opens the related order
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const orderId = (r.notification.request.content.data as any)?.orderId;
      if (orderId && navRef.isReady() && session.get().status === 'in') navRef.navigate('OrderDetail', { orderId });
    });
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer ref={navRef} theme={theme}>
      {status === 'boot' ? <Splash error={err} onRetry={onRetry} /> : status === 'out' ? <AuthStack /> : !setupDone ? <SetupStack /> : <MainStack />}
    </NavigationContainer>
  );
}
