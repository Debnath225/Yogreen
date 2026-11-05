import { HttpError, V } from '../lib/http.js';
export { publicUser } from '../lib/public-user.js';

export function parseAddress(input) {
  return {
    label: V.oneOf(input, 'label', ['Home', 'Work', 'Other']),
    line1: V.str(input, 'line1', { min: 5, max: 120 }),
    landmark: V.str(input, 'landmark', { max: 80, optional: true }) || '',
    pincode: V.str(input, 'pincode', { re: /^\d{6}$/ }),
    lat: V.num(input, 'lat', { min: -90, max: 90, optional: true }),
    lng: V.num(input, 'lng', { min: -180, max: 180, optional: true }),
  };
}

export function parseItems(body) {
  return V.arr(body, 'items', { min: 1, max: 50 }).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(422, 'validation_error', `items[${index}] must be an object`);
    }
    return { productId: V.str(item, 'productId', { max: 64 }), qty: V.int(item, 'qty', { min: 1, max: 20 }) };
  });
}

export async function customerOrder(store, order) {
  const safe = { ...order };
  const { riderId } = safe;
  delete safe.codeAttempts;
  delete safe.riderId;
  if (riderId) {
    const rider = await store.findUser(riderId);
    if (rider) safe.rider = { id: rider.id, name: rider.name || '' };
  }
  return safe;
}
