import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isValidPhone, maskPhone, formatPhone, validateEmail, validateName, validatePincode, validateLine1, isValidOtp } from '../src/core/validators';
import { addressFieldsFromGeocode } from '../src/core/address';
import { estimate, setQty, qtyOf, DELIVERY } from '../src/core/cartMath';
import { formatINR, discountPct, timeAgo } from '../src/core/money';
import { createStore } from '../src/core/createStore';
import type { Product } from '../src/core/types';

const P = (id: string, price: number, mrp = price + 10): Product => ({ id, sku: id, name: id, category: 'Vegetables', unit: 'kg', price, mrp, stock: 50, emoji: '🍅', v: 1 });
const map = (...ps: Product[]) => new Map(ps.map((p) => [p.id, p]));

test('phone validation & formatting', () => {
  assert.equal(normalizePhone('98300 12345'), '9830012345');
  assert.equal(normalizePhone('+91 98300-12345'), '9830012345');
  assert.equal(normalizePhone('09830012345'), '9830012345');
  for (const bad of ['5830012345', '983001234', '98300123456', 'abcdefghij', '']) assert.equal(isValidPhone(bad), false, bad);
  assert.equal(formatPhone('9830012345'), '+91 98300 12345');
  assert.equal(maskPhone('+919830012345'), '+91 98•••••• 45');
});
test('form validators', () => {
  assert.equal(validateName('A'), 'Enter your full name');
  assert.equal(validateName('Asha Roy'), null);
  assert.equal(validateEmail(''), null);
  assert.equal(validateEmail('a@b'), 'Enter a valid email');
  assert.equal(validateEmail('a@b.co'), null);
  assert.ok(validatePincode('7000'));
  assert.equal(validatePincode('700016'), null);
  assert.ok(validateLine1('abc'));
  assert.equal(isValidOtp('123456'), true);
  assert.equal(isValidOtp('12345a'), false);
});
test('reverse-geocoded location populates address fields and validates Indian pincode', () => {
  assert.deepEqual(addressFieldsFromGeocode({
    streetNumber: '12B',
    street: 'Park Street',
    name: 'Park Street',
    district: 'Kolkata',
    city: 'Kolkata',
    subregion: null,
    region: 'West Bengal',
    postalCode: '700016',
    country: 'India',
    isoCountryCode: 'IN',
    timezone: null,
    formattedAddress: null,
  }), {
    line1: '12B Park Street',
    landmark: 'Kolkata, West Bengal',
    pincode: '700016',
  });
  assert.deepEqual(addressFieldsFromGeocode({
    streetNumber: null,
    street: null,
    name: null,
    district: 'Salt Lake',
    city: 'Kolkata',
    subregion: null,
    region: 'West Bengal',
    postalCode: null,
    country: 'India',
    isoCountryCode: 'IN',
    timezone: null,
    formattedAddress: null,
  }), {
    line1: 'Salt Lake',
    landmark: 'Salt Lake, Kolkata, West Bengal',
    pincode: '',
  });
});
test('cart math mirrors server pricing rules', () => {
  const prods = map(P('pot', 28), P('tom', 38));
  const e = estimate([{ productId: 'pot', qty: 10 }], prods, 50, true);
  assert.equal(e.subtotal, 280);
  assert.equal(e.deliveryFee, DELIVERY.fee);
  assert.equal(e.maxCoins, 28);
  assert.equal(e.coins, 28);
  assert.equal(e.total, 277);
  assert.equal(e.savings, 100);
  const free = estimate([{ productId: 'pot', qty: 11 }], prods, 0, true);
  assert.equal(free.deliveryFee, 0);
  assert.equal(free.coins, 0, 'no balance => no coins');
  assert.equal(estimate([], prods).total, 0);
  assert.equal(estimate([{ productId: 'tom', qty: 1 }], prods).belowMin, true);
  assert.equal(estimate([{ productId: 'ghost', qty: 3 }], prods).count, 0, 'unknown/removed product ignored');
});
test('setQty clamps and removes', () => {
  let l = setQty([], 'a', 2);
  l = setQty(l, 'a', 3);
  assert.equal(qtyOf(l, 'a'), 3);
  assert.equal(qtyOf(setQty(l, 'a', 99), 'a'), 20);
  assert.equal(setQty(l, 'a', 0).length, 0);
  assert.equal(setQty(l, 'a', -4).length, 0);
});
test('money helpers', () => {
  assert.equal(formatINR(28), '₹28');
  assert.equal(formatINR(27.5), '₹27.50');
  assert.equal(discountPct(38, 48), 21);
  assert.equal(discountPct(48, 48), 0);
  assert.equal(timeAgo(1000, 1000 + 5 * 60_000), '5m ago');
});
test('store notifies subscribers and supports functional set', () => {
  const s = createStore({ n: 0 });
  let calls = 0;
  const off = s.subscribe(() => calls++);
  s.set({ n: 1 });
  s.set((st) => ({ n: st.n + 1 }));
  off();
  s.set({ n: 10 });
  assert.equal(calls, 2);
  assert.equal(s.get().n, 10);
});
