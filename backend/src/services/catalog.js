import { createHash } from 'node:crypto';
import { HttpError } from '../lib/http.js';

const PRODUCT_IMAGES = {
  produce: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80',
  fruits: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=80',
  staples: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80',
};
const PRODUCT_DETAILS = {
  'VEG-TOM': ['Ripe desi tomatoes for curries, salads, and everyday cooking.', 'Store at room temperature until ripe; refrigerate ripe tomatoes.'],
  'VEG-POT': ['Versatile potatoes for curries, snacks, and family meals.', 'Keep in a cool, dry, dark place away from direct sunlight.'],
  'VEG-ONI': ['Everyday red onions for cooking, salads, and garnishes.', 'Store in a cool, dry, well-ventilated place.'],
  'VEG-BRI': ['Round brinjal, ready for roasting, stuffing, or curries.', 'Refrigerate and use while firm.'],
  'VEG-CAU': ['A whole cauliflower head for roasting, curries, and stir-fries.', 'Refrigerate and keep dry until ready to use.'],
  'VEG-CHI': ['Green chillies to add heat and flavour to your cooking.', 'Refrigerate in a breathable bag and keep dry.'],
  'VEG-CAR': ['Crunchy carrots for snacks, salads, and cooked dishes.', 'Refrigerate in a sealed container or produce bag.'],
  'LEA-SPI': ['Fresh spinach leaves for dals, curries, and quick sautés.', 'Refrigerate unwashed and wash just before cooking.'],
  'LEA-COR': ['Coriander leaves for a fresh finishing touch to meals.', 'Trim the stems, wrap loosely, and refrigerate.'],
  'LEA-MET': ['Methi leaves for parathas, dals, and traditional recipes.', 'Refrigerate unwashed and use soon after purchase.'],
  'FRU-BAN': ['Sweet bananas for a quick snack or breakfast.', 'Keep at room temperature; refrigerate once fully ripe.'],
  'FRU-APP': ['Crisp Shimla apples for snacks, lunchboxes, and desserts.', 'Refrigerate to keep apples crisp.'],
  'FRU-LEM': ['Gondhoraj lemons to brighten drinks, marinades, and meals.', 'Refrigerate and keep dry.'],
  'EXO-BRO': ['Broccoli florets for steaming, roasting, and stir-fries.', 'Refrigerate and use while the florets are firm.'],
  'STA-RIC': ['Miniket rice for everyday meals and family cooking.', 'Store sealed in a cool, dry place.'],
  'STA-DAL': ['Masoor dal, a pantry staple for soups, dals, and everyday meals.', 'Store sealed in a cool, dry place.'],
};
const pub = (p) => ({
  id: p.id, sku: p.sku, name: p.name, category: p.category, unit: p.unit, price: p.price, mrp: p.mrp,
  stock: p.stock, emoji: p.emoji, imageUrl: PRODUCT_IMAGES[p.category === 'Fruits' ? 'fruits' : p.category === 'Staples' ? 'staples' : 'produce'],
  description: PRODUCT_DETAILS[p.sku]?.[0] ?? `${p.name} selected for everyday use.`,
  storage: PRODUCT_DETAILS[p.sku]?.[1] ?? 'Store in a cool, dry place and follow any instructions on the packaging.',
  highlights: [p.category, `Sold by ${p.unit}`, p.category === 'Staples' ? 'Pantry essential' : 'Fresh produce'],
  v: p.version,
});
const MAX_CHANGE_PCT = 0.30; // larger price moves need super_admin (price-control guard rail)

export class Catalog {
  constructor(store, bus) { this.store = store; this.bus = bus; this.cache = null; }

  /** Pre-serialised + ETag cached: the hot read path does no per-request work until a price changes. */
  async snapshot() {
    if (!this.cache || this.cache.expiresAt <= Date.now()) {
      const items = (await this.store.listActiveProducts()).map(pub);
      const categories = [...new Set(items.map((i) => i.category))];
      const body = JSON.stringify({ items, categories, serverTime: undefined });
      this.cache = { body, expiresAt: Date.now() + 1000, etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 16)}"` };
    }
    return this.cache;
  }
  get(id) { return this.store.getProduct(id); }

  /** Admin price/stock control. Every change is versioned, audited and pushed to live clients. */
  async update(actor, id, patch) {
    const p = await this.store.getProduct(id);
    if (!p) throw new HttpError(404, 'not_found', 'Product not found');
    const next = { price: patch.price ?? p.price, mrp: patch.mrp ?? p.mrp, stock: patch.stock ?? p.stock, active: patch.active ?? p.active };
    if (next.price <= 0 || next.price > next.mrp) throw new HttpError(422, 'validation_error', 'price must be > 0 and <= mrp', { field: 'price' });
    if (patch.price !== undefined && actor.role !== 'super_admin' && Math.abs(next.price - p.price) / p.price > MAX_CHANGE_PCT) {
      throw new HttpError(403, 'price_change_too_large', `Price changes above ${MAX_CHANGE_PCT * 100}% need super admin approval`);
    }
    const priceChanged = next.price !== p.price || next.mrp !== p.mrp;
    const history = priceChanged
      ? { productId: id, from: { price: p.price, mrp: p.mrp }, to: { price: next.price, mrp: next.mrp }, by: actor.id, at: Date.now() }
      : null;
    const updated = await this.store.updateProductWithHistory(id, p.version, next, history, actor.id, { id, patch });
    if (!updated) throw new HttpError(409, 'product_changed', 'Product changed while the update was being applied; retry');
    this.cache = null;
    this.bus.publish('prices', [pub(updated)]);
    return pub(updated);
  }
  /** Called by orders when stock moves. */
  stockChanged(products) { this.cache = null; this.bus.publish('prices', products.map(pub)); }
}
