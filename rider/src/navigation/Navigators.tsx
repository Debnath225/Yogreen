import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { session, tasks } from '../state/app';
import { useStore } from '../state/useStore';
import { Button, Logo } from '../components/ui';
import { colors, font } from '../theme/theme';
import { LoginScreen, OtpScreen } from '../screens/AuthScreens';
import { SignUpScreen } from '../screens/SignUpScreen';
import { DeliverScreen, TaskDetailScreen, TasksScreen } from '../screens/TaskScreens';
import { EarningsScreen } from '../screens/EarningsScreen';
import { AboutScreen, EditNameScreen, HelpScreen, PrivacyScreen, ProfileScreen } from '../screens/ProfileScreens';

export const navRef = createNavigationContainerRef<any>();
const Auth = createNativeStackNavigator();
const Main = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary, card: colors.card, text: colors.text, border: colors.border } };

function TabIcon({ name, focused, color }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; color: string }) {
  const s = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => { Animated.spring(s, { toValue: focused ? 1 : 0, friction: 4, tension: 140, useNativeDriver: true }).start(); }, [focused, s]);
  return <Animated.View style={{ transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }}><Ionicons name={name} size={24} color={color} /></Animated.View>;
}

function BottomTabs() {
  const i = useSafeAreaInsets();
  const waiting = useStore(tasks, (s) => s.available.length + s.active.length);
  const icons: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = { Tasks: ['bicycle', 'bicycle-outline'], Earnings: ['wallet', 'wallet-outline'], Profile: ['person', 'person-outline'] };
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      headerShown: false, lazy: true, animation: 'fade',
      tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      tabBarStyle: { height: 62 + i.bottom, paddingTop: 6, paddingBottom: Math.max(i.bottom, 8), backgroundColor: colors.card, borderTopColor: colors.border },
      tabBarIcon: ({ focused, color }) => <TabIcon name={icons[route.name][focused ? 0 : 1]} focused={focused} color={color} />,
      tabBarBadge: route.name === 'Tasks' && waiting > 0 ? waiting : undefined,
      tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 10, fontWeight: '800' },
    })}>
      <Tabs.Screen name="Tasks" component={TasksScreen} />
      <Tabs.Screen name="Earnings" component={EarningsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

const common = { headerShown: false, animation: 'slide_from_right' as const, contentStyle: { backgroundColor: colors.bg } };
const AuthStack = () => (
  <Auth.Navigator screenOptions={common}>
    <Auth.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
    <Auth.Screen name="SignUp" component={SignUpScreen} options={{ animation: 'slide_from_right' }} />
    <Auth.Screen name="Otp" component={OtpScreen as any} options={{ animation: 'slide_from_bottom' }} />
    <Auth.Screen name="Help" component={HelpScreen} options={{ animation: 'slide_from_bottom' }} />
  </Auth.Navigator>
);
const MainStack = () => (
  <Main.Navigator screenOptions={common}>
    <Main.Screen name="Tabs" component={BottomTabs} options={{ animation: 'fade' }} />
    <Main.Screen name="TaskDetail" component={TaskDetailScreen as any} />
    <Main.Screen name="Deliver" component={DeliverScreen as any} options={{ animation: 'slide_from_bottom' }} />
    <Main.Screen name="EditName" component={EditNameScreen} />
    <Main.Screen name="Help" component={HelpScreen} />
    <Main.Screen name="Privacy" component={PrivacyScreen} />
    <Main.Screen name="About" component={AboutScreen} />
  </Main.Navigator>
);

export function Splash({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const s = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(s, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start(); }, [s]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Animated.View style={{ opacity: s, transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}><Logo size={46} light tagline /></Animated.View>
      {error && <View style={{ marginTop: 40, alignSelf: 'stretch', gap: 12 }}><Text style={{ color: '#fff', textAlign: 'center', ...font.body }}>{error}</Text><Button title="Try again" variant="gold" onPress={onRetry} /></View>}
    </View>
  );
}

export function RootNavigator({ onRetry }: { onRetry: () => void }) {
  const status = useStore(session, (s) => s.status);
  const err = useStore(session, (s) => s.bootError);
  useEffect(() => { // tapping a "new order" push opens that order
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const orderId = (r.notification.request.content.data as any)?.orderId;
      if (orderId && navRef.isReady() && session.get().status === 'in') navRef.navigate('TaskDetail', { orderId });
    });
    return () => sub.remove();
  }, []);
  return (
    <NavigationContainer ref={navRef} theme={theme}>
      {status === 'boot' ? <Splash error={err} onRetry={onRetry} /> : status === 'out' ? <AuthStack /> : <MainStack />}
    </NavigationContainer>
  );
}
