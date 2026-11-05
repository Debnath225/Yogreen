import type { CartLine, Product } from './types';
export const DELIVERY = { minOrder: 99, freeAbove: 299, fee: 25 };
export const YGC = { maxRedeemPct: 0.10, valueInr: 1 };
const paise = (r: number) => Math.round(r * 100);

/** UI-side estimate only. The server re-prices every order and is the source of truth. */
export function estimate(lines: CartLine[], products: Map<string, Product>, balance = 0, useCoins = false) {
  let sub = 0, count = 0, mrpTotal = 0;
  const detailed = [] as { line: CartLine; product: Product }[];
  for (const l of lines) {
    const p = products.get(l.productId);
    if (!p) continue;
    sub += paise(p.price) * l.qty; mrpTotal += paise(p.mrp) * l.qty; count += l.qty;
    detailed.push({ line: l, product: p });
  }
  const subtotal = sub / 100;
  const deliveryFee = subtotal === 0 || subtotal >= DELIVERY.freeAbove ? 0 : DELIVERY.fee;
  const maxCoins = Math.max(0, Math.min(balance, Math.floor((subtotal * YGC.maxRedeemPct) / YGC.valueInr)));
  const coins = useCoins ? maxCoins : 0;
  return {
    detailed, count, subtotal, deliveryFee, maxCoins, coins,
    savings: (mrpTotal - sub) / 100,
    total: (sub + paise(deliveryFee) - paise(coins * YGC.valueInr)) / 100,
    belowMin: subtotal < DELIVERY.minOrder,
    toFreeDelivery: Math.max(0, DELIVERY.freeAbove - subtotal),
    freeProgress: Math.min(1, subtotal / DELIVERY.freeAbove),
  };
}
export function setQty(lines: CartLine[], productId: string, qty: number, maxQty = 20): CartLine[] {
  const q = Math.max(0, Math.min(maxQty, Math.floor(qty)));
  const rest = lines.filter((l) => l.productId !== productId);
  return q === 0 ? rest : [...rest, { productId, qty: q }];
}
export const qtyOf = (lines: CartLine[], id: string) => lines.find((l) => l.productId === id)?.qty ?? 0;
