export const formatINR = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
export const discountPct = (price: number, mrp: number) => (mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0);
export const unitLabel = (u: string) => (u === 'pc' ? 'each' : `per ${u}`);
export const timeAgo = (t: number, now = Date.now()) => {
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
