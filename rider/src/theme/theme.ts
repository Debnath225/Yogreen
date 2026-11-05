import { Platform, StyleSheet } from 'react-native';

export const colors = {
  primary: '#0B8F5A', primaryDark: '#066B43', primarySoft: '#E6F6EE', primaryTint: '#C9EBDA',
  gold: '#F5A524', goldSoft: '#FFF4DB', goldDark: '#B26B00',
  bg: '#F6F9F7', card: '#FFFFFF', text: '#0F1F18', sub: '#5B6B63', muted: '#93A29A', border: '#E3EAE6',
  danger: '#E5484D', dangerSoft: '#FDECEC', info: '#2F6FED', infoSoft: '#E8F0FE', white: '#FFFFFF', overlay: 'rgba(8,20,14,0.55)',
};
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };
export const font = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyB: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
};
export const shadow = Platform.select({
  ios: { shadowColor: '#0B2A1B', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  default: { elevation: 3 },
})!;
export const hit = { top: 10, bottom: 10, left: 10, right: 10 };
export const g = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
});
