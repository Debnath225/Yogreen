import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Chip, TextField, Button } from './ui';
import { validateLine1, validatePincode } from '../core/validators';
import { addressFieldsFromGeocode } from '../core/address';
import type { Address } from '../core/types';
import { popup } from './Popup';
import { colors, font, radius, space } from '../theme/theme';

type Draft = Omit<Address, 'id'>;
export function AddressForm({ value, onChange, onSubmit, submitLabel, loading }: { value: Draft; onChange: (a: Draft) => void; onSubmit: () => void; submitLabel: string; loading?: boolean }) {
  const [touched, setTouched] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MapView>(null);
  const e1 = touched ? validateLine1(value.line1) : null;
  const e2 = touched ? validatePincode(value.pincode) : null;
  const set = (p: Partial<Draft>) => onChange({ ...value, ...p });
  const locate = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        popup.alert('Location permission needed', 'Allow location access to place a pin at your current location.', 'info');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      set({ lat: position.coords.latitude, lng: position.coords.longitude });
      mapRef.current?.animateToRegion({ latitude: position.coords.latitude, longitude: position.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 350);
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (place) {
          set(addressFieldsFromGeocode(place));
        } else {
          popup.alert('Location selected', 'We could not find an address here. Please enter the street and pincode manually.', 'info');
        }
      } catch {
        popup.alert('Location selected', 'The map pin was set, but the address could not be looked up. Please enter the street and pincode manually.', 'info');
      }
    } catch (error) {
      popup.alert('Could not get your location', error instanceof Error ? error.message : 'Try moving the map pin instead.', 'error');
    } finally { setLocating(false); }
  };
  const latitude = value.lat ?? 22.5726;
  const longitude = value.lng ?? 88.3639;
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.lg }}>
        {(['Home', 'Work', 'Other'] as const).map((l) => <Chip key={l} label={l} icon={l === 'Home' ? 'home' : l === 'Work' ? 'briefcase' : 'location'} active={value.label === l} onPress={() => set({ label: l })} />)}
      </View>
      <TextField label="Flat / house no., building, street" placeholder="e.g. 12B, Park Street" value={value.line1} onChangeText={(t) => set({ line1: t })} error={e1} autoCapitalize="words" maxLength={120} returnKeyType="next" />
      <TextField label="Landmark (optional)" placeholder="e.g. Near City Mall" value={value.landmark} onChangeText={(t) => set({ landmark: t })} maxLength={80} returnKeyType="next" />
      <TextField label="Pincode" placeholder="700016" value={value.pincode} onChangeText={(t) => set({ pincode: t.replace(/\D/g, '').slice(0, 6) })} keyboardType="number-pad" error={e2} maxLength={6} returnKeyType="done" />
      <View style={styles.mapHeading}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...font.bodyB, color: colors.text }}>Delivery location</Text>
          <Text style={{ ...font.small, color: colors.sub, marginTop: 2 }}>Tap the map or drag the pin to fine-tune your address.</Text>
        </View>
        <Button title={locating ? 'Locating…' : 'Use my location'} icon="locate" variant="secondary" disabled={locating} onPress={locate} style={{ minHeight: 40, paddingHorizontal: 10 }} />
      </View>
      <View style={styles.map}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          onPress={(event) => set({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude })}
        >
          <Marker
            coordinate={{ latitude, longitude }}
            draggable
            onDragEnd={(event) => set({ lat: event.nativeEvent.coordinate.latitude, lng: event.nativeEvent.coordinate.longitude })}
            title="Delivery location"
          />
        </MapView>
      </View>
      <Text style={{ ...font.tiny, color: colors.muted, marginBottom: space.lg }}>
        {value.lat !== undefined && value.lng !== undefined ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : 'Choose a precise pin; this is used for order tracking.'}
      </Text>
      <Button title={submitLabel} loading={loading} onPress={() => { setTouched(true); if (!validateLine1(value.line1) && !validatePincode(value.pincode)) onSubmit(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  mapHeading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  map: { height: 220, overflow: 'hidden', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: space.sm },
});
