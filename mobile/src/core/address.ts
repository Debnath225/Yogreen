import type { LocationGeocodedAddress } from 'expo-location';

export function addressFieldsFromGeocode(place: LocationGeocodedAddress) {
  const street = [place.streetNumber, place.street].filter(Boolean).join(' ').trim();
  const line1 = street || place.name || place.district || place.city || place.subregion || '';
  const locality = [place.district, place.city, place.subregion, place.region]
    .filter((value, index, values): value is string => !!value && values.indexOf(value) === index)
    .join(', ');
  const postalCode = (place.postalCode || '').replace(/\D/g, '');

  return {
    line1: line1.slice(0, 120),
    landmark: locality.slice(0, 80),
    pincode: postalCode.length === 6 ? postalCode : '',
  };
}
