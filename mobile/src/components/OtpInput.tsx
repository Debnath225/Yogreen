import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius } from '../theme/theme';

interface Props { value: string; onChange: (v: string) => void; length?: number; error?: boolean; errorKey?: number; autoFocus?: boolean }

/** One hidden input drives N visual boxes: supports SMS autofill (iOS oneTimeCode / Android sms-otp), paste and backspace. */
export function OtpInput({ value, onChange, length = 6, error, errorKey = 0, autoFocus = true }: Props) {
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (errorKey) Animated.sequence([10, -10, 8, -8, 4, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  }, [errorKey, shake]);
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One-time password input">
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length }).map((_, i) => {
          const ch = value[i];
          const active = i === Math.min(value.length, length - 1);
          return (
            <View key={i} style={[styles.box, active && { borderColor: colors.primary, backgroundColor: colors.white }, !!ch && { backgroundColor: colors.primarySoft, borderColor: colors.primaryTint }, error && { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}>
              <Text style={styles.digit}>{ch ?? ''}</Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        caretHidden
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: { flex: 1, height: 58, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#F1F5F3', alignItems: 'center', justifyContent: 'center' },
  digit: { ...font.h2, color: colors.text },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
