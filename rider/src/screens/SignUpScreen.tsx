import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api, errorMessage } from '../state/app';
import { normalizePhone } from '../core/validators';
import type { RiderApplication } from '../core/types';
import { Button, Header, Logo, Screen, TextField } from '../components/ui';
import { popup } from '../components/Popup';
import { colors, font, space } from '../theme/theme';

const VEHICLE_TYPES: RiderApplication['vehicle']['type'][] = ['motorcycle', 'scooter', 'bicycle', 'other'];
const MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const useNav = () => useNavigation<any>();

async function toBase64(uri: string) {
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export function SignUpScreen() {
  const nav = useNav();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<RiderApplication['vehicle']['type']>('motorcycle');
  const [makeModel, setMakeModel] = useState('');
  const [registration, setRegistration] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [document, setDocument] = useState<RiderApplication['license']['document'] | null>(null);
  const [loading, setLoading] = useState(false);

  const chooseDocument = async () => {
    let temporaryUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: MIME_TYPES, copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      temporaryUri = file.uri;
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      const size = file.size ?? ('size' in fileInfo ? fileInfo.size : undefined);
      if (size !== undefined && size > MAX_FILE_BYTES) {
        await FileSystem.deleteAsync(file.uri, { idempotent: true });
        temporaryUri = undefined;
        popup.alert('File too large', 'Choose a PDF, JPG, or PNG no larger than 5 MB.', 'error');
        return;
      }
      if (!file.mimeType || !MIME_TYPES.includes(file.mimeType)) {
        await FileSystem.deleteAsync(file.uri, { idempotent: true });
        temporaryUri = undefined;
        popup.alert('Unsupported file', 'Choose a PDF, JPG, or PNG license document.', 'error');
        return;
      }
      const base64 = await toBase64(file.uri);
      temporaryUri = undefined;
      const base64Bytes = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
      if (!base64 || base64Bytes > MAX_FILE_BYTES) {
        popup.alert('File too large', 'Choose a document no larger than 5 MB.', 'error');
        return;
      }
      setDocument({ name: file.name, mimeType: file.mimeType, base64 });
    } catch (error) {
      if (temporaryUri) {
        try {
          await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
        } catch (cleanupError) {
          popup.alert('Could not remove temporary file', errorMessage(cleanupError), 'error');
          return;
        }
      }
      popup.alert('Could not read document', error instanceof Error ? error.message : 'Please choose the file again.', 'error');
    }
  };

  const submit = async () => {
    const phone10 = normalizePhone(phone);
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 60 || !/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(cleanName)) {
      popup.alert('Check your name', 'Enter a valid name between 2 and 60 characters.', 'error');
      return;
    }
    if (!phone10) { popup.alert('Check your phone number', 'Enter a valid 10-digit Indian mobile number.', 'error'); return; }
    if (makeModel.trim().length < 2 || makeModel.trim().length > 80) { popup.alert('Check vehicle details', 'Enter the vehicle make and model.', 'error'); return; }
    if (!/^[A-Za-z0-9 -]{4,20}$/.test(registration.trim())) { popup.alert('Check registration number', 'Enter a valid vehicle registration number.', 'error'); return; }
    if (!/^[A-Za-z0-9/-]{4,30}$/.test(licenseNumber.trim())) { popup.alert('Check license number', 'Enter a valid driving license number.', 'error'); return; }
    if (!document) { popup.alert('License document required', 'Upload a clear PDF, JPG, or PNG copy of your driving license.', 'error'); return; }

    setLoading(true);
    try {
      const application: RiderApplication = {
        name: cleanName,
        vehicle: { type: vehicleType, makeModel: makeModel.trim(), registration: registration.trim() },
        license: { number: licenseNumber.trim(), document },
      };
      const result = await api.sendOtp(phone10, 'signup');
      nav.navigate('Otp', { phone: phone10, mode: 'signup', application, devOtp: __DEV__ ? result.devOtp : undefined });
      setDocument(null);
    } catch (error) {
      popup.alert('Could not start application', errorMessage(error), 'error');
    } finally { setLoading(false); }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <Header title="" onBack={() => nav.goBack()} />
          <Logo size={30} />
          <Text style={styles.title}>Rider application</Text>
          <Text style={styles.subtitle}>Verify your phone and submit your details. You can sign in after an admin approves your application.</Text>
          <TextField label="Full name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={60} />
          <TextField label="Mobile number" placeholder="98300 12345" value={phone} onChangeText={(text) => setPhone(text.replace(/[^\d+\s]/g, '').slice(0, 14))} keyboardType="phone-pad" maxLength={14} />
          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.vehicleTypes}>
            {VEHICLE_TYPES.map((type) => (
              <Pressable key={type} onPress={() => setVehicleType(type)} style={[styles.vehicleType, vehicleType === type && styles.vehicleTypeSelected]}>
                <Text style={[styles.vehicleText, vehicleType === type && styles.vehicleTextSelected]}>{type[0].toUpperCase() + type.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <TextField label="Vehicle make and model" placeholder="e.g. Honda Activa" value={makeModel} onChangeText={setMakeModel} maxLength={80} />
          <TextField label="Vehicle registration" placeholder="e.g. WB01AB1234" value={registration} onChangeText={setRegistration} autoCapitalize="characters" maxLength={20} />
          <TextField label="Driving license number" placeholder="Enter license number" value={licenseNumber} onChangeText={setLicenseNumber} autoCapitalize="characters" maxLength={30} />
          <Pressable onPress={() => void chooseDocument()} style={styles.documentButton} accessibilityRole="button">
            <Ionicons name={document ? 'document-text' : 'cloud-upload-outline'} size={21} color={colors.primary} />
            <Text style={styles.documentText}>{document?.name || 'Upload license (PDF, JPG, PNG · max 5 MB)'}</Text>
          </Pressable>
          <Text style={styles.documentHint}>The document is sent to YoGreen and is accessible only to authorized admins.</Text>
          <Pressable onPress={() => nav.navigate('Login')} style={styles.loginLink}>
            <Text style={{ ...font.body, color: colors.sub }}>Already applied? <Text style={{ color: colors.primary, fontWeight: '700' }}>Log in</Text></Text>
          </Pressable>
        </ScrollView>
        <Button title="Continue to phone verification" loading={loading} onPress={submit} style={{ marginTop: space.sm }} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...font.h1, color: colors.text, marginTop: space.xl },
  subtitle: { ...font.body, color: colors.sub, marginTop: space.sm, marginBottom: space.xl, lineHeight: 22 },
  label: { ...font.small, color: colors.sub, fontWeight: '700', marginBottom: space.sm },
  vehicleTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  vehicleType: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  vehicleTypeSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  vehicleText: { ...font.small, color: colors.sub, fontWeight: '700' },
  vehicleTextSelected: { color: colors.primaryDark },
  documentButton: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  documentText: { ...font.small, color: colors.primaryDark, fontWeight: '700', flexShrink: 1 },
  documentHint: { ...font.small, color: colors.muted, marginTop: space.xs, marginBottom: space.lg },
  loginLink: { alignItems: 'center', paddingVertical: space.lg },
});
